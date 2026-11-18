import { app, BrowserWindow, ipcMain, dialog, session, Menu, type MenuItemConstructorOptions } from 'electron'
import { migrateShow } from '../shared/migrations'
import { usbOnlyStatus } from '../shared/outputSettings'
import { renameProjectFile, duplicateProjectFile, deleteProjectFile } from '../shared/projectFiles'
import { normalizeLiveWindows, LIVE_WINDOW_COMMANDS, type LiveWindowSpec } from '../shared/liveWindows'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'
import { DMXEngine } from '../shared/dmx'
import type { DmxPortInfo, SerialDmxProtocol } from '../shared/types'
import { WINDOWS_MENU } from '../shared/menuModel'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOWS_DIR = path.join(app.getPath('userData'), 'shows')

if (!fs.existsSync(SHOWS_DIR)) {
  fs.mkdirSync(SHOWS_DIR, { recursive: true })
}

let mainWindow: BrowserWindow | null = null
let dmxEngine: DMXEngine
const liveWindows = new Map<number, { window: BrowserWindow; spec: LiveWindowSpec }>()
const liveWindowsFile = path.join(app.getPath('userData'), 'live-windows.json')
let liveState: Record<string, unknown> = {}
let quitting = false
let dmxShutdownDone = false
/** Stop the DMX engine (frame pump, reconnect timer, serial port) so no live handle keeps the process alive after quit is requested. Best-effort and non-blocking: the port close is async, and Electron exits regardless once quit proceeds. */
function shutdownDmx() {
  if (!dmxEngine || dmxShutdownDone) return
  dmxShutdownDone = true
  void dmxEngine.shutdown().catch(() => {})
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
})
function saveLiveWindows() { fs.writeFileSync(liveWindowsFile, JSON.stringify([...liveWindows.values()].map(({ window, spec }) => ({ ...spec, width: window.getBounds().width, height: window.getBounds().height })))) }
function openLiveWindow(spec: LiveWindowSpec) {
  const window = new BrowserWindow({ width: spec.width, height: spec.height, minWidth: 640, minHeight: 480, title: 'OpenLights Live', webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
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
ipcMain.on('live-window:state', (event, state) => { if (event.sender.id !== mainWindow?.webContents.id) return; liveState = state; for (const { window } of liveWindows.values()) window.webContents.send('live-window:state', state) })
ipcMain.on('live-window:request', (event) => { if (liveWindows.has(event.sender.id)) event.sender.send('live-window:state', liveState) })
ipcMain.on('live-window:command', (event, command: string, args: unknown[]) => { if (liveWindows.has(event.sender.id) && (LIVE_WINDOW_COMMANDS as readonly string[]).includes(command) && Array.isArray(args)) mainWindow?.webContents.send('live-window:command', command, args) })

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? false : { color: '#3a1b47', symbolColor: '#b79bc4', height: 72 }
  })
  const template: MenuItemConstructorOptions[] = WINDOWS_MENU.map((group) => ({
    label: group.label,
    submenu: group.items.map((item) => item.role ? { label: item.label, role: item.role } : { label: item.label, click: () => item.command && mainWindow?.webContents.send('menu:command', item.command) })
  }))
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  mainWindow.setMenuBarVisibility(true)

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
  })

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

ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

app.whenReady().then(async () => {
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
    return { success: true, data: migrateShow(JSON.parse(data)), path: showPath }
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
    return { success: true, data: migrateShow(JSON.parse(data)), path: showPath }
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
