import { app, BrowserWindow, ipcMain, dialog, session, Menu, nativeImage, utilityProcess, type UtilityProcess, type MenuItemConstructorOptions } from 'electron'
import { migrateShow } from '../shared/migrations'
import { usbOnlyStatus } from '../shared/outputSettings'
import { renameProjectFile, duplicateProjectFile, deleteProjectFile } from '../shared/projectFiles'
import { normalizeLiveWindows, LIVE_WINDOW_COMMANDS, type LiveWindowSpec } from '../shared/liveWindows'
import { autoUpdater } from 'electron-updater'
import { TITLE_BAR_OVERLAY_MAIN, titleBarOverlayForScreen, type TitleBarOverlayMode } from './titleBarOverlay'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'
import * as os from 'os'
import extract from 'extract-zip'
import { DMXEngine } from '../shared/dmx'
import type { NdiRegionColour, NdiSourceInfo } from '../shared/ndiAmbience'
import type { DmxPortInfo, SerialDmxProtocol } from '../shared/types'
import { menuGroupsFor } from '../shared/menuModel'
import { importOflFixture, isOflFixture, mergeOflLibraries, duplicateProfileAsCustom, upsertCustomProfile, deleteCustomProfile, preservesUserLibrary, shouldClearBundledOflCache } from '../shared/oflFixtureFormat'
import { validateProfile } from '../shared/profileValidation'
import { BUILTIN_PROFILES } from '../shared/fixtureProfiles'
import type { FixtureProfile } from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Capture the established data directory before changing the development
// runtime name from Electron to OpenLights. This keeps every existing show
// in place while fixing the macOS menu-bar and Dock identity.
const USER_DATA_DIR = app.getPath('userData')
app.setName('OpenLights')
const APP_ICON = path.join(app.getAppPath(), 'assets/branding/openlights-icon.png')
const SHOWS_DIR = path.join(USER_DATA_DIR, 'shows')
const OFL_LIBRARY_FILE = path.join(USER_DATA_DIR, 'ofl-library.json')

if (!fs.existsSync(SHOWS_DIR)) {
  fs.mkdirSync(SHOWS_DIR, { recursive: true })
}

let mainWindow: BrowserWindow | null = null
let dmxEngine: DMXEngine
const liveWindows = new Map<number, { window: BrowserWindow; spec: LiveWindowSpec }>()
const liveWindowsFile = path.join(USER_DATA_DIR, 'live-windows.json')
let liveState: Record<string, unknown> = {}
let quitting = false
let dmxShutdownDone = false
/** Stop the DMX engine (frame pump, reconnect timer, serial port) so no live handle keeps the process alive after quit is requested. Best-effort and non-blocking: the port close is async, and Electron exits regardless once quit proceeds. */
function shutdownDmx() {
  if (!dmxEngine || dmxShutdownDone) return
  dmxShutdownDone = true
  void dmxEngine.shutdown().catch(() => {})
}

// --- NDI Ambience worker (UtilityProcess) ---------------------------------
// The worker (src/main/ndi-worker.ts) owns the native NDI code — discovery,
// receive, edge sampling — so a crash there cannot take the lighting app
// down. Main only forwards messages between the worker and the renderer.
// The worker is forked lazily on the first NDI call and lives until quit.
let ndiWorker: UtilityProcess | null = null
let ndiWorkerReady: Promise<string> | null = null
let ndiPendingList: { resolve: (sources: NdiSourceInfo[]) => void; reject: (error: Error) => void } | null = null
let ndiListPromise: Promise<NdiSourceInfo[]> | null = null
let ndiPendingStart: { resolve: () => void; reject: (error: Error) => void } | null = null
let ndiLastVersion: string | null = null

function shutdownNdi() {
  if (!ndiWorker) return
  const worker = ndiWorker
  ndiWorker = null
  ndiWorkerReady = null
  // Kill the worker immediately on quit rather than posting 'shutdown'
  // and waiting for it to exit. The worker's native NDI cleanup
  // (grandi.destroy()) can hang, and a surviving child process keeps the
  // macOS Dock icon alive even after the main process exits — the user
  // then has to Force Quit. None of the worker's state matters when the
  // app is going away, so there is nothing to preserve by being gentle.
  try {
    worker.kill()
  } catch { /* Already gone. */ }
}

