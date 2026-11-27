// Live fader Controls + output split (LightKey guide ch.11, pp.179,
// 204, 215–216; Jake's screenshots, 27 Nov 2026).
//
// A fader controls how much of its cue affects the output, 0–100%.
// "Controls (faders): Determines which fixture properties are
// affected by the fader value. If you select All Properties (the
// default), dragging the fader affects all properties defined in the
// cue. If you select individual properties, like Dimmer, Color, or
// Iris, only those properties are affected by the fader's value."
// (p.204). "Drag the fader to 0% to deactivate the cue" (p.216).
// "If a property can't be faded (like Shutter or Gobo), its value
// changes when the fader crosses 50%." (p.216).
//
// The split below is what the live output layer applies: the fader's
// level is already applied to the "scaled" set (values pre-scaled by
// level/255), so the caller computes both sets with the plain master
// and the level lands exactly once. The old scaledMaster path could
// not do this: scaleAttribute only scales dimmer attributes, so a
// Pan or Color fader would have done nothing to pan or colour. The
// "full" set applies at full master while the fader is above 0, and
// at 0% the whole cue is deactivated (the App effect skips it — same
// as a Push Button switched off).
import { resolveCueValues } from '@shared/cueResolution'
import { isDimmerAttribute } from './automationRuntime'
import type { FixtureValuePatch } from './effectiveIntensity'
import type { CueDef, FaderControlProperty, FixtureDef, LiveControl, PresetDef } from '@shared/types'

export interface FaderControlPropertyDef {
  key: FaderControlProperty
  label: string
  /** Fixture-value attributes belonging to this property. */
  matches: (attribute: string) => boolean
}

const colourBase = (attribute: string) => attribute.replace(/ ?\d+$/, '').toLowerCase()

/** A colour attribute: any LED channel (RGB / CMY / White / Amber /
 *  UV / Lime, any pod) — the same set the master scales, minus the
 *  intensity channel itself (that is Dimmer's). */
const isColourAttribute = (attribute: string) =>
  isDimmerAttribute(attribute) && colourBase(attribute) !== 'intensity'

export const FADER_CONTROL_PROPERTIES: FaderControlPropertyDef[] = [
  { key: 'dimmer', label: 'Dimmer', matches: (a) => a.toLowerCase() === 'intensity' },
  { key: 'color', label: 'Color', matches: isColourAttribute },
  { key: 'pan', label: 'Pan', matches: (a) => a.toLowerCase() === 'pan' },
  { key: 'tilt', label: 'Tilt', matches: (a) => a.toLowerCase() === 'tilt' },
  { key: 'focus', label: 'Focus', matches: (a) => a.toLowerCase() === 'focus' },
  { key: 'zoom', label: 'Zoom Angle', matches: (a) => a.toLowerCase() === 'zoom' },
  { key: 'iris', label: 'Iris Size', matches: (a) => a.toLowerCase() === 'iris' },
  { key: 'frost', label: 'Frost Amount', matches: (a) => a.toLowerCase() === 'frost' },
  { key: 'fog', label: 'Fog Amount', matches: (a) => a.toLowerCase() === 'fog' },
]

export const FADER_CONTROLS_LABELS: Record<'all' | FaderControlProperty, string> = {
  all: 'All Properties',
  ...Object.fromEntries(FADER_CONTROL_PROPERTIES.map((p) => [p.key, p.label]))
} as Record<'all' | FaderControlProperty, string>

/** The fader's Controls setting: 'all' (absent = all) or one property. */
export function faderControlsValue(control: LiveControl): 'all' | FaderControlProperty {
  return control.faderControls ?? 'all'
}

/** Whether this fader's value affects the Dimmer property — 'all'
 *  or 'dimmer'. The effective-intensity machinery uses it: a fader
 *  that does not control Dimmer leaves the fixture's dimmer at the
 *  cue's full value, so the uncontrolled part of its output is not
 *  dimmed by the fader. */
export function faderControlsDimmer(control: LiveControl): boolean {
  const controls = faderControlsValue(control)
  return controls === 'all' || controls === 'dimmer'
}

/** Which properties the fader can be confined to: the ones this
 *  control's cue actually defines, in LightKey's order. Same source
 *  rule as the Modifiers applicability (liveModifiers.ts): the
 *  button's own cue if it has one, else its presets / sequences /
 *  ad-hoc values. A property counts when the cue defines it with a
 *  non-zero value — a Dimmer at 0 is not a property the fader can
 *  usefully scale. */
