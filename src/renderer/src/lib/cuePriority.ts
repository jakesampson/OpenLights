import type { LiveControl, LivePage } from '@shared/types'
import { DEFAULT_CUE_PRIORITY } from '@shared/types'

export { DEFAULT_CUE_PRIORITY }

/** Label for one priority value, as in LightKey's Priority submenu
 *  (Jake's screenshot, 27 Nov 2026): 9 — Highest, 5 — Normal,
 *  1 — Lowest, bare numbers in between. */
export function cuePriorityLabel(value: number): string {
  return value === 9 ? '9 — Highest' : value === 5 ? '5 — Normal' : value === 1 ? '1 — Lowest' : String(value)
}

export function orderedLiveControls(pages: LivePage[] | undefined, levels: Record<string, number>, activationOrder: Record<string, number>): LiveControl[] {
  return (pages ?? []).flatMap((page) => page.controls).filter((cue) => (levels[cue.id] ?? 0) > 0).sort((a, b) => {
    const priority = (a.priority ?? DEFAULT_CUE_PRIORITY) - (b.priority ?? DEFAULT_CUE_PRIORITY)
    return priority || (activationOrder[a.id] ?? 0) - (activationOrder[b.id] ?? 0)
  })
}
