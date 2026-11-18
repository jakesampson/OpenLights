import type { FanDef, FixtureChannel, FixtureDef } from '@shared/types'
import { evaluateFan, orderedFanFixtures } from './fanning'

// Pure helpers for the Fanning HUD (Guide §8, p.118 to 123). The HUD lives
// in the Preview — LightKey shows it around the fixtures' icons there — and
// these helpers are the whole draft model behind it, so they are unit
// tested without rendering: the component itself is a thin renderer over
// them plus the store's saveFan/deleteFan.

export const FAN_MODE_OPTIONS: { value: FanDef['mode']; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'centre', label: 'From centre' },
  { value: 'reverse', label: 'Reverse' }
]

// Guide p.120: Fixture Order offers Left to Right, Right to Left, Top to
// Bottom, Bottom to Top, By Short Name and By Address, plus Consider
// Spacing for the position-based orders. Selection order (the order the
// fixtures were picked in) is OpenLights' default; LightKey orders by the
// Preview layout unless changed.
export const FAN_ORDER_OPTIONS: { value: FanDef['order']; label: string }[] = [
  { value: 'selection', label: 'Selection order' },
  { value: 'left-right', label: 'Left to Right' },
  { value: 'right-left', label: 'Right to Left' },
  { value: 'top-bottom', label: 'Top to Bottom' },
  { value: 'bottom-top', label: 'Bottom to Top' },
  { value: 'name', label: 'By Short Name' },
  { value: 'address', label: 'By Address' }
]

export function defaultFan(attribute: string, fixtureIds: string[], channel?: FixtureChannel): FanDef {
  return {
    id: '',
    attribute,
    fixtureIds: [...fixtureIds],
    mode: 'linear',
    order: 'selection',
    start: channel?.min ?? 0,
    end: channel?.max ?? 255
  }
}

export interface FanRow {
  fixture: FixtureDef
  /** Position in the fan's ordered list — the index anchors refer to. */
  index: number
  /** Value that lands on this fixture (null when it has no such channel). */
  value: number | null
  /** LightKey's blue dot (Guide p.121): a value has been defined here. */
  defined: boolean
}

export function fanRows(fixtures: FixtureDef[], fan: FanDef): FanRow[] {
  const ordered = orderedFanFixtures(fixtures, fan)
  const values = evaluateFan(fixtures, fan)
  const defined = new Set(definedFanIndexes(fan, ordered.length))
  return ordered.map((fixture, index) => ({
    fixture,
    index,
    value: values[fixture.id]?.[fan.attribute] ?? null,
    defined: defined.has(index)
  }))
}

/**
 * Indexes with a defined value: the two endpoints (start/end) plus any
 * intermediate anchors. Guide p.121: "You can't remove the last two
 * defined values" — the endpoints are always defined, so the two that
 * must remain are start and end.
 */
export function definedFanIndexes(fan: FanDef, count = fan.fixtureIds.length): number[] {
  if (count < 1) return []
  const indexes = new Set([0, count - 1])
  for (const anchor of fan.anchors ?? []) if (anchor.index > 0 && anchor.index < count - 1) indexes.add(anchor.index)
  return [...indexes].sort((a, b) => a - b)
}

function clampFanValue(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * Define a value for one ordered position. Guide p.121: "Click the
 * fixture or beam, then choose a value." The first and last positions are
 * the fan's endpoints (start/end); any position in between becomes an
 * intermediate anchor that the fan interpolates through.
 */
export function setFanRowValue(fan: FanDef, index: number, value: number, count = fan.fixtureIds.length): FanDef {
  const next = clampFanValue(value)
  if (index <= 0) return { ...fan, start: next, anchors: (fan.anchors ?? []).filter((a) => a.index !== 0) }
  if (index >= count - 1) return { ...fan, end: next, anchors: (fan.anchors ?? []).filter((a) => a.index !== count - 1) }
  const anchors = [...(fan.anchors ?? []).filter((a) => a.index !== index), { index, value: next }].sort((a, b) => a.index - b.index)
  return { ...fan, anchors }
}

/**
 * Remove a defined value. Only intermediate anchors can be removed — the
 * endpoints are the last two defined values and LightKey forbids removing
 * them (Guide p.121).
 */
export function clearFanRowValue(fan: FanDef, index: number, count = fan.fixtureIds.length): FanDef {
  if (index <= 0 || index >= count - 1) return fan
  const anchors = (fan.anchors ?? []).filter((a) => a.index !== index)
  return { ...fan, anchors: anchors.length ? anchors : undefined }
}
