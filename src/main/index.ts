import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'
import { DMXEngine } from '../shared/dmx'
import { serialProtocolForDmxPort } from '../shared/dmxPorts'
import type { DmxPortInfo } from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOWS_DIR = path.join(app.getPath('userData'), 'shows')

if (!fs.existsSync(SHOWS_DIR)) {
  fs.mkdirSync(SHOWS_DIR, { recursive: true })
}

let mainWindow: BrowserWindow | null = null
let dmxEngine: DMXEngine

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
    frame: false
  })

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// DMX port handling
ipcMain.handle('get-dmx-ports', async (): Promise<DmxPortInfo[]> => dmxEngine.listPorts())

ipcMain.handle(
  'set-dmx-port',
  async (_, portPath: string) => {
    try {
      const device = (await dmxEngine.listPorts()).find((port) => port.path === portPath)
      if (!device) throw new Error(`USB device ${portPath} is no longer available. Scan again.`)

      await dmxEngine.connect(portPath, serialProtocolForDmxPort(device))
      return { success: true, status: dmxEngine.getStatus() }
    } catch (e: any) {
      return { success: false, error: e.message, status: dmxEngine.getStatus() }
    }
  }
)

ipcMain.handle('connect-artnet', async (_, host: string, universe?: number) => {
  try {
    await dmxEngine.connectArtNet(host, universe ?? 0)
    return { success: true, status: dmxEngine.getStatus() }
  } catch (e: any) {
    return { success: false, error: e.message, status: dmxEngine.getStatus() }
  }
})

ipcMain.handle('get-dmx-status', async () => dmxEngine.getStatus())

ipcMain.handle('get-channels', async () => Array.from(dmxEngine.snapshot()))

ipcMain.handle('disconnect-dmx', async () => {
  await dmxEngine.disconnect()
  return { success: true, status: dmxEngine.getStatus() }
})

// Scene/Show handling
ipcMain.handle('load-show', async (_, showPath?: string) => {
  if (!showPath) return { success: false, error: 'No path' }
  try {
    const data = fs.readFileSync(showPath, 'utf-8')
    return { success: true, data: JSON.parse(data), path: showPath }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

function safeShowFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]+/g, '').replace(/\s+/g, '-').toLowerCase() || `show-${Date.now()}`
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
    return { success: true, data: JSON.parse(data), path: showPath }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('save-show', async (_, data: any, targetPath?: string) => {
  try {
    const filePath =
      targetPath || path.join(SHOWS_DIR, `${safeShowFileName(data.name || '')}.json`)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  return { success: true, path: filePath }
})

ipcMain.handle('list-shows', async () => {
  try {
    const files = fs.readdirSync(SHOWS_DIR).filter((f) => f.endsWith('.json'))
    return files
      .map((f) => {
        const fullPath = path.join(SHOWS_DIR, f)
        const stat = fs.statSync(fullPath)
        let name = f.replace(/\.json$/, '')
        try {
          const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
          if (typeof parsed?.name === 'string' && parsed.name.trim()) name = parsed.name.trim()
        } catch {
          /* fall back to file name */
        }
        return { name, path: fullPath, updatedAt: stat.mtimeMs }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
})

ipcMain.handle('delete-show', async (_, showPath: string) => {
  try {
    fs.unlinkSync(showPath)
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