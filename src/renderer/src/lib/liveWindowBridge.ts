import { useShowStore } from '../stores/showStore'
import { LIVE_WINDOW_COMMANDS } from '@shared/liveWindows'
export const isLiveWindow = () => typeof window !== 'undefined' && new URLSearchParams(window.location?.search ?? '').has('liveWindow')
export function startLiveWindowBridge(): () => void {
  if (!window.electronAPI?.onLiveWindowState) return () => {}
  if (isLiveWindow()) {
    const commands = Object.fromEntries(LIVE_WINDOW_COMMANDS.map((command) => [command, (...args: unknown[]) => window.electronAPI.liveWindowCommand(command, args)]))
    useShowStore.setState(commands)
    const unsubscribe = window.electronAPI.onLiveWindowState((state) => useShowStore.setState(state))
    window.electronAPI.requestLiveWindowState()
    return unsubscribe
  }
  const send = () => {
    const state = useShowStore.getState()
    const keys = ['activeSequenceIds', 'locked', 'show', 'presets', 'effects', 'cueLists', 'activeLiveValues', 'activeLivePageId', 'activePresetIds', 'manualOverrides', 'master', 'bpm', 'blackout', 'activeCueRef', 'activeCueListId', 'activeCueIndex', 'cuePlaying'] as const
    window.electronAPI.publishLiveWindowState(Object.fromEntries(keys.map((key) => [key, state[key]])))
  }
  const unsubscribe = useShowStore.subscribe(send)
  const offCommand = window.electronAPI.onLiveWindowCommand((command, args) => {
    if (!(LIVE_WINDOW_COMMANDS as readonly string[]).includes(command)) return
    const action = useShowStore.getState()[command as typeof LIVE_WINDOW_COMMANDS[number]] as (...args: unknown[]) => void
    action(...args)
  })
  send()
  return () => { unsubscribe(); offCommand() }
}
