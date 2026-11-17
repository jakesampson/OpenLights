import type { LiveControl, LivePage } from '@shared/types'

export function orderedLiveControls(pages: LivePage[] | undefined, levels: Record<string, number>, activationOrder: Record<string, number>): LiveControl[] {
  return (pages ?? []).flatMap((page) => page.controls).filter((cue) => (levels[cue.id] ?? 0) > 0).sort((a, b) => {
    const priority = (a.priority ?? 0) - (b.priority ?? 0)
    return priority || (activationOrder[a.id] ?? 0) - (activationOrder[b.id] ?? 0)
  })
}