function ensureNdiWorker(): UtilityProcess {
  if (ndiWorker) return ndiWorker
  const worker = utilityProcess.fork(path.join(__dirname, 'ndi-worker.js'))
  ndiWorker = worker
  // A UtilityProcess emits 'error' if the worker hits a fatal error.
  // With no listener the emission throws in the main process and can
  // kill the event loop — the same class of hang as the DMX port close
  // (Jake, 24 Nov 2026 — Mac quit hang). The 'exit' handler below does
  // the real cleanup; this only stops the event from throwing. The
  // worker exits itself on parentPort close at quit.
  worker.on('error', (type, location) => {
    console.error('[ndi] worker error:', type, location)
  })
  ndiWorkerReady = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('NDI worker did not start in time.')), 15000)
    timer.unref()
    worker.on('message', (message: unknown) => {
      if (!message || typeof message !== 'object') return
      const m = message as { type?: string; version?: string; message?: string; regions?: NdiRegionColour[]; sources?: NdiSourceInfo[]; at?: number; source?: NdiSourceInfo; framesReceived?: number; connections?: number; lastFrameAt?: number | null; startedAt?: number; width?: number; height?: number; data?: Uint8Array }
      if (m.type === 'ready') {
        clearTimeout(timer)
        ndiLastVersion = m.version ?? ''
        resolve(m.version ?? '')
      } else if (m.type === 'sources') {
        if (ndiPendingList) {
          ndiPendingList.resolve(m.sources ?? [])
          ndiPendingList = null
        }
      } else if (m.type === 'started') {
        if (ndiPendingStart) {
          ndiPendingStart.resolve()
          ndiPendingStart = null
        }
        mainWindow?.webContents.send('ndi:status', { state: 'receiving', source: m.source })
      } else if (m.type === 'stopped') {
        mainWindow?.webContents.send('ndi:status', { state: 'stopped' })
      } else if (m.type === 'regions') {
        mainWindow?.webContents.send('ndi:regions', m.regions ?? [], m.at ?? Date.now())
      } else if (m.type === 'frame') {
        // Live video preview on the Screen (Jake, 23 Nov 2026):
        // JPEG-encode the 360p BGRA thumbnail and hand the renderer a
        // data URL — a few tens of KB, five times a second. A bad
        // thumbnail is dropped silently: the region colours above are
        // the lighting, the picture is a bonus.
        try {
          const width = m.width ?? 0
          const height = m.height ?? 0
          const data = m.data
          if (data && width > 0 && height > 0 && data.length >= width * height * 4) {
            const jpeg = nativeImage.createFromBitmap(Buffer.from(data), { width, height }).toJPEG(70)
            mainWindow?.webContents.send('ndi:frame', `data:image/jpeg;base64,${jpeg.toString('base64')}`)
          }
        } catch { /* Drop the frame; the next tick sends another. */ }
      } else if (m.type === 'receive-status') {
        mainWindow?.webContents.send('ndi:receive-status', {
          framesReceived: m.framesReceived ?? 0,
          connections: m.connections ?? 0,
          lastFrameAt: m.lastFrameAt ?? null,
          startedAt: m.startedAt ?? Date.now()
        })
      } else if (m.type === 'error') {
        const error = new Error(m.message ?? 'NDI error')
        if (ndiPendingList) {
          ndiPendingList.reject(error)
          ndiPendingList = null
        }
        if (ndiPendingStart) {
          ndiPendingStart.reject(error)
          ndiPendingStart = null
        }
        mainWindow?.webContents.send('ndi:status', { state: 'error', message: m.message })
      }
    })
    worker.on('exit', (code) => {
      if (ndiWorker !== worker) return
      ndiWorker = null
      ndiWorkerReady = null
      ndiLastVersion = null
      const error = new Error(`NDI worker exited (code ${code}).`)
      if (ndiPendingList) {
        ndiPendingList.reject(error)
        ndiPendingList = null
      }
      if (ndiPendingStart) {
        ndiPendingStart.reject(error)
        ndiPendingStart = null
      }
      clearTimeout(timer)
      reject(error)
      mainWindow?.webContents.send('ndi:status', { state: 'error', message: error.message })
    })
  })
  // A rejected ready promise must not become an unhandled rejection when
  // nobody awaited it yet — the next NDI call re-forks and reports it.
  void ndiWorkerReady.catch(() => {})
  return worker
}

