import type { CueDef, FixtureDef, PresetDef } from './types'
import { fanColourToBeams } from './fixtureProfiles'

/**
 * Cue resolution (Piece 8, LightKey Guide ch.11 "Edit cue contents",
 * pp.199–202): a cue is built from the presets and sequences it
 * references, plus its own ad-hoc properties.
 *
 * Order, later wins: the cue's presets in list order, then the cue's
 * ad-hoc fixtureValues. A preset id that no longer exists is skipped,
 * so deleting a preset never breaks a cue that referenced it — the cue
 * simply loses that preset's contribution (its ad-hoc values stay).
 *
 * Sequences are not folded in here: they animate over time, so a cue's
 * sequences run as a separate layer while the cue is active (see
 * output.ts `configureSequences`); only the cue's static look resolves
 * through this module.
 */
/**
 * Fan a preset's stored values out to every beam of each multipart
 * fixture — the linked-wheel rule (Jake, 19 Nov 2026) at the point a
 * preset is applied: a preset's colour is the fixture's colour, so a
 * preset that stores only the bare colour (as presets written before
 * the fan-out did) still lights every cell. Ad-hoc values are never
 * fanned here — they are the operator's explicit per-fixture values
 * and the wheel already fans ad-hoc writes itself. Fixtures the
 * caller does not pass stay exactly as stored.
 */
export function fanPresetFixtureValues(
  fixtureValues: Record<string, Record<string, number>>,
  fixtures: FixtureDef[]
): Record<string, Record<string, number>> {
  if (!fixtures.length) return fixtureValues
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const result: Record<string, Record<string, number>> = {}
  for (const [fixtureId, patch] of Object.entries(fixtureValues)) {
    const fixture = byId.get(fixtureId)
    result[fixtureId] = fixture ? fanColourToBeams(fixture, patch) : { ...patch }
  }
  return result
}

export function resolveCueValues(
  cue: CueDef,
  presets: PresetDef[],
  fixtures: FixtureDef[] = []
): Record<string, Record<string, number>> {
  const values: Record<string, Record<string, number>> = {}
  for (const id of cue.presetIds ?? []) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) continue
    for (const [fixtureId, patch] of Object.entries(fanPresetFixtureValues(preset.fixtureValues ?? {}, fixtures))) {
      values[fixtureId] = { ...values[fixtureId], ...patch }
    }
  }
  // Ad-hoc properties last: the operator's overrides win over any preset.
  for (const [fixtureId, patch] of Object.entries(cue.fixtureValues ?? {})) {
    values[fixtureId] = { ...values[fixtureId], ...patch }
  }
  return values
}

/**
 * A cue with its preset references resolved to plain values — the shape
 * `computeCueChannels` already consumes. The cue's own fields (id, name,
 * fadeMs, blackout, fans, presetIds, sequenceIds) pass through untouched;
 * only the values are replaced by the resolved look.
 */
export function resolveCue(cue: CueDef, presets: PresetDef[], fixtures: FixtureDef[] = []): CueDef {
  return { ...cue, fixtureValues: resolveCueValues(cue, presets, fixtures) }
}
