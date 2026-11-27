// LightKey's button modifiers (guide ch.11, pp.205–207; Jake's
// screenshot, 27 Nov 2026). A modifier alters the final output of a
// cue — the menu lists the same sixteen, and selecting one marks it to
// be controlled in the Live view (guide p.207: "Select the modifiers
// you would like to control"). Only modifiers which apply to the cue
// are enabled (guide p.207 — "for example, Pan Angle is only available
// if the cue defines the Position property for at least one fixture");
// the rest are greyed.
//
// The applicability rules below follow the guide's per-modifier
// descriptions. Two are inferences from how this app stores values,
// marked as such: Color Temperature reads the cue's White/Amber
// channels (the warm/cool components — the app has no separate colour
// temperature property), and Green Saturation reads the cue's Green
// channel. Xfade to Color has no counterpart in the app's cue values,
// so it never applies here. If Jake's LightKey tests show otherwise,
// the rule — not the list — is what changes.
import { resolveCueValues } from '@shared/cueResolution'
import { fixtureMode } from '@shared/fixtureProfiles'
import type { CueDef, EffectDef, FixtureDef, LiveControl, PresetDef, SequenceDef, SpeedModifierAspect } from '@shared/types'

export type LiveModifierKey =
  | 'speed' | 'beatMultiplier' | 'timeOffset' | 'fadeTime' | 'dimmer'
  | 'hue' | 'colorTemperature' | 'greenSaturation' | 'xfadeToColor'
  | 'pan' | 'tilt' | 'focus' | 'zoomAngle' | 'irisSize' | 'frostAmount' | 'fogAmount'

export const LIGHTKEY_MODIFIERS: { key: LiveModifierKey; label: string }[] = [
  { key: 'speed', label: 'Speed' },
  { key: 'beatMultiplier', label: 'Beat Multiplier' },
  { key: 'timeOffset', label: 'Time Offset' },
  { key: 'fadeTime', label: 'Fade Time' },
  { key: 'dimmer', label: 'Dimmer' },
  { key: 'hue', label: 'Hue' },
  { key: 'colorTemperature', label: 'Color Temperature' },
  { key: 'greenSaturation', label: 'Green Saturation' },
  { key: 'xfadeToColor', label: 'Xfade to Color' },
  { key: 'pan', label: 'Pan' },
  { key: 'tilt', label: 'Tilt' },
  { key: 'focus', label: 'Focus' },
  { key: 'zoomAngle', label: 'Zoom Angle' },
  { key: 'irisSize', label: 'Iris Size' },
  { key: 'frostAmount', label: 'Frost Amount' },
  { key: 'fogAmount', label: 'Fog Amount' },
]

/** Which aspects the Speed modifier can affect (guide ch.11,
 *  pp.206–207, the Speed modifier's Options menu — "You can choose
 *  exactly which aspects of the cue are affected by the modifier"). */
export const SPEED_MODIFIER_OPTIONS: { key: SpeedModifierAspect; label: string }[] = [
  { key: 'sequenceSpeed', label: 'Sequence Speed' },
  { key: 'effectSpeed', label: 'Effect Speed' },
  { key: 'rainbowSpeed', label: 'Rainbow Speed' },
  { key: 'vectorSpeed', label: 'Vector Speed' },
  { key: 'infinitePanTiltSpeed', label: 'Infinite Pan/Tilt Speed' },
  { key: 'goboRotationSpeed', label: 'Gobo Rotation Speed' },
  { key: 'goboShakeSpeed', label: 'Gobo Shake Speed' },
  { key: 'goboChangeSpeed', label: 'Gobo Change Speed' },
  { key: 'strobeSpeed', label: 'Strobe Speed' },
  { key: 'shutterPulseSpeed', label: 'Shutter Pulse Speed' },
  { key: 'prismRotationSpeed', label: 'Prism Rotation Speed' },
]

/** Which Speed aspects apply to this button's cue (guide p.207 —
 *  "only options which apply to the cue are enabled (for example,
 *  Gobo Rotation Speed is only available if at least one fixture in
 *  the cue has a rotating gobo)"). Sequence / Effect Speed follow
 *  the cue's manual-timing sequences and effects; the gobo / strobe
 *  / shutter / prism aspects follow the cue fixtures' channels.
 *  Two are inferences from how this app stores effects: Rainbow is
 *  matched by effect name (the Rainbow templates name the effect so),
 *  and Vector / Infinite Pan-Tilt are both offered for any movement
 *  effect — the app does not distinguish vector mode from infinite
 *  pan/tilt movement, so narrowing those two needs Jake's LightKey
 *  test. */