async function ndiVersion(): Promise<{ available: boolean; version?: string; error?: string }> {
  if (ndiLastVersion) return { available: true, version: ndiLastVersion }
  try {
    ensureNdiWorker()
    const version = await ndiWorkerReady!
    return { available: true, version }
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function ndiListSources(): Promise<{ sources: NdiSourceInfo[]; error?: string }> {
  try {
    const { available, error } = await ndiVersion()
    if (!available) return { sources: [], error: error ?? 'NDI is unavailable.' }
    if (!ndiListPromise) {
      // One discovery at a time — a second call while one is running
      // shares its result instead of starting a second finder.
      ndiListPromise = new Promise<NdiSourceInfo[]>((resolve, reject) => {
        ndiPendingList = { resolve, reject }
      })
      const timer = setTimeout(() => {
        if (ndiPendingList) {
          ndiPendingList.reject(new Error('NDI discovery timed out.'))
          ndiPendingList = null
        }
      }, 10000)
      timer.unref()
      void ndiListPromise.then(
        () => {
          clearTimeout(timer)
          ndiListPromise = null
        },
        () => {
          clearTimeout(timer)
          ndiListPromise = null
        }
      )
      ensureNdiWorker().postMessage({ type: 'list' })
    }
    const sources = await ndiListPromise
    return { sources }
  } catch (error) {
    return { sources: [], error: error instanceof Error ? error.message : String(error) }
  }
}

async function ndiStart(source: NdiSourceInfo): Promise<{ success: boolean; error?: string }> {
  try {
    const { available, error } = await ndiVersion()
    if (!available) return { success: false, error: error ?? 'NDI is unavailable.' }
    const promise = new Promise<void>((resolve, reject) => {
      ndiPendingStart = { resolve, reject }
    })
    const timer = setTimeout(() => {
      if (ndiPendingStart) {
        ndiPendingStart.reject(new Error('Connecting to the NDI source timed out.'))
        ndiPendingStart = null
      }
    }, 15000)
    timer.unref()
    ensureNdiWorker().postMessage({ type: 'start', source })
    await promise
    clearTimeout(timer)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function ndiStop() {
  try {
    ndiWorker?.postMessage({ type: 'stop' })
  } catch { /* Worker gone — nothing is receiving. */ }
}

app.on('before-quit', () => {
  quitting = true
  // Tell the renderer the app itself is quitting (Cmd+Q / menu Quit), so
  // the ProjectBar's beforeunload prompt does not veto the quit and park
  // the close behind a Save/Discard modal. The 1.5s autosave is the
  // protection for unsaved work on this path; the modal still guards a
  // plain window close (red dot / title-bar close button).
  mainWindow?.webContents.send('app:quitting')
  shutdownDmx()
  shutdownNdi()
})
function saveLiveWindows() { fs.writeFileSync(liveWindowsFile, JSON.stringify([...liveWindows.values()].map(({ window, spec }) => ({ ...spec, width: window.getBounds().width, height: window.getBounds().height })))) }
function openLiveWindow(spec: LiveWindowSpec) {
  const window = new BrowserWindow({ width: spec.width, height: spec.height, minWidth: 640, minHeight: 480, title: 'OpenLights Live', icon: APP_ICON, webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  window.setMenuBarVisibility(false)
  const contentsId = window.webContents.id
  liveWindows.set(contentsId, { window, spec }); saveLiveWindows()
  if (process.env.NODE_ENV === 'development') void window.loadURL(`http://localhost:5173/?liveWindow=${encodeURIComponent(spec.id)}`)
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { liveWindow: spec.id } })
  window.on('resize', () => { if (!quitting) saveLiveWindows() })
  window.on('closed', () => { liveWindows.delete(contentsId); if (!quitting) saveLiveWindows() })
}
ipcMain.handle('window:fullscreen', (event) => { const window = BrowserWindow.fromWebContents(event.sender); if (window) window.setFullScreen(!window.isFullScreen()) })
ipcMain.handle('window:open-live', (_, pageId: string | null) => { const spec = { id: crypto.randomUUID(), pageId, width: 1000, height: 700 }; openLiveWindow(spec); return spec })
/**
 * The fixture library is no longer shipped in the repo (Jake, 20 Nov
 * 2026 — the OFL export's licence for bundling is unclear, and he does
 * not want to ship with any fixtures by default). The user downloads
 * the OFL export (.zip) from open-fixture-library.org and uploads it in
 * the app; it is merged into the user-data cache (ofl-library.json) and
 * that cache is the library from then on. The EP4 profile lives in
 * fixtures-github/ in the repo instead — not bundled, imported by hand
 * through the profile editor's Import JSON / OFL.
 */

/** Read every OFL fixture JSON under a folder (recursively) and convert it to a profile. */
function loadOflFolder(root: string): { profiles: FixtureProfile[]; skipped: number } {
  const jsonFiles: string[] = []
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) jsonFiles.push(target)
    }
  }
  visit(root)
  const manufacturerFile = jsonFiles.find((file) => path.basename(file).toLowerCase() === 'manufacturers.json')
  const manufacturers = manufacturerFile ? JSON.parse(fs.readFileSync(manufacturerFile, 'utf8')) as Record<string, { name?: string }> : {}
  const profiles: FixtureProfile[] = []
  let skipped = 0
  for (const file of jsonFiles) {
    if (file === manufacturerFile) continue
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
      if (!isOflFixture(raw)) { skipped++; continue }
      const manufacturerKey = typeof raw.manufacturerKey === 'string' ? raw.manufacturerKey : path.basename(path.dirname(file))
      const fixtureKey = typeof raw.fixtureKey === 'string' ? raw.fixtureKey : path.basename(file, '.json')
      profiles.push(importOflFixture(raw, { manufacturerKey, manufacturer: manufacturers[manufacturerKey]?.name, fixtureKey, preserveSource: false }))
    } catch { skipped++ }
  }
  // Stable order (readdir order is OS-dependent): manufacturer, then name.
  profiles.sort((a, b) => (a.manufacturer || '').localeCompare(b.manufacturer || '') || a.name.localeCompare(b.name))
  return { profiles, skipped }
}

