import type { CueDef, FixtureDef, LiveControl, PresetDef } from '@shared/types'
import { resolveCue, resolveCueValues } from '@shared/cueResolution'

export type FixtureValuePatch = Record<string, Record<string, number>>

export interface EffectiveIntensityInput {
  /** The active cue's resolved values (its presets in order, then its ad-hoc layer) — or {} when no cue is active. */
  cueValues: FixtureValuePatch
  /** Manually activated presets, in activation order — later wins, like the preset layer. */
  activePresetIds: string[]
  presets: PresetDef[]
  /** Design overrides (the dimmer drag, the wheel, the faders). */
  manualOverrides: FixtureValuePatch
  /** Intensities the pressed Live pads carry (Jake, 22 Nov 2026): a
   *  Live dimmer pad lifts an active palette preset — palette presets
   *  are active overrides, and the dimmer is a property of the
   *  fixture, not of one layer. Live wins last, like the live layer
   *  itself. Callers that only have the base look pass nothing here
   *  and get the cue/preset/override levels as before. */
  liveLevels?: Record<string, number>
}

/**
 * The intensity each fixture is effectively at (Jake, 20 Nov 2026):
 * the dimmer is a property of the fixture, not of one layer, so a
 * colour defined in one layer and a dimmer in another still meet. The
 * highest layer that defines an intensity for the fixture wins, in
 * the same order the output composes its layers (outputModel.ts):
 * the active cue's resolved values, then manually activated presets,
 * then the Design overrides, then the pressed Live pads.
 *
 * Sequences are deliberately not sources here: a sequence's intensity
 * animates and is scaled inside its own layer, so it never needs the
 * base look to know it. Live controls used to be excluded the same
 * way, but Jake's call of 22 Nov 2026 reversed that: a Live dimmer
 * pad lifts an active palette preset (and the default colour — see
 * defaultsPatch in showStore.ts), because the dimmer is a property of
 * the fixture, not of one layer. A fixture no source defines an
 * intensity for is absent: its dimmer is at its default, 0 (dark).
 */
export function effectiveIntensityLevels(input: EffectiveIntensityInput): Record<string, number> {
  const levels: Record<string, number> = {}
  const take = (values: FixtureValuePatch) => {
    for (const [fixtureId, patch] of Object.entries(values)) {
      const intensity = patch?.intensity
      if (typeof intensity === 'number' && Number.isFinite(intensity)) levels[fixtureId] = intensity
    }
  }
  take(input.cueValues)
  for (const id of input.activePresetIds) {
    const preset = input.presets.find((item) => item.id === id)
    if (preset) take(preset.fixtureValues ?? {})
  }
  take(input.manualOverrides)
  for (const [fixtureId, level] of Object.entries(input.liveLevels ?? {})) {
    if (Number.isFinite(level)) levels[fixtureId] = level
  }
  return levels
}

/**
 * The intensities the pressed Live pads carry (Jake, 22 Nov 2026): a
 * Live pad's dimmer is a property of the fixture, like a palette
 * preset's — a Full On pad must lift a Red pad's colour on a
 * virtual-dimmer fixture, which has no dimmer channel for the Full On
 * pad to write, so the two pads never meet at the channel level. The
 * palette path does this via effectiveIntensityLevels (which takes
 * these levels as its `liveLevels` input, Jake 22 Nov 2026); the live
 * layer needs the same levels computed here because its own patch
 * build runs per control. Later controls win, as in the patch build;
 * each pad's contribution is scaled by its pressed level. Callers
 * merge the result over effectiveIntensityLevels for the live layer only.
 */
export function liveIntensityLevels(input: {
  controls: LiveControl[]
  levels: Record<string, number>
  presets: PresetDef[]
  cues: CueDef[]
  fixtures: FixtureDef[]
}): Record<string, number> {
  const liveLevels: Record<string, number> = {}
  const take = (values: FixtureValuePatch, level: number) => {
    for (const [fixtureId, fixturePatch] of Object.entries(values)) {
      const intensity = fixturePatch?.intensity
      if (typeof intensity === 'number' && Number.isFinite(intensity)) liveLevels[fixtureId] = Math.round(intensity * level / 255)
    }
  }
  for (const control of input.controls) {
    const level = input.levels[control.id] ?? 0
    if (!level) continue
    const cue = input.cues.find((item) => item.id === control.cueId)
    if (cue && !cue.blackout) take(resolveCue(cue, input.presets, input.fixtures).fixtureValues, level)
    for (const id of control.presetIds) {
      const preset = input.presets.find((item) => item.id === id)
      if (preset) take(preset.fixtureValues ?? {}, level)
    }
    if (control.adHocValues) take(control.adHocValues, level)
  }
  return liveLevels
}

/**
 * Merge the effective intensities into a cue's fixture values, so a
 * look that carries colours resolves them against the dimmer the
 * fixture is actually at. Only fixtures already in the values gain
 * an intensity — a fixture a layer never mentions must not gain one
 * from a higher layer in that layer's own patch (it would sit above
 * the layer that owns the intensity and steal its precedence).
 */
export function withEffectiveIntensity(values: FixtureValuePatch, levels: Record<string, number>): FixtureValuePatch {
  if (!Object.keys(levels).length) return values
  const result: FixtureValuePatch = {}
  for (const [fixtureId, patch] of Object.entries(values)) {
    const level = levels[fixtureId]
    result[fixtureId] = level === undefined ? patch : { ...patch, intensity: level }
  }
  return result
}

/** The active cue's resolved values, for callers that only hold the cue. */
export function resolvedActiveCueValues(cues: CueDef[], presets: PresetDef[], activeCueId: string | null, fixtures: FixtureDef[] = []): FixtureValuePatch {
  const cue = cues.find((item) => item.id === activeCueId)
  return cue ? resolveCueValues(cue, presets, fixtures) : {}
}