export function applicableSpeedOptions(
  control: LiveControl,
  // Kept for the existing call sites (menus pass the collected inline
  // cues); the cue itself now comes from the control — see below.
  _cues: CueDef[],
  presets: PresetDef[],
  fixtures: FixtureDef[],
  sequences: SequenceDef[],
  effects: EffectDef[]
): Set<SpeedModifierAspect> {
  // Inline cues (Jake, 27 Nov 2026): the button's cue is control.cue.
  // When the button holds no cue, its own presetIds / sequenceIds /
  // adHocValues are the cue — that is also what the menus' synthetic
  // controls carry (they mirror a step/button cue's contents onto
  // those lists), so they keep working unchanged. Do not remove the
  // menus' mirroring here; it is a later cleanup, not this change.
  const cue = control.cue
  const source: CueDef = cue ?? {
    id: control.id,
    name: control.name,
    presetIds: control.presetIds ?? [],
    sequenceIds: control.sequenceIds ?? [],
    fixtureValues: control.adHocValues ?? {},
    fadeMs: 0
  }
  const values = resolveCueValues(source, presets, fixtures)
  const sequenceIds = [...(cue?.sequenceIds ?? []), ...(control.sequenceIds ?? [])]
  const cueSequences = sequenceIds.map((id) => sequences.find((s) => s.id === id)).filter((s): s is SequenceDef => !!s)
  const effectIds = control.effectIds ?? []
  const cueEffects = effectIds.map((id) => effects.find((e) => e.id === id)).filter((e): e is EffectDef => !!e)
  const cueFixtureIds = new Set([...Object.keys(values), ...cueEffects.flatMap((e) => e.fixtureIds ?? [])])
  const cueFixtures = fixtures.filter((f) => cueFixtureIds.has(f.id))
  const hasChannel = (attr: string) =>
    cueFixtures.some((f) => (fixtureMode(f)?.channels ?? []).some((c) => c.attribute.toLowerCase() === attr))
  const out = new Set<SpeedModifierAspect>()
  if (cueSequences.some((s) => s.timing === 'manual')) out.add('sequenceSpeed')
  if (cueEffects.some((e) => !e.syncToBpm)) out.add('effectSpeed')
  if (cueEffects.some((e) => e.name.toLowerCase().includes('rainbow'))) out.add('rainbowSpeed')
  if (cueEffects.some((e) => e.kind === 'movement')) {
    out.add('vectorSpeed')
    out.add('infinitePanTiltSpeed')
  }
  if (hasChannel('gobo')) {
    out.add('goboRotationSpeed')
    out.add('goboShakeSpeed')
    out.add('goboChangeSpeed')
  }
  if (hasChannel('strobe')) out.add('strobeSpeed')
  if (hasChannel('shutter')) out.add('shutterPulseSpeed')
  if (hasChannel('prism')) out.add('prismRotationSpeed')
  return out
}

/** Which modifiers apply to this button's cue (guide p.207). The cue
 *  is the button's own cue if it has one, else its presets / sequences
 *  / ad-hoc values, exactly as the button's colour resolves them. */
export function applicableModifiers(
  control: LiveControl,
  // Kept for the existing call sites (menus pass the collected inline
  // cues); the cue itself now comes from the control — see below.
  _cues: CueDef[],
  presets: PresetDef[],
  fixtures: FixtureDef[],
  sequences: SequenceDef[],
  effects: EffectDef[]
): Set<LiveModifierKey> {
  // Inline cues (Jake, 27 Nov 2026): the button's cue is control.cue.
  // When the button holds no cue, its own presetIds / sequenceIds /
  // adHocValues are the cue — that is also what the menus' synthetic
  // controls carry (they mirror a step/button cue's contents onto
  // those lists), so they keep working unchanged. Do not remove the
  // menus' mirroring here; it is a later cleanup, not this change.
  const cue = control.cue
  const source: CueDef = cue ?? {
    id: control.id,
    name: control.name,
    presetIds: control.presetIds ?? [],
    sequenceIds: control.sequenceIds ?? [],
    fixtureValues: control.adHocValues ?? {},
    fadeMs: 0
  }
  const values = resolveCueValues(source, presets, fixtures)
  const has = (key: string) => Object.values(values).some((patch) => (patch[key] ?? 0) !== 0)
  const sequenceIds = [...(cue?.sequenceIds ?? []), ...(control.sequenceIds ?? [])]
  const cueSequences = sequenceIds.map((id) => sequences.find((s) => s.id === id)).filter((s): s is SequenceDef => !!s)
  const effectIds = control.effectIds ?? []
  const cueEffects = effectIds.map((id) => effects.find((e) => e.id === id)).filter((e): e is EffectDef => !!e)
  const out = new Set<LiveModifierKey>()
  // Speed affects the speed of the cue's sequences and effects (p.206),
  // so it applies when the cue has any.
  if (cueSequences.length > 0 || cueEffects.length > 0) out.add('speed')
  // Beat Multiplier affects beat-controlled sequences and effects (p.206).
  if (cueSequences.some((s) => s.timing === 'beat') || cueEffects.some((e) => e.syncToBpm)) out.add('beatMultiplier')
  // Time Offset is added to chase patterns, curves and movement effects
  // (p.206).
  if (cueEffects.some((e) => e.attribute === 'pan' || e.attribute === 'tilt' || e.attribute === 'position' || e.kind === 'movement' || e.kind === 'pattern' || e.kind === 'curve' || e.pattern !== undefined)) out.add('timeOffset')
  // Fade Time extends or shortens a cue's fade times (p.206) — every
  // cue has fade times.
  out.add('fadeTime')
  if (has('intensity')) out.add('dimmer')
  if (has('red') || has('green') || has('blue') || has('cyan') || has('magenta') || has('yellow')) out.add('hue')
  // Inference: the app has no colour-temperature property; White/Amber
  // are the warm/cool channels, so a cue that defines them can take a
  // colour-temperature shift.
  if (has('white') || has('amber')) out.add('colorTemperature')
  // Inference: Green Saturation shifts the cue's green values.
  if (has('green')) out.add('greenSaturation')
  // Xfade to Color multiplies the cue's xfade-to-color values (p.207);
  // the app stores no such values, so it never applies here.
  if (has('pan')) out.add('pan')
  if (has('tilt')) out.add('tilt')
  if (has('focus')) out.add('focus')
  if (has('zoom')) out.add('zoomAngle')
  if (has('iris')) out.add('irisSize')
  if (has('frost')) out.add('frostAmount')
  if (has('fog')) out.add('fogAmount')
  return out
}