const OFL_LIBRARY_META_FILE = path.join(USER_DATA_DIR, 'ofl-library.meta.json')
// What's on disk: 'upload' (a zip the user uploaded) or 'import' (the old
// folder import) mean the cache is the user's own library; 'bundled' is
// the pre-unbundling value, kept readable so the migration below can
// recognise and clear it; 'none' is a cache cleared by that migration.
type OflLibraryMeta = { source: string; fingerprint: string | null }
function readOflLibraryCache(): FixtureProfile[] | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(OFL_LIBRARY_FILE, 'utf8')) as unknown
    return Array.isArray(parsed) ? parsed as FixtureProfile[] : null
  } catch { return null }
}
function readOflLibraryMeta(): OflLibraryMeta | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(OFL_LIBRARY_META_FILE, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const source = (parsed as { source?: unknown }).source
    const fingerprint = (parsed as { fingerprint?: unknown }).fingerprint
    return typeof source === 'string' ? { source, fingerprint: typeof fingerprint === 'string' ? fingerprint : null } : null
  } catch { return null }
}
function writeOflLibrary(profiles: FixtureProfile[], meta: OflLibraryMeta): void {
  fs.writeFileSync(OFL_LIBRARY_FILE, JSON.stringify(profiles))
  fs.writeFileSync(OFL_LIBRARY_META_FILE, JSON.stringify(meta))
}
let oflLibraryMemo: FixtureProfile[] | null = null
/**
 * The OFL library as it stands right now: the user-data cache, or
 * nothing on a fresh install — nothing ships with the app any more.
 * A cache seeded from the old bundled fixtures/ folder is cleared the
 * first time this runs after the unbundling (Jake, 20 Nov 2026): it
 * would otherwise keep serving stale bundle defaults (blue 0) forever
 * once the folder is gone. A library the user uploaded themselves
 * stands as-is. Memoised per process; the import and duplicate handlers
 * invalidate it when they write.
 */
function getOflLibrary(): FixtureProfile[] {
  if (oflLibraryMemo) return oflLibraryMemo
  const meta = readOflLibraryMeta()
  const cached = readOflLibraryCache()
  if (shouldClearBundledOflCache(meta, cached)) {
    try { fs.unlinkSync(OFL_LIBRARY_FILE) } catch { /* already gone */ }
    writeOflLibrary([], { source: 'none', fingerprint: null })
    oflLibraryMemo = []
    return []
  }
  oflLibraryMemo = cached ?? []
  return oflLibraryMemo
}

