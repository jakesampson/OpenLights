import type { FanDef, FixtureDef } from '@shared/types'
import { fixtureBeams, fixtureMode } from '@shared/fixtureProfiles'
import { hexToRgb, rgbToHex } from './colorMix'

/**
 * A fixture's position along a fan, 0 at the first fixture and 1 at the
 * last — from the fixture order (and, when Consider Spacing is on, the
 * fixtures' Preview positions) and the fan mode. Shared by the numeric
 * and colour fans so the spread maths is single-sourced.
 */
export function fanPositionRatio(i: number, count: number, mode: FanDef['mode'], positions?: number[]): number {
  const last = count - 1
  let ratio = last ? i / last : 0
  if (positions?.length === count && positions[last] !== positions[0]) ratio = (positions[i] - positions[0]) / (positions[last] - positions[0])
  if (mode === 'reverse') ratio = 1 - ratio
  if (mode === 'centre') ratio = last ? Math.abs(ratio * 2 - 1) : 0
  return ratio
}

export function fanValues(count: number, start: number, end: number, mode: FanDef['mode'], positions?: number[], anchors?: FanDef['anchors']): number[] {
  if (count < 1) return []
  const last = count - 1
  return Array.from({ length: count }, (_, i) => {
    if (anchors && anchors.length >= 1) {
      // Defined values interpolate piecewise: the endpoints (start/end)
      // are always defined, so a single intermediate anchor already bends
      // the fan through it (Guide p.121 — define values for at least two
      // fixtures, usually the first and last, and the rest are calculated).
      // An anchor at an endpoint overrides that endpoint's value.
      const byIndex = new Map<number, number>([[0, start]])
      if (last > 0) byIndex.set(last, end)
      for (const a of anchors) if (a.index >= 0 && a.index <= last) byIndex.set(a.index, a.value)
      const points = [...byIndex.entries()].map(([index, value]) => ({ index, value })).sort((a, b) => a.index - b.index)
      const left = [...points].reverse().find((a) => a.index <= i) ?? points[0], right = points.find((a) => a.index >= i) ?? points[points.length - 1]
      return Math.round(left.value + (right.value - left.value) * (right.index === left.index ? 0 : (i - left.index) / (right.index - left.index)))
    }
    return Math.round(start + (end - start) * fanPositionRatio(i, count, mode, positions))
  })
}

/**
 * Colour fan values (LightKey Guide §8 + "How to Use Fanning" video:
 * define a colour for the first and last fixture — or any fixture — and
 * the colours in between are calculated automatically). The same spread
 * as fanValues, in RGB space: the endpoints are start/end colours, any
 * intermediate anchor bends the fan through its colour, and the mode and
 * Consider Spacing apply exactly as for numeric fans.
 */
export function fanColorValues(count: number, startColor: string, endColor: string, mode: FanDef['mode'], positions?: number[], anchors?: FanDef['anchors']): string[] {
  if (count < 1) return []
  const last = count - 1
  const start = hexToRgb(startColor) ?? { red: 255, green: 0, blue: 0 }
  const end = hexToRgb(endColor) ?? { red: 0, green: 0, blue: 255 }
  const lerp = (a: { red: number; green: number; blue: number }, b: { red: number; green: number; blue: number }, t: number) =>
    rgbToHex({ red: Math.round(a.red + (b.red - a.red) * t), green: Math.round(a.green + (b.green - a.green) * t), blue: Math.round(a.blue + (b.blue - a.blue) * t) })
  return Array.from({ length: count }, (_, i) => {
    if (anchors && anchors.length >= 1) {
      const byIndex = new Map<number, { red: number; green: number; blue: number }>([[0, start]])
      if (last > 0) byIndex.set(last, end)
      for (const a of anchors) {
        const color = a.color ? hexToRgb(a.color) : null
        if (color && a.index >= 0 && a.index <= last) byIndex.set(a.index, color)
      }
      const points = [...byIndex.entries()].map(([index, value]) => ({ index, value })).sort((a, b) => a.index - b.index)
      const left = [...points].reverse().find((a) => a.index <= i) ?? points[0], right = points.find((a) => a.index >= i) ?? points[points.length - 1]
      return lerp(left.value, right.value, right.index === left.index ? 0 : (i - left.index) / (right.index - left.index))
    }
    return lerp(start, end, fanPositionRatio(i, count, mode, positions))
  })
}

