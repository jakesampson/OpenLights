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
  setDmxPort: (port: string, baudRate: number) =>
    ipcRenderer.invoke('set-dmx-port', port, baudRate),
  connectArtNet: (host: string, universe?: number) =>
    ipcRenderer.invoke('connect-artnet', host, universe),
  getDmxStatus: () => ipcRenderer.invoke('get-dmx-status'),
  getChannels: () => ipcRenderer.invoke('get-channels'),
  disconnectDmx: () => ipcRenderer.invoke('disconnect-dmx'),
  getDmxPorts: () => ipcRenderer.invoke('get-dmx-ports'),
  setChannels: (values: Record<number, number>) => ipcRenderer.send('set-channels', values)
})