ipcMain.handle('ofl-library:list', () => getOflLibrary())
ipcMain.handle('ofl-library:import-zip', async () => {
  const selection = await dialog.showOpenDialog(mainWindow!, { title: 'Choose the OFL fixture library (.zip)', filters: [{ name: 'OFL fixture library', extensions: ['zip'] }], properties: ['openFile'] })
  if (selection.canceled || !selection.filePaths[0]) return { success: false, canceled: true, profiles: [] }
  const zipPath = selection.filePaths[0]
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openlights-ofl-'))
  try {
    await extract(zipPath, { dir: tmpDir })
    const { profiles, skipped } = loadOflFolder(tmpDir)
    if (!profiles.length) return { success: false, canceled: false, profiles: [], error: 'No OFL fixture files found in that zip' }
    // Merge, don't replace: fresh base records win, new ones are added,
    // and custom-tagged records are never touched (mergeOflLibraries).
    const merged = mergeOflLibraries(profiles, getOflLibrary())
    oflLibraryMemo = merged
    writeOflLibrary(merged, { source: 'upload', fingerprint: null })
    return { success: true, canceled: false, profiles: merged, imported: profiles.length, skipped }
  } catch (error) { return { success: false, canceled: false, profiles: [], error: error instanceof Error ? error.message : String(error) } }
  finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best effort */ } }
})
ipcMain.handle('ofl-library:duplicate', (_, profileId: string) => {
  try {
    const library = getOflLibrary()
    const original = library.find((p) => p.id === profileId)
    if (!original) return { success: false, profiles: library, error: 'Fixture not found in the library' }
    const copy = duplicateProfileAsCustom(original)
    const next = [...library, copy]
    oflLibraryMemo = next
    const meta = readOflLibraryMeta()
    writeOflLibrary(next, meta && preservesUserLibrary(meta.source) ? { source: meta.source, fingerprint: meta.fingerprint } : { source: 'none', fingerprint: null })
    return { success: true, profiles: next, profile: copy }
  } catch (error) { return { success: false, profiles: getOflLibrary(), error: error instanceof Error ? error.message : String(error) } }
})
// Custom fixtures are GLOBAL (Jake, 20 Nov 2026 — all duplicates and
// Build Your Own fixtures live in the library database, available in
// every show): the profile editor saves them here, tagged custom, and
// the renderer re-reads the library so the patch dialog lists them
// under User Fixtures in any show. A base library record is never
// overwritten — a clash means the caller must mint a fresh custom id
// (asNewCustom) — and a zip upload never touches a custom record
// (mergeOflLibraries), so the saved copy is safe from then on. The
// meta source becomes 'custom' when the library gains its first user
// fixture, so the bundled-cache migration never clears it.
ipcMain.handle('ofl-library:save-custom', (_, profile: FixtureProfile) => {
  try {
    const errors = validateProfile(profile)
    if (errors.length) return { success: false, profiles: getOflLibrary(), error: errors.join('; ') }
    if (BUILTIN_PROFILES.some((p) => p.id === profile.id)) return { success: false, profiles: getOflLibrary(), error: 'Duplicate a built-in profile before editing' }
    const result = upsertCustomProfile(getOflLibrary(), profile)
    if ('error' in result) return { success: false, profiles: getOflLibrary(), error: result.error }
    oflLibraryMemo = result.profiles
    const meta = readOflLibraryMeta()
    writeOflLibrary(result.profiles, meta && preservesUserLibrary(meta.source) ? { source: meta.source, fingerprint: meta.fingerprint } : { source: 'custom', fingerprint: null })
    return { success: true, profiles: result.profiles, profile: result.profile }
  } catch (error) { return { success: false, profiles: getOflLibrary(), error: error instanceof Error ? error.message : String(error) } }
})
ipcMain.handle('ofl-library:delete-custom', (_, profileId: string) => {
  try {
    const result = deleteCustomProfile(getOflLibrary(), profileId)
    if ('error' in result) return { success: false, profiles: getOflLibrary(), error: result.error }
    oflLibraryMemo = result.profiles
    const meta = readOflLibraryMeta()
    writeOflLibrary(result.profiles, meta ?? { source: 'none', fingerprint: null })
    return { success: true, profiles: result.profiles }
  } catch (error) { return { success: false, profiles: getOflLibrary(), error: error instanceof Error ? error.message : String(error) } }
})
ipcMain.on('live-window:state', (event, state) => { if (event.sender.id !== mainWindow?.webContents.id) return; liveState = state; for (const { window } of liveWindows.values()) window.webContents.send('live-window:state', state) })
ipcMain.on('live-window:request', (event) => { if (liveWindows.has(event.sender.id)) event.sender.send('live-window:state', liveState) })
ipcMain.on('live-window:command', (event, command: string, args: unknown[]) => { if (liveWindows.has(event.sender.id) && (LIVE_WINDOW_COMMANDS as readonly string[]).includes(command) && Array.isArray(args)) mainWindow?.webContents.send('live-window:command', command, args) })

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: 'OpenLights',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    // macOS: hiddenInset draws the NATIVE traffic lights (red/yellow/
    // green) at the top-left of the header — the 'hidden' style used
    // before showed no lights at all on Jake's Mac (checked against his
    // screenshots: the reserved left space sat empty), so the only close
    // path was the renderer's own purple buttons. hiddenInset is the
    // canonical frameless-window option for traffic lights.
    // trafficLightPosition centres the 12px lights in the 50px header
    // ((50 - 12) / 2 = 19) and starts them at the standard 20px inset;
    // the header's .top-bar-mac spacing (patch icon at 80px, title at
    // 104px) already clears lights ending at ~72px, so no CSS change
    // was needed. Windows/Linux keep the native caption buttons via
    // the title bar overlay, restyled to the header itself: LightKey
    // grey #444345 with #d2d2d2 glyphs, at the header's exact 50px
    // height. The app uses box-sizing: border-box (index.css), so the
    // header's min-height 50 already includes its 5px padding and 1px
    // border — the earlier 61px (50 + 5 + 5 + 1) double-counted them
    // and the overlay stuck out ~11px below the header into the preset
    // palette (Jake, 19 Nov 2026, screenshot image-8.png).
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 20, y: 19 } : undefined,
    titleBarOverlay: process.platform === 'darwin' ? false : TITLE_BAR_OVERLAY_MAIN
  })
  // The macOS app menu (Quit / Cmd+Q) comes first on darwin via
  // menuGroupsFor; Windows and Linux get exactly WINDOWS_MENU.
  const template: MenuItemConstructorOptions[] = menuGroupsFor(process.platform, app.name).map((group) => ({
    label: group.label,
    submenu: group.items.map((item) => item.type === 'separator' ? { type: 'separator' } : item.role ? { label: item.label, role: item.role } : { label: item.label, click: () => item.command && mainWindow?.webContents.send('menu:command', item.command) })
  }))
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  mainWindow.setMenuBarVisibility(true)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    // Don't leave orphan Live windows behind with no main window: closing
    // them lets window-all-closed fire below, which quits the app.
    for (const { window } of [...liveWindows.values()]) window.close()
  })
}

