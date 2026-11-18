import type { DmxPortInfo, DmxStatus, SerialDmxProtocol } from '@shared/types'

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
      printPatch: (html: string) => Promise<IpcResult>
      toggleFullscreen: () => Promise<void>
      openLiveWindow: (pageId: string | null) => Promise<import('@shared/liveWindows').LiveWindowSpec>
      publishLiveWindowState: (state: Record<string, unknown>) => void
      requestLiveWindowState: () => void
      liveWindowCommand: (command: string, args: unknown[]) => void
      onLiveWindowState: (callback: (state: Record<string, unknown>) => void) => () => void
      onLiveWindowCommand: (callback: (command: string, args: unknown[]) => void) => () => void
      renameShow: (path: string, name: string) => Promise<IpcResult>
      duplicateShow: (path: string) => Promise<IpcResult>
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
      setDmxPort: (port: string, protocol: SerialDmxProtocol) => Promise<IpcResult & { status?: DmxStatus }>
      getDmxStatus: () => Promise<DmxStatus>
      getChannels: () => Promise<number[]>
      startDmxTest: () => Promise<void>
      setDmxTestChannel: (channel: number, value: number) => Promise<void>
      stopDmxTest: () => Promise<void>
      disconnectDmx: () => Promise<IpcResult & { status?: DmxStatus }>
      getDmxPorts: () => Promise<DmxPortInfo[]>
      setChannels: (values: Record<number, number>) => void
      minimizeWindow: () => void
      toggleWindowMaximize: () => void
      closeWindow: () => void
      getWindowMaximized: () => Promise<boolean>
      onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
      onMenuCommand: (callback: (command: string) => void) => () => void
      onAppQuitting: (callback: () => void) => () => void
    }
  }
}
