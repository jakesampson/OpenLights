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
 * index that is not on the list.
 */
export function manualCrossfadeNextIndex(list: CueListDef, index: number): number {
  if (index < 0 || index >= list.steps.length) return -1
  if (index + 1 < list.steps.length) return index + 1
  return list.loop && list.steps.length > 1 ? 0 : -1
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