export function faderControlOptions(
  control: LiveControl,
  cues: CueDef[],
  presets: PresetDef[],
  fixtures: FixtureDef[]
): FaderControlPropertyDef[] {
  const cue = control.cueId ? cues.find((item) => item.id === control.cueId) : undefined
  const source: CueDef = cue ?? {
    id: control.id,
    name: control.name,
    presetIds: control.presetIds ?? [],
    sequenceIds: control.sequenceIds ?? [],
    fixtureValues: control.adHocValues ?? {},
    fadeMs: 0
  }
  const values = resolveCueValues(source, presets, fixtures)
  const attrs = new Set<string>()
  for (const patch of Object.values(values)) {
    for (const [attr, value] of Object.entries(patch)) {
      if (typeof value === 'number' && value !== 0) attrs.add(attr.toLowerCase())
    }
  }
  return FADER_CONTROL_PROPERTIES.filter((prop) => [...attrs].some((attr) => prop.matches(attr)))
}

/** Full Controls dropdown: All Properties first, then every
 *  property in LightKey's order — enabled where the cue defines it,
 *  greyed where it does not (Jake's screenshots, 27 Nov 2026: only
 *  properties the selected fixtures actually have are enabled). */
export function faderControlsDropdownOptions(
  control: LiveControl,
  cues: CueDef[],
  presets: PresetDef[],
  fixtures: FixtureDef[]
): { value: 'all' | FaderControlProperty; label: string; enabled: boolean }[] {
  const defined = new Set(faderControlOptions(control, cues, presets, fixtures).map((prop) => prop.key))
  return [
    { value: 'all' as const, label: FADER_CONTROLS_LABELS.all, enabled: true },
    ...FADER_CONTROL_PROPERTIES.map((prop) => ({ value: prop.key, label: FADER_CONTROLS_LABELS[prop.key], enabled: defined.has(prop.key) }))
  ]
}

/** Attributes a fader cannot fade: their value flips when the fader
 *  crosses 50% (guide p.216), instead of scaling. */
export const NON_FADEABLE_ATTRIBUTES = ['shutter', 'gobo'] as const

/** The fader level (0–255) at which a non-fadeable property flips on. */
export const FADER_MIDPOINT = 128

export interface SplitFaderValues {
  /** Attributes the fader value scales — values already pre-scaled by
   *  level/255 (except Shutter / Gobo, which flip at the midpoint
   *  instead of scaling). The caller computes this set with the plain
   *  master, so the level lands exactly once. */
  scaled: FixtureValuePatch
  /** Attributes that apply at full master while the fader is above 0. */
  full: FixtureValuePatch
}

/** Split one fixture-values patch by the fader's Controls setting.
 *  'all': everything is scaled — except Shutter / Gobo below the
 *  50% midpoint, which do not apply at all until the fader crosses
 *  it, and which pass through unscaled above it (they flip, they do
 *  not fade — guide p.216). Confined to one property: that property's
 *  attributes are scaled, everything else applies at full master
 *  while the fader is above 0 (a Shutter / Gobo in the uncontrolled
 *  set applies whenever the cue is active — the fader does not
 *  govern it). The scaled values are pre-scaled by level/255 here:
 *  the caller's scaledMaster only scales dimmer attributes, so a
 *  Pan or Color fader scaled that way would do nothing. */
export function splitFaderValues(
  values: FixtureValuePatch,
  controls: 'all' | FaderControlProperty,
  level: number
): SplitFaderValues {
  const scaled: FixtureValuePatch = {}
  const full: FixtureValuePatch = {}
  const def = controls === 'all' ? undefined : FADER_CONTROL_PROPERTIES.find((p) => p.key === controls)
  for (const [fixtureId, patch] of Object.entries(values)) {
    const scaledPatch: Record<string, number> = {}
    const fullPatch: Record<string, number> = {}
    for (const [attr, value] of Object.entries(patch)) {
      if (typeof value !== 'number') continue
      const lower = attr.toLowerCase()
      if (NON_FADEABLE_ATTRIBUTES.includes(lower as (typeof NON_FADEABLE_ATTRIBUTES)[number])) {
        // Non-fadeable: flips at the midpoint when the fader governs
        // it, applies whenever active when it does not.
        if (def === undefined) {
          if (level >= FADER_MIDPOINT) scaledPatch[attr] = value
        } else {
          fullPatch[attr] = value
        }
        continue
      }
      if (def === undefined || def.matches(attr)) scaledPatch[attr] = Math.round((value * level) / 255)
      else fullPatch[attr] = value
    }
    if (Object.keys(scaledPatch).length) scaled[fixtureId] = scaledPatch
    if (Object.keys(fullPatch).length) full[fixtureId] = fullPatch
  }
  return { scaled, full }
}
