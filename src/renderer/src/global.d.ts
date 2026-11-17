import type { DmxPortInfo, DmxStatus } from '@shared/types'

export {}

export interface ShowMeta {
  name: string
  path: string
  updatedAt: number
}

export interface IpcResult<T = unknown> {
  success: boolean
  error?: string
  canceled?: boolean
  path?: string
  data?: T
}

declare global {
  interface Window {
    electronAPI: {
      loadShow: (path: string) => Promise<IpcResult>
      openShow: () => Promise<IpcResult>
      saveShow: (data: unknown, path?: string) => Promise<IpcResult>
      saveShowAs: (data: unknown, suggestedPath?: string) => Promise<IpcResult>
      listShows: () => Promise<ShowMeta[]>
      deleteShow: (path: string) => Promise<IpcResult>
      loadAudio: (path?: string) => Promise<
        IpcResult & { name?: string; dataUrl?: string; path?: string }
      >
      blackout: () => Promise<IpcResult>
      setDmxPort: (port: string) => Promise<IpcResult & { status?: DmxStatus }>
      connectArtNet: (host: string, universe?: number) => Promise<IpcResult & { status?: DmxStatus }>
      getDmxStatus: () => Promise<DmxStatus>
      getChannels: () => Promise<number[]>
      disconnectDmx: () => Promise<IpcResult & { status?: DmxStatus }>
      getDmxPorts: () => Promise<DmxPortInfo[]>
      setChannels: (values: Record<number, number>) => void
      minimizeWindow: () => void
      toggleWindowMaximize: () => void
      closeWindow: () => void
      getWindowMaximized: () => Promise<boolean>
      onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
    }
  }
}
