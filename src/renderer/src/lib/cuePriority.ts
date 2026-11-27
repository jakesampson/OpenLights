import type { LiveControl, LivePage } from '@shared/types'
import { DEFAULT_CUE_PRIORITY } from '@shared/types'

export { DEFAULT_CUE_PRIORITY }

export function orderedLiveControls(pages: LivePage[] | undefined, levels: Record<string, number>, activationOrder: Record<string, number>): LiveControl[] {
  return (pages ?? []).flatMap((page) => page.controls).filter((cue) => (levels[cue.id] ?? 0) > 0).sort((a, b) => {
    const priority = (a.priority ?? DEFAULT_CUE_PRIORITY) - (b.priority ?? DEFAULT_CUE_PRIORITY)
    return priority || (activationOrder[a.id] ?? 0) - (activationOrder[b.id] ?? 0)
  })
}
