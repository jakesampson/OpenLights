import type { FanDef, FixtureDef } from '@shared/types'
import { fixtureMode } from '@shared/fixtureProfiles'

export function fanValues(count: number, start: number, end: number, mode: FanDef['mode'], positions?: number[], anchors?: FanDef['anchors']): number[] {
  if (count < 1) return []
  const last = count - 1
  return Array.from({ length: count }, (_, i) => {
    let ratio = last ? i / last : 0
    if (positions?.length === count && positions[last] !== positions[0]) ratio = (positions[i] - positions[0]) / (positions[last] - positions[0])
    if (anchors && anchors.length >= 2) {
      const sorted = [...anchors].sort((a, b) => a.index - b.index)
      const left = [...sorted].reverse().find((a) => a.index <= i) ?? sorted[0], right = sorted.find((a) => a.index >= i) ?? sorted[sorted.length - 1]
      return Math.round(left.value + (right.value - left.value) * (right.index === left.index ? 0 : (i - left.index) / (right.index - left.index)))
    }
    if (mode === 'reverse') ratio = 1 - ratio
    if (mode === 'centre') ratio = last ? Math.abs(ratio * 2 - 1) : 0
    return Math.round(start + (end - start) * ratio)
  })
}

export function orderedFanFixtures(fixtures: FixtureDef[], fan: FanDef): FixtureDef[] {
  const selected = fan.fixtureIds.map((id) => fixtures.find((f) => f.id === id)).filter((f): f is FixtureDef => Boolean(f))
  if (fan.order === 'name') selected.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (fan.order === 'address') selected.sort((a, b) => (a.universe ?? 1) - (b.universe ?? 1) || a.channelStart - b.channelStart)
  if (fan.order === 'left-right' || fan.order === 'top-bottom') { const axis = fan.order === 'left-right' ? 'x' : 'y'; selected.sort((a, b) => (a.previewPosition?.[axis] ?? 0) - (b.previewPosition?.[axis] ?? 0)) }
  return selected
}

export function evaluateFan(fixtures: FixtureDef[], fan: FanDef): Record<string, Record<string, number>> {
  const ordered = orderedFanFixtures(fixtures, fan), axis = fan.order === 'top-bottom' ? 'y' : 'x'
  const positions = fan.considerSpacing && ['left-right', 'top-bottom'].includes(fan.order) ? ordered.map((f) => f.previewPosition?.[axis] ?? 0) : undefined
  const values = fanValues(ordered.length, fan.start, fan.end, fan.mode, positions, fan.anchors)
  return Object.fromEntries(ordered.flatMap((f, i) => {
    const channel = fixtureMode(f)?.channels.find((c) => c.attribute === fan.attribute)
    return channel ? [[f.id, { [fan.attribute]: Math.max(channel.min, Math.min(channel.max, values[i])) }]] : []
  }))
}