/** How a fixture mixes colour: RGB channels, CMY channels, or neither. */
export function colorModelForFixture(fixture: FixtureDef): 'rgb' | 'cmy' | null {
  const attributes = (fixtureMode(fixture)?.channels ?? []).map((c) => c.attribute)
  if (['red', 'green', 'blue'].every((a) => attributes.includes(a))) return 'rgb'
  if (['cyan', 'magenta', 'yellow'].every((a) => attributes.includes(a))) return 'cmy'
  return null
}

/** Colour per fixture for a colour fan, as hex strings. */
export function evaluateColorFan(fixtures: FixtureDef[], fan: FanDef): Record<string, string> {
  const ordered = orderedFanFixtures(fixtures, fan), axis = fan.order === 'top-bottom' || fan.order === 'bottom-top' ? 'y' : 'x'
  const positions = fan.considerSpacing && ['left-right', 'right-left', 'top-bottom', 'bottom-top'].includes(fan.order) ? ordered.map((f) => f.previewPosition?.[axis] ?? 0) : undefined
  const values = fanColorValues(ordered.length, fan.startColor ?? '#ff0000', fan.endColor ?? '#0000ff', fan.mode, positions, fan.anchors)
  return Object.fromEntries(ordered.filter((f) => colorModelForFixture(f)).map((f, i) => [f.id, values[i]]))
}

export function orderedFanFixtures(fixtures: FixtureDef[], fan: FanDef): FixtureDef[] {
  const selected = fan.fixtureIds.map((id) => fixtures.find((f) => f.id === id)).filter((f): f is FixtureDef => Boolean(f))
  if (fan.order === 'name') selected.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (fan.order === 'address') selected.sort((a, b) => (a.universe ?? 1) - (b.universe ?? 1) || a.channelStart - b.channelStart)
  // Guide §8, p.120: Right to Left and Bottom to Top are order options
  // alongside Left to Right and Top to Bottom — same axis, descending.
  if (['left-right', 'right-left', 'top-bottom', 'bottom-top'].includes(fan.order)) { const axis = fan.order === 'top-bottom' || fan.order === 'bottom-top' ? 'y' : 'x'; const descending = fan.order === 'right-left' || fan.order === 'bottom-top'; selected.sort((a, b) => ((a.previewPosition?.[axis] ?? 0) - (b.previewPosition?.[axis] ?? 0)) * (descending ? -1 : 1)) }
  return selected
}

/** One fanning target: a whole fixture, or one beam (cell) of it. */
export interface FanTarget {
  fixture: FixtureDef
  beam?: { id: string; name: string; properties: Record<string, string> }
}

/**
 * The targets a fan distributes over, in fan order. A fan with `beams`
 * set distributes over those beams (cells) in listed order — LightKey
 * Guide §8 p.119 — instead of over its fixtures; otherwise the targets
 * are the fan's fixtures in order.
 */
export function orderedFanTargets(fixtures: FixtureDef[], fan: FanDef): FanTarget[] {
  if (fan.beams?.length) {
    const byId = new Map(fixtures.map((f) => [f.id, f]))
    return fan.beams.flatMap(({ fixtureId, beamId }) => {
      const fixture = byId.get(fixtureId)
      const beam = fixture && fixtureBeams(fixture).find((b) => b.id === beamId)
      return fixture && beam ? [{ fixture, beam }] : []
    })
  }
  return orderedFanFixtures(fixtures, fan).map((fixture) => ({ fixture }))
}

