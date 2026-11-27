import type { CueListDef } from '@shared/types'

export function manualCrossfade(from: Record<number, number>, to: Record<number, number>, position: number): Record<number, number> {
  const t = Math.max(0, Math.min(1, position))
  const channels = new Set([...Object.keys(from), ...Object.keys(to)].map(Number))
  return Object.fromEntries([...channels].map((channel) => [channel, Math.round((from[channel] ?? 0) + ((to[channel] ?? 0) - (from[channel] ?? 0)) * t)]))
}

/**
 * Index of the cue a manual crossfade fades to from `index`, or -1 when
 * there is no next cue: past the last step of a non-looping list, a
 * single-step list (looping back would fade a cue into itself), or an
 * index that is not on the list. Disabled steps are skipped — the fade
 * goes to the next enabled cue (Guide ch.11, p.218: an unchecked cue
 * is skipped).
 */
export function manualCrossfadeNextIndex(list: CueListDef, index: number): number {
  if (index < 0 || index >= list.steps.length) return -1
  return nextEnabledIndex(list, index, 1)
}

/** The next enabled step after `index` (direction +1) or before it
 *  (direction -1), or -1 when there is none. Wraps when the list
 *  loops; a single enabled step never wraps onto itself. Used by
 *  cueNext / cuePrev and the manual crossfade so an unchecked cue is
 *  skipped in every direction (Guide ch.11, p.218). */
export function nextEnabledIndex(list: CueListDef, index: number, direction: 1 | -1): number {
  const steps = list.steps
  if (!steps.length || index < -1 || index >= steps.length) return -1
  for (let offset = 1; offset <= steps.length; offset += 1) {
    let at = index + direction * offset
    if (list.loop) at = ((at % steps.length) + steps.length) % steps.length
    else if (at < 0 || at >= steps.length) return -1
    // A full circle back to the starting step means it is the only
    // enabled one — never wrap onto itself.
    if (at === index) return -1
    if (!steps[at].disabled) return at
  }
  return -1
}

/**
 * Blend progress 0..1 of the Xfade slider, measured from the end that
 * represents the current cue. LightKey's slider alternates direction
 * (Guide ch.11, p.219): it rests at one end for the current cue, a drag
 * to the opposite end crossfades to the next cue, and after the crossfade
 * completes the next drag goes back the other way — so the blend is the
 * distance from the resting end (`anchor`, 0 or 1), not the raw position.
 */
export function manualCrossfadeProgress(anchor: number, position: number): number {
  const a = Math.max(0, Math.min(1, anchor))
  const p = Math.max(0, Math.min(1, position))
  return Math.max(0, Math.min(1, Math.abs(p - a)))
}

export function cueGroupRange(list: CueListDef, index: number): { first: number; last: number } {
  const group = list.steps[index]?.groupId
  if (!group) return { first: index, last: index }
  const members = list.steps.map((step, i) => step.groupId === group ? i : -1).filter((i) => i >= 0)
  return { first: Math.min(...members), last: Math.max(...members) }
}