// The window close path stays: ProjectBar uses it when switching
// projects (its beforeunload guard decides whether the close may go
// ahead). Minimize/maximize/quit had no other callers besides the
// renderer's own window-control buttons, which are gone — macOS has
// the native traffic lights and Windows/Linux have the title bar
// overlay, and Cmd+Q / menu Quit still reaches before-quit above.
ipcMain.on('window:close', () => mainWindow?.close())

// The setup wizard is a full-window modal whose page is purple, not the
// main window's grey header — so while it is open the native caption
// buttons must blend with the wizard page (see titleBarOverlay.ts). The
// Project Browser is the same shape: a full-window modal over the app
// background purple, so while it is open the buttons must blend with
// that instead (Jake, 23 Nov 2026, screenshot image-ff69c11b.png — the
// grey strip over the purple welcome screen). The renderer reports which
// surface is showing; on macOS this is a no-op (the native traffic
// lights cannot be recoloured and the wizard bar clears them with
// padding instead). An unknown mode falls back to the main grey inside
// titleBarOverlayForScreen, so a stray value can never leave the
// window without an overlay.
ipcMain.on('window:set-titlebar-overlay', (_event, mode: unknown) => {
  if (process.platform === 'darwin' || !mainWindow) return
  mainWindow.setTitleBarOverlay(titleBarOverlayForScreen(mode as TitleBarOverlayMode))
})

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(nativeImage.createFromPath(APP_ICON))
  // Grant MIDI permission so Web MIDI API works in the renderer
  const midiAllowed = (permission: string) => permission === 'midi' || permission === 'midiSysex'
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(midiAllowed(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return midiAllowed(permission)
  })

  dmxEngine = new DMXEngine()

  // Auto-updates (only meaningful in a packaged build)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify()
    autoUpdater.on('update-downloaded', () => {
      autoUpdater.quitAndInstall()
    })
  }

  createWindow()
  try { const saved = normalizeLiveWindows(JSON.parse(fs.readFileSync(liveWindowsFile, 'utf8'))); for (const spec of saved) openLiveWindow(spec) } catch { /* No saved windows yet. */ }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Deliberate departure from the macOS stay-in-Dock convention: closing the
