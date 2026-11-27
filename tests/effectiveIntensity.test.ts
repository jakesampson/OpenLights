import { describe, expect, it } from 'vitest'
import { effectiveIntensityLevels, liveIntensityLevels, resolvedActiveCueValues, withEffectiveIntensity } from '../src/renderer/src/lib/effectiveIntensity'
import type { CueDef, PresetDef } from '../src/shared/types'

const cue: CueDef = {
  id: 'cue', name: 'Home', fadeMs: 0,
  fixtureValues: { a: { intensity: 100, red: 255 }, b: { red: 255 } }
}
const presets: PresetDef[] = [
  { id: 'p1', name: 'Dim', category: 'Colour', fixtureValues: { a: { intensity: 150 } } },
  { id: 'p2', name: 'Bright', category: 'Colour', fixtureValues: { a: { intensity: 200 }, b: { intensity: 50 } } }
]

describe('effectiveIntensityLevels', () => {
  it('takes the intensity from the highest layer that defines one, per fixture', () => {
    const levels = effectiveIntensityLevels({
      cueValues: cue.fixtureValues,
      activePresetIds: ['p1', 'p2'],
      presets,
      manualOverrides: { b: { intensity: 220 } }
    })
    // a: cue 100 < preset p1 150 < preset p2 200, no override → 200.
    expect(levels.a).toBe(200)
    // b: cue has no intensity, preset p2 50, override 220 → 220.
    expect(levels.b).toBe(220)
  })

  it('leaves a fixture out when no source defines an intensity for it', () => {
    const levels = effectiveIntensityLevels({
      cueValues: { a: { red: 255 } },
      activePresetIds: [],
      presets: [],
      manualOverrides: {}
    })
    expect(levels).toEqual({})
  })

  it('ignores a later preset that does not mention the fixture', () => {
    const levels = effectiveIntensityLevels({
      cueValues: {},
      activePresetIds: ['p1'],
      presets,
      manualOverrides: {}
    })
    expect(levels.a).toBe(150)
    expect(levels.b).toBeUndefined()
  })
})

describe('withEffectiveIntensity', () => {
  it('merges the level into fixtures already present and invents no entries', () => {
    const merged = withEffectiveIntensity(
      { a: { red: 255, green: 0, blue: 255 }, b: { red: 0 } },
      { a: 200, c: 100 }
    )
    expect(merged).toEqual({ a: { red: 255, green: 0, blue: 255, intensity: 200 }, b: { red: 0 } })
  })

  it('returns the values untouched when there are no levels', () => {
    const values = { a: { red: 255 } }
    expect(withEffectiveIntensity(values, {})).toBe(values)
  })
})

describe('resolvedActiveCueValues', () => {
  it('returns an empty patch with no active cue', () => {
    expect(resolvedActiveCueValues([cue], presets, null)).toEqual({})
    expect(resolvedActiveCueValues([cue], presets, 'missing')).toEqual({})
  })

  it('resolves the active cue through its presets', () => {
    const cueWithPreset: CueDef = { ...cue, presetIds: ['p1'], fixtureValues: { b: { blue: 255 } } }
    const values = resolvedActiveCueValues([cueWithPreset], presets, 'cue')
    // p1's intensity for a reaches the resolved values; the cue's own
    // ad-hoc blue for b stays.
    expect(values.a?.intensity).toBe(150)
    expect(values.b?.blue).toBe(255)
  })
})

describe('liveIntensityLevels', () => {
  it('does not crash on a control without presetIds (probe, 28 Nov 2026)', () => {
    // A control with no presetIds field (a hand-written or older show
    // file — migrateShow normalises cues, not controls, and
    // newCueObject always sets it, so a file can arrive without it)
    // used to throw "control.presetIds is not iterable" the moment the
    // button was clicked, blanking the whole app — the same latent
    // class the 27 Nov regression fix guarded in three other places.
    // The cue's own intensity still lands; the missing list just reads
    // as empty.
    const levels = liveIntensityLevels({
      controls: [{ id: 'btn', name: 'Violet', type: 'push', x: 0, y: 0, cue: { id: 'c', name: 'Violet', fadeMs: 500, fixtureValues: { a: { intensity: 200 } } } } as never],
      levels: { btn: 255 },
      presets,
      fixtures: []
    })
    expect(levels.a).toBe(200)
  })
})
