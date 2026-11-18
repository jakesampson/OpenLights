export interface LiveWindowSpec { id: string; pageId: string | null; width: number; height: number }
export function normalizeLiveWindows(raw: unknown): LiveWindowSpec[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.filter((value) => value && typeof value.id === 'string' && !seen.has(value.id) && Boolean(seen.add(value.id))).map((value) => ({ id: value.id, pageId: typeof value.pageId === 'string' ? value.pageId : null, width: Math.max(640, Math.min(3840, Number(value.width) || 1000)), height: Math.max(480, Math.min(2160, Number(value.height) || 700)) }))
}
export const LIVE_WINDOW_COMMANDS = ['setLiveValue', 'clearLiveValues', 'selectLivePage', 'goToCue', 'cueNext', 'cuePrev', 'stopCue', 'setMaster', 'setBpm', 'toggleBlackout', 'activateCue', 'togglePreset', 'clearPresets', 'clearManualOverrides', 'toggleSequence', 'stopSequences'] as const