// last window quits OpenLights on every platform, including darwin. Jake
// expects the app to quit when its window closes; the old darwin exception
// left it running in the Dock with no window, so the only way out was
// Force Quit. The activate handler above still recreates the window if the
// app is re-activated while running.
app.on('window-all-closed', () => {
  app.quit()
})

// Last line of defence for the macOS quit hang: if a native handle (a
// wedged DMX serial port, or a child process that ignored its kill) still
// keeps the main process alive after the normal quit sequence, force the
// process down. The timer is deliberately ref'd (no .unref()) so it fires
// even when nothing else is keeping the event loop alive. In a healthy
// quit the process exits before it fires and the timer disappears with it.
// (Jake, 25 Nov 2026 — quit-fix branch.)
app.on('will-quit', () => {
  setTimeout(() => {
    app.exit(0)
  }, 2000)
})

// Quit notes (Jake, 24 Nov 2026 — Mac quit hang): app.quit() runs the
// whole quit sequence but does NOT terminate the process while a native
// handle is still live. Proven in the VM with Electron 45 + serialport:
// closing a DMX serial port while a write is stuck (the device stopped
// draining) cancels the write, and serialport emits an 'error' event
// (BindingsError: Canceled) on the port while closing. With no 'error'
// listener that emission throws inside the stream machinery and kills
// the main process's event loop — the close never completes, no timer
// fires, and app.exit(0) / process.exit(0) in will-quit do NOT terminate
// the process either (all three were tried in the VM; the 'exit' event
// fires but the process lives on, and it ignores SIGTERM too, so only
// Force Quit works — exactly Jake's symptoms). The protection is upstream
// of quit: DMXEngine attaches an 'error' listener when it connects
// (src/shared/dmx.ts), so the close completes in ~100ms even with a
// wedged device (tests/dmx-wedged-port.test.ts), and the NDI worker has
// an 'error' listener below for the same reason. There is deliberately
// NO force-exit here — in the frozen state nothing in-process can rescue
// the process, and in the healthy state the loop drains on its own.

// DMX port handling
ipcMain.handle('get-dmx-ports', async (): Promise<DmxPortInfo[]> => dmxEngine.listPorts())

ipcMain.handle(
  'set-dmx-port',
  async (_, portPath: string, protocol: SerialDmxProtocol) => {
    try {
      const device = (await dmxEngine.listPorts()).find((port) => port.path === portPath)
      if (!device) throw new Error(`USB device ${portPath} is no longer available. Scan again.`)

      if (protocol !== 'open-dmx-usb' && protocol !== 'enttec-usb-pro') throw new Error('Choose a supported USB-DMX interface type.')
      await dmxEngine.connect(portPath, protocol)
      return { success: true, status: dmxEngine.getStatus() }
    } catch (e: any) {
      return { success: false, error: e.message, status: dmxEngine.getStatus() }
    }
  }
)

ipcMain.handle('get-dmx-status', async () => usbOnlyStatus(dmxEngine.getStatus()))

ipcMain.handle('get-channels', async () => Array.from(dmxEngine.snapshot()))

ipcMain.handle('disconnect-dmx', async () => {
  await dmxEngine.disconnect()
  return { success: true, status: dmxEngine.getStatus() }
})

// NDI Ambience — the renderer talks to the worker through main; regions
// arrive as 'ndi:regions' events, status changes as 'ndi:status'.
ipcMain.handle('ndi:version', async () => ndiVersion())
ipcMain.handle('ndi:list', async () => ndiListSources())
ipcMain.handle('ndi:start', async (_, source: NdiSourceInfo) => ndiStart(source))
ipcMain.handle('ndi:stop', async () => {
  ndiStop()
  return { success: true }
})