/** The fanned colour per target for a colour fan, as hex strings (null where the target has no colour) — the HUD rows for a beam fan need a colour per beam, not per fixture. */
export function fanTargetColors(fixtures: FixtureDef[], fan: FanDef): (string | null)[] {
  const targets = orderedFanTargets(fixtures, fan)
  const axis = fan.order === 'top-bottom' || fan.order === 'bottom-top' ? 'y' : 'x'
  const positions = fan.considerSpacing && ['left-right', 'right-left', 'top-bottom', 'bottom-top'].includes(fan.order) ? targets.map((t) => t.fixture.previewPosition?.[axis] ?? 0) : undefined
  const colors = fanColorValues(targets.length, fan.startColor ?? '#ff0000', fan.endColor ?? '#0000ff', fan.mode, positions, fan.anchors)
  return targets.map((target, i) => {
    if (target.beam) return ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'].some((a) => target.beam!.properties[a] !== undefined) ? colors[i] : null
    return colorModelForFixture(target.fixture) ? colors[i] : null
  })
}

export function evaluateFan(fixtures: FixtureDef[], fan: FanDef): Record<string, Record<string, number>> {
  // Colour fans write the fanned colour into the target's own colour
  // channels — RGB channels for RGB fixtures, CMY (255 minus each
  // component) for CMY fixtures, or the beam's own colour properties
  // when fanning across beams. White / Amber / UV are left untouched:
  // a fanned colour is a hue, not a white/amber level.
  const targets = orderedFanTargets(fixtures, fan)
  const axis = fan.order === 'top-bottom' || fan.order === 'bottom-top' ? 'y' : 'x'
  const positions = fan.considerSpacing && ['left-right', 'right-left', 'top-bottom', 'bottom-top'].includes(fan.order) ? targets.map((t) => t.fixture.previewPosition?.[axis] ?? 0) : undefined
  if (fan.attribute === 'color') {
    const colors = fanColorValues(targets.length, fan.startColor ?? '#ff0000', fan.endColor ?? '#0000ff', fan.mode, positions, fan.anchors)
    const values: Record<string, Record<string, number>> = {}
    targets.forEach((target, i) => {
      const rgb = hexToRgb(colors[i])
      if (!rgb) return
      const entries: [string, number][] = []
      if (target.beam) {
        // Beam colour: the beam's own rgb/cmy properties.
        for (const [attribute, channel] of Object.entries(target.beam.properties)) {
          if (attribute === 'red') entries.push([channel, rgb.red])
          else if (attribute === 'green') entries.push([channel, rgb.green])
          else if (attribute === 'blue') entries.push([channel, rgb.blue])
          else if (attribute === 'cyan') entries.push([channel, 255 - rgb.red])
          else if (attribute === 'magenta') entries.push([channel, 255 - rgb.green])
          else if (attribute === 'yellow') entries.push([channel, 255 - rgb.blue])
        }
      } else {
        const model = colorModelForFixture(target.fixture)
        if (model === 'rgb') entries.push(...Object.entries(rgb))
        else if (model === 'cmy') entries.push(['cyan', 255 - rgb.red], ['magenta', 255 - rgb.green], ['yellow', 255 - rgb.blue])
      }
      if (entries.length) values[target.fixture.id] = { ...values[target.fixture.id], ...Object.fromEntries(entries) }
    })
    return values
  }
  const values = fanValues(targets.length, fan.start, fan.end, fan.mode, positions, fan.anchors)
  const result: Record<string, Record<string, number>> = {}
  targets.forEach((target, i) => {
    const attribute = target.beam?.properties[fan.attribute] ?? fan.attribute
    const channel = fixtureMode(target.fixture)?.channels.find((c) => c.attribute === attribute)
    if (!channel) return
    result[target.fixture.id] = { ...result[target.fixture.id], [attribute]: Math.max(channel.min, Math.min(channel.max, values[i])) }
  })
  return result
}
