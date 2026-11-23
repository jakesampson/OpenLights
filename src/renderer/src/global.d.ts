import type { DmxPortInfo, DmxStatus, SerialDmxProtocol } from '@shared/types'
import type { NdiReceiveHealth } from '@shared/ndiAmbience'

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
      listOflProfiles: () => Promise<import('@shared/types').FixtureProfile[]>
      importOflLibraryZip: () => Promise<IpcResult & { profiles: import('@shared/types').FixtureProfile[]; imported?: number; skipped?: number }>
      duplicateOflProfile: (profileId: string) => Promise<IpcResult & { profiles: import('@shared/types').FixtureProfile[]; profile?: import('@shared/types').FixtureProfile }>
      saveOflCustomProfile: (profile: import('@shared/types').FixtureProfile) => Promise<IpcResult & { profiles: import('@shared/types').FixtureProfile[]; profile?: import('@shared/types').FixtureProfile }>
      deleteOflCustomProfile: (profileId: string) => Promise<IpcResult & { profiles: import('@shared/types').FixtureProfile[] }>
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
      ndiVersion: () => Promise<{ available: boolean; version?: string; error?: string }>
      ndiListSources: () => Promise<{ sources: import('@shared/ndiAmbience').NdiSourceInfo[]; error?: string }>
      ndiStart: (source: import('@shared/ndiAmbience').NdiSourceInfo) => Promise<{ success: boolean; error?: string }>
      ndiStop: () => Promise<{ success: boolean }>
      onNdiRegions: (callback: (regions: import('@shared/ndiAmbience').NdiRegionColour[], at: number) => void) => () => void
      onNdiReceiveStatus: (callback: (status: NdiReceiveHealth) => void) => () => void
      onNdiFrame: (callback: (dataUrl: string) => void) => () => void
      onNdiStatus: (callback: (status: { state: 'ready' | 'receiving' | 'stopped' | 'error'; message?: string; source?: import('@shared/ndiAmbience').NdiSourceInfo }) => void) => () => void
      setTitleBarOverlay: (mode: 'main' | 'wizard' | 'welcome') => void
      closeWindow: () => void
      onMenuCommand: (callback: (command: string) => void) => () => void
      onAppQuitting: (callback: () => void) => () => void
    }
  }
}
