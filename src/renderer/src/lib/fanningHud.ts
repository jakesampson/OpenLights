import type { FanDef, FixtureChannel, FixtureDef } from '@shared/types'
import { availableProperties } from './availableProperties'
import { fixtureBeams } from '@shared/fixtureProfiles'
import { evaluateFan, fanTargetColors, fixtureSupportsDimmer, orderedFanTargets } from './fanning'
import { normalizeColorFavorite } from './colorMix'

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

/**
 * Properties the Fanning HUD can fan, for the given fixtures: every
 * common DMX channel, plus a synthetic Color property when the fixtures
 * share a colour model (RGB or CMY — LightKey Guide §8, p.118 lists
 * Color among the fannable properties, and the "How to Use Fanning"
 * video fans colours as colours, not as three separate channels). The
 * colour entry is not a DMX channel, so its number is -1 and its
 * min/max are unused — a colour fan carries start/end colours instead.
 */
export function fannableProperties(fixtures: FixtureDef[]): FixtureChannel[] {
  const props = availableProperties(fixtures)
  const result = [...props]
  // A colour fixture with no dimmer channel still has a Dimmer — the
  // virtual dimmer (Piece 12) — so it is fannable whenever every selected
  // fixture supports one, physically or virtually. Same rule as the
  // effects chooser (effectableProperties). Without this entry, "Add
  // Dimmer Fanning…" on Q12BTs silently fanned Red instead (openFanHud
  // falls back to channels[0] when 'intensity' is not offered).
  if (!props.some((c) => c.attribute === 'intensity') && fixtures.length > 0 && fixtures.every(fixtureSupportsDimmer)) {
    result.push({ number: -1, attribute: 'intensity', propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 0 })
  }
  const hasRgb = ['red', 'green', 'blue'].every((a) => result.some((c) => c.attribute === a))
  const hasCmy = ['cyan', 'magenta', 'yellow'].every((a) => result.some((c) => c.attribute === a))
  if (!hasRgb && !hasCmy) return result
  return [...result, { number: -1, attribute: 'color', propertyType: 'color', min: 0, max: 255, defaultValue: 0, highlightValue: 0 }]
}

export function defaultColorFan(fixtureIds: string[], startColor: string, endColor: string): FanDef {
  return {
    id: '',
    attribute: 'color',
    fixtureIds: [...fixtureIds],
    mode: 'linear',
    order: 'selection',
    start: 0,
    end: 255,
    startColor: normalizeColorFavorite(startColor) ?? '#ff0000',
    endColor: normalizeColorFavorite(endColor) ?? '#0000ff'
  }
}

export interface FanRow {
  fixture: FixtureDef
  /** Set when the row is one beam (cell) of the fixture, not the whole fixture. */
  beam?: { id: string; name: string }
  /** Position in the fan's ordered list — the index anchors refer to. */
  index: number
  /** Value that lands on this fixture (null when it has no such channel). */
  value: number | null
  /** Colour that lands on this fixture, for colour fans (null when the
      fixture has no colour channels). */
  colorValue?: string | null
  /** LightKey's blue dot (Guide p.121): a value has been defined here. */
  defined: boolean
}

/** Every beam (cell) of the given fixtures, in fixture order — the "Beams" side of the Guide p.119 fixtures-vs-beams choice. */
export function fanBeamTargets(fixtures: FixtureDef[], fixtureIds: string[]): { fixtureId: string; beamId: string }[] {
  return fixtureIds.flatMap((id) => {
    const fixture = fixtures.find((f) => f.id === id)
    return (fixture ? fixtureBeams(fixture) : []).map((beam) => ({ fixtureId: id, beamId: beam.id }))
  })
}

export function fanRows(fixtures: FixtureDef[], fan: FanDef): FanRow[] {
  const targets = orderedFanTargets(fixtures, fan)
  const values = evaluateFan(fixtures, fan)
  const colorValues = fan.attribute === 'color' ? fanTargetColors(fixtures, fan) : null
  const defined = new Set(definedFanIndexes(fan, targets.length))
  return targets.map((target, index) => {
    // A beam row reads/writes the beam's own channel for the attribute.
    const attribute = target.beam?.properties[fan.attribute] ?? fan.attribute
    return {
      fixture: target.fixture,
      ...(target.beam ? { beam: { id: target.beam.id, name: target.beam.name } } : {}),
      index,
      value: colorValues ? null : values[target.fixture.id]?.[attribute] ?? null,
      colorValue: colorValues ? colorValues[index] ?? null : undefined,
      defined: defined.has(index)
    }
  })
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
 * The colour version of setFanRowValue: the first and last positions set
 * the fan's start/end colours, any position in between becomes an
 * intermediate anchor carrying that colour (video: "click any fixture
 * to define its color"). A colour anchor's numeric `value` is unused.
 */
export function setFanRowColor(fan: FanDef, index: number, hex: string, count = fan.fixtureIds.length): FanDef {
  const next = normalizeColorFavorite(hex) ?? '#000000'
  if (index <= 0) return { ...fan, startColor: next, anchors: (fan.anchors ?? []).filter((a) => a.index !== 0) }
  if (index >= count - 1) return { ...fan, endColor: next, anchors: (fan.anchors ?? []).filter((a) => a.index !== count - 1) }
  const anchors = [...(fan.anchors ?? []).filter((a) => a.index !== index), { index, value: 0, color: next }].sort((a, b) => a.index - b.index)
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
