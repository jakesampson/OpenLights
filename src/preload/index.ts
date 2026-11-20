import { ipcRenderer, contextBridge } from 'electron'

// Expose protected methods that the renderer can call
contextBridge.exposeInMainWorld('electronAPI', {
  printPatch: (html: string) => ipcRenderer.invoke('print-patch', html),
  toggleFullscreen: () => ipcRenderer.invoke('window:fullscreen'),
  openLiveWindow: (pageId: string | null) => ipcRenderer.invoke('window:open-live', pageId),
  listOflProfiles: () => ipcRenderer.invoke('ofl-library:list'),
  importOflLibraryZip: () => ipcRenderer.invoke('ofl-library:import-zip'),
  duplicateOflProfile: (profileId: string) => ipcRenderer.invoke('ofl-library:duplicate', profileId),
  publishLiveWindowState: (state: Record<string, unknown>) => ipcRenderer.send('live-window:state', state),
  requestLiveWindowState: () => ipcRenderer.send('live-window:request'),
  liveWindowCommand: (command: string, args: unknown[]) => ipcRenderer.send('live-window:command', command, args),
  onLiveWindowState: (callback: (state: Record<string, unknown>) => void) => { const listener = (_: Electron.IpcRendererEvent, state: Record<string, unknown>) => callback(state); ipcRenderer.on('live-window:state', listener); return () => ipcRenderer.removeListener('live-window:state', listener) },
  onLiveWindowCommand: (callback: (command: string, args: unknown[]) => void) => { const listener = (_: Electron.IpcRendererEvent, command: string, args: unknown[]) => callback(command, args); ipcRenderer.on('live-window:command', listener); return () => ipcRenderer.removeListener('live-window:command', listener) },
  renameShow: (path: string, name: string) => ipcRenderer.invoke('rename-show', path, name),
  duplicateShow: (path: string) => ipcRenderer.invoke('duplicate-show', path),
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
  getDmxStatus: () => ipcRenderer.invoke('get-dmx-status'),
  getChannels: () => ipcRenderer.invoke('get-channels'),
  startDmxTest: () => ipcRenderer.invoke('dmx-test-start'),
  setDmxTestChannel: (channel: number, value: number) => ipcRenderer.invoke('dmx-test-set', channel, value),
  stopDmxTest: () => ipcRenderer.invoke('dmx-test-stop'),
  disconnectDmx: () => ipcRenderer.invoke('disconnect-dmx'),
  getDmxPorts: () => ipcRenderer.invoke('get-dmx-ports'),
  setChannels: (values: Record<number, number>) => ipcRenderer.send('set-channels', values),
  closeWindow: () => ipcRenderer.send('window:close'),
  onMenuCommand: (callback: (command: string) => void) => { const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command); ipcRenderer.on('menu:command', listener); return () => ipcRenderer.removeListener('menu:command', listener) },
  onAppQuitting: (callback: () => void) => { const listener = () => callback(); ipcRenderer.on('app:quitting', listener); return () => ipcRenderer.removeListener('app:quitting', listener) }
})
