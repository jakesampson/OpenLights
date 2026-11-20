import type { CueDef, FixtureDef, PresetDef } from '@shared/types'
import { resolveCueValues } from '@shared/cueResolution'

export type FixtureValuePatch = Record<string, Record<string, number>>

export interface EffectiveIntensityInput {
  /** The active cue's resolved values (its presets in order, then its ad-hoc layer) — or {} when no cue is active. */
  cueValues: FixtureValuePatch
  /** Manually activated presets, in activation order — later wins, like the preset layer. */
  activePresetIds: string[]
  presets: PresetDef[]
  /** Design overrides (the dimmer drag, the wheel, the faders). */
  manualOverrides: FixtureValuePatch
}

/**
 * The intensity each fixture is effectively at (Jake, 20 Nov 2026):
 * the dimmer is a property of the fixture, not of one layer, so a
 * colour defined in one layer and a dimmer in another still meet. The
 * highest layer that defines an intensity for the fixture wins, in
 * the same order the output composes its layers (outputModel.ts):
 * the active cue's resolved values, then manually activated presets,
 * then the Design overrides.
 *
 * Sequences and Live controls are deliberately not sources here: a
 * sequence's intensity animates and is scaled inside its own layer,
 * and a Live control's level reaches its colours through the scaled
 * master in the live layer — neither needs the base look to know it.
 * A fixture no source defines an intensity for is absent: its dimmer
 * is at its default, 0 (dark).
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
  return levels
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
