import { ipcRenderer, contextBridge } from 'electron'

// Expose protected methods that the renderer can call
contextBridge.exposeInMainWorld('electronAPI', {
  loadShow: (path: string) => ipcRenderer.invoke('load-show', path),
  openShow: () => ipcRenderer.invoke('open-show'),
  saveShow: (data: any, path?: string) => ipcRenderer.invoke('save-show', data, path),
  saveShowAs: (data: any, suggestedPath?: string) =>
    ipcRenderer.invoke('save-show-as', data, suggestedPath),
  listShows: () => ipcRenderer.invoke('list-shows'),
  deleteShow: (path: string) => ipcRenderer.invoke('delete-show', path),
  loadAudio: (path?: string) => ipcRenderer.invoke('load-audio', path),
  blackout: () => ipcRenderer.invoke('blackout'),
  setDmxPort: (port: string, protocol: string) => ipcRenderer.invoke('set-dmx-port', port, protocol),
  connectArtNet: (host: string, universe?: number) =>
    ipcRenderer.invoke('connect-artnet', host, universe),
  getDmxStatus: () => ipcRenderer.invoke('get-dmx-status'),
  getChannels: () => ipcRenderer.invoke('get-channels'),
  startDmxTest: () => ipcRenderer.invoke('dmx-test-start'),
  setDmxTestChannel: (channel: number, value: number) => ipcRenderer.invoke('dmx-test-set', channel, value),
  stopDmxTest: () => ipcRenderer.invoke('dmx-test-stop'),
  disconnectDmx: () => ipcRenderer.invoke('disconnect-dmx'),
  getDmxPorts: () => ipcRenderer.invoke('get-dmx-ports'),
  setChannels: (values: Record<number, number>) => ipcRenderer.send('set-channels', values),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleWindowMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  getWindowMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
  onWindowMaximized: (callback: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  }
})