// Show handling
ipcMain.handle('rename-show', async (_, showPath: string, name: string) => {
  try { return { success: true, path: renameProjectFile(showPath, name) } }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) } }
})
ipcMain.handle('print-patch', async (_, html: string) => {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return new Promise((resolve) => printWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => { printWindow.close(); resolve({ success, error: reason }) }))
})
ipcMain.handle('duplicate-show', async (_, showPath: string) => {
  try { return { success: true, path: duplicateProjectFile(showPath) } }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) } }
})
ipcMain.handle('load-show', async (_, showPath?: string) => {
  if (!showPath) return { success: false, error: 'No path' }
  try {
    const data = fs.readFileSync(showPath, 'utf-8')
    // The migration heals stale profile defaults against the OFL library
    // — hand it the current library, or an OFL fixture loads dark and
    // only the renderer's later re-heal (same library, same staleness)
    // could save it. Q3, 20 Nov 2026.
    return { success: true, data: migrateShow(JSON.parse(data), getOflLibrary()), path: showPath }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

function safeShowFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '') || `Show ${Date.now()}`
}

ipcMain.handle('open-show', async () => {
  if (!mainWindow) return { success: false, error: 'No window' }
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    defaultPath: SHOWS_DIR,
    filters: [{ name: 'OpenLights Show', extensions: ['json'] }]
  })
  if (canceled || filePaths.length === 0) return { success: false, canceled: true }
  try {
    const showPath = filePaths[0]
    const data = fs.readFileSync(showPath, 'utf-8')
    return { success: true, data: migrateShow(JSON.parse(data), getOflLibrary()), path: showPath }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('save-show', async (_, data: any, targetPath?: string) => {
  try {
    const filePath =
      targetPath || path.join(SHOWS_DIR, `${safeShowFileName(data.name || '')}.json`)
    fs.writeFileSync(filePath, JSON.stringify({ ...data, name: path.parse(filePath).name }, null, 2))
    return { success: true, path: filePath }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('save-show-as', async (_, data: any, suggestedPath?: string) => {
  if (!mainWindow) return { success: false, error: 'No window' }
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedPath || path.join(SHOWS_DIR, `${safeShowFileName(data.name || '')}.json`),
    filters: [{ name: 'OpenLights Show', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { success: false, canceled: true }
  fs.writeFileSync(filePath, JSON.stringify({ ...data, name: path.parse(filePath).name }, null, 2))
  return { success: true, path: filePath }
})

ipcMain.handle('list-shows', async () => {
  try {
    const files = fs.readdirSync(SHOWS_DIR).filter((f) => f.endsWith('.json'))
    return files
      .map((f) => {
        const fullPath = path.join(SHOWS_DIR, f)
        const stat = fs.statSync(fullPath)
        const name = path.parse(f).name
        const preview = migrateShow(JSON.parse(fs.readFileSync(fullPath, 'utf-8')))
        return { name, path: fullPath, updatedAt: stat.mtimeMs, schemaVersion: preview.schemaVersion }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
})

ipcMain.handle('delete-show', async (_, showPath: string) => {
  try {
    deleteProjectFile(showPath)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// Audio file handling — returns the data URL so the renderer can decode it
ipcMain.handle('load-audio', async (_, requestedPath?: string) => {
  let filePath = requestedPath
  if (!filePath) {
    if (!mainWindow) return { success: false, error: 'No window' }
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }]
    })
    if (canceled || filePaths.length === 0) return { success: false, canceled: true }
    filePath = filePaths[0]
  }
  try {
    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).replace('.', '').toLowerCase()
    const mime =
      ext === 'mp3' ? 'audio/mpeg'
      : ext === 'wav' ? 'audio/wav'
      : ext === 'm4a' ? 'audio/mp4'
      : ext === 'aac' ? 'audio/aac'
      : ext === 'flac' ? 'audio/flac'
      : ext === 'ogg' ? 'audio/ogg'
      : 'audio/mpeg'
    return {
      success: true,
      name: path.basename(filePath),
      path: filePath,
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// Blackout
ipcMain.handle('blackout', async () => {
  dmxEngine.blackout()
  return { success: true }
})

// DMX channel setting (from renderer)
ipcMain.on('set-channels', (_, values: Record<number, number>) => {
  for (const [channel, value] of Object.entries(values)) {
    dmxEngine.setChannel(Number(channel), value)
  }
})
// Test output takes precedence over normal playback until the panel is closed.
ipcMain.handle('dmx-test-start', () => { dmxEngine.startTest() })
ipcMain.handle('dmx-test-set', (_, channel: number, value: number) => { dmxEngine.setTestChannel(channel, value) })
ipcMain.handle('dmx-test-stop', () => { dmxEngine.stopTest() })
