import type { CueDef, FixtureDef, PresetDef } from './types'
import { fanColourToBeams, fixtureChannelMap } from './fixtureProfiles'

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
  // Preset contributions first, merged in list order. Each preset's
  // fanned patch is completed (completeBaseColour) BEFORE merging —
  // the most recently listed colour preset wins entirely, mirroring
  // the palette layer (App.tsx presets effect): a preset that names
  // part of a fixture's base colour names the whole of it, so Red
  // then Green resolves green-only, not red+green (Jake, 22 Nov
  // 2026 — the most recently turned-on colour preset overrides
  // everything else; otherwise a forgotten first preset gives weird
  // colours that are hard to chase down live). Different properties
  // still combine: a dimmer-only preset names no base colour, so the
  // fill leaves it untouched and it lifts whatever colour preset is
  // under it.
  const presetValues: Record<string, Record<string, number>> = {}
  for (const id of cue.presetIds ?? []) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) continue
    const completed = completeBaseColour(fanPresetFixtureValues(preset.fixtureValues ?? {}, fixtures), fixtures)
    for (const [fixtureId, patch] of Object.entries(completed)) {
      presetValues[fixtureId] = { ...presetValues[fixtureId], ...patch }
    }
  }
  const values: Record<string, Record<string, number>> = presetValues
  // Ad-hoc properties last, exactly as written: the operator's values
  // win over any preset, and resolution must not invent values the cue
  // never programmed (a per-beam ad-hoc red stays beam-1-only). A
  // partial ad-hoc colour can therefore still leak the default blue
  // through the zero-missing fill — Jake's cues carry complete ad-hoc
  // values in practice, so that case stays open.
  for (const [fixtureId, patch] of Object.entries(cue.fixtureValues ?? {})) {
    values[fixtureId] = { ...values[fixtureId], ...patch }
  }
  return values
}

/**
 * Group a fixture's colour attributes by pod (cell): the first pod's
 * colours are bare ("red") and later pods carry their pod number
 * ("red 2" in OFL profiles, "red2" in built-ins) — the same grouping
 * lib/colorMix.ts makes. Per pod, the CMY set when the pod has all
 * three, otherwise the RGB channels it has.
 */
function baseColourAttributes(attributes: string[]): string[] {
  const pods = new Map<number, Map<string, string>>()
  for (const attr of attributes) {
    const match = /^(red|green|blue|white|amber|uv|cyan|magenta|yellow|lime) ?(\d+)?$/i.exec(attr)
    if (!match) continue
    const pod = match[2] ? Number(match[2]) : 1
    const entry = pods.get(pod) ?? new Map<string, string>()
    entry.set(match[1].toLowerCase(), attr)
    pods.set(pod, entry)
  }
  const result: string[] = []
  for (const [, attrs] of [...pods].sort((a, b) => a[0] - b[0])) {
    if (['cyan', 'magenta', 'yellow'].every((a) => attrs.has(a))) result.push(attrs.get('cyan')!, attrs.get('magenta')!, attrs.get('yellow')!)
    else for (const a of ['red', 'green', 'blue']) { const channel = attrs.get(a); if (channel) result.push(channel) }
  }
  return result
}

/**
 * Base-colour completion (Jake, 22 Nov 2026): a look that names any part
 * of a fixture's base colour — RGB, or CMY where the fixture has all
 * three — names the whole base colour; the parts it does not name are 0,
 * not "whatever the layer underneath says". Without this, a Red preset
 * over the lifted default blue (a dimmer alone raises blue, Jake
 * 22 Nov 2026) comes out magenta: the base blue leaks through the blue
 * channel the preset never wrote. White / Amber / UV / Lime are separate
 * LEDs and independent properties (Guide p.85), so they are never filled
 * and never trigger the fill. A look that names no base colour at all (a
 * dimmer-only look) is untouched. Apply after fanning, so the fill covers
 * every beam of a multipart fixture.
 *
 * The presets and live layers apply the same rule at output time
 * (lib/presetColor.ts `completePresetBaseColour`, which re-exports this
 * function); resolving it here, in the cue, is what stops a cue
 * referencing a colour-only preset from leaking the default blue
 * through `computeCueChannels`' zero-missing fill. resolveCueValues
 * applies it to each preset's fanned patch before merging in list
 * order, so the most recently listed colour preset wins entirely
 * (Jake, 22 Nov 2026). Newly captured presets carry the zeros in the
 * file itself (showStore.ts capturePresetFromLook), so the file says
 * what the engine does.
 */
export function completeBaseColour(
  fixtureValues: Record<string, Record<string, number>>,
  fixtures: FixtureDef[]
): Record<string, Record<string, number>> {
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const result: Record<string, Record<string, number>> = {}
  for (const [fixtureId, patch] of Object.entries(fixtureValues)) {
    const fixture = byId.get(fixtureId)
    const completed = { ...patch }
    if (fixture) {
      const base = baseColourAttributes(Object.keys(fixtureChannelMap(fixture)))
      if (base.some((attr) => attr in patch)) {
        for (const attr of base) if (!(attr in completed)) completed[attr] = 0
      }
    }
    result[fixtureId] = completed
  }
  return result
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
