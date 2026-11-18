import type { CueListDef } from '@shared/types'

export function manualCrossfade(from: Record<number, number>, to: Record<number, number>, position: number): Record<number, number> {
  const t = Math.max(0, Math.min(1, position))
  const channels = new Set([...Object.keys(from), ...Object.keys(to)].map(Number))
  return Object.fromEntries([...channels].map((channel) => [channel, Math.round((from[channel] ?? 0) + ((to[channel] ?? 0) - (from[channel] ?? 0)) * t)]))
}

export function cueGroupRange(list: CueListDef, index: number): { first: number; last: number } {
  const group = list.steps[index]?.groupId
  if (!group) return { first: index, last: index }
  const members = list.steps.map((step, i) => step.groupId === group ? i : -1).filter((i) => i >= 0)
  return { first: Math.min(...members), last: Math.max(...members) }
}
