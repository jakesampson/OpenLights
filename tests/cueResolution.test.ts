// Cue resolution (Piece 8, LightKey Guide ch.11 pp.199–202): a cue is
// built from the presets it references, in list order, plus its own
// ad-hoc properties — which win over any preset.
import { describe, expect, it } from 'vitest'
import { resolveCue, resolveCueValues } from '../src/shared/cueResolution'
import type { CueDef, PresetDef } from '../src/shared/types'

const cue = (overrides: Partial<CueDef> = {}): CueDef => ({
  id: 'c1', name: 'Cue 1', fadeMs: 1000, fixtureValues: {}, ...overrides
})
const preset = (id: string, fixtureValues: PresetDef['fixtureValues']): PresetDef => ({
  id, name: id, category: 'color', fixtureValues
})

describe('resolveCueValues', () => {
  it('resolves a cue with no presets to its own ad-hoc values', () => {
    const values = resolveCueValues(
      cue({ fixtureValues: { f1: { intensity: 200, red: 10 } } }),
      []
    )
    expect(values).toEqual({ f1: { intensity: 200, red: 10 } })
  })

  it('applies presets in list order, later presets winning per property', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['p1', 'p2'], fixtureValues: {} }),
      [
        preset('p1', { f1: { red: 255, green: 0, blue: 0 } }),
        preset('p2', { f1: { green: 200 } })
      ]
    )
    // p2 only defines green, so red stays p1's 255 while green is p2's 200.
    expect(values).toEqual({ f1: { red: 255, green: 200, blue: 0 } })
  })

  it('lets the cue’s ad-hoc values win over any preset', () => {
    const values = resolveCueValues(
      cue({
        presetIds: ['p1'],
        fixtureValues: { f1: { red: 30 }, f2: { intensity: 90 } }
      }),
      [preset('p1', { f1: { red: 255, green: 40 }, f2: { intensity: 10, blue: 5 } })]
    )
    expect(values).toEqual({
      f1: { red: 30, green: 40 },
      f2: { intensity: 90, blue: 5 }
    })
  })

  it('skips preset ids that no longer exist', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['gone', 'p1'], fixtureValues: { f1: { blue: 7 } } }),
      [preset('p1', { f1: { red: 255 } })]
    )
    expect(values).toEqual({ f1: { red: 255, blue: 7 } })
  })

  it('brings in fixtures a preset defines that the cue does not mention', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['p1'], fixtureValues: { f1: { intensity: 100 } } }),
      [preset('p1', { f2: { intensity: 200, red: 255 } })]
    )
    expect(values).toEqual({ f1: { intensity: 100 }, f2: { intensity: 200, red: 255 } })
  })
})

describe('resolveCue', () => {
  it('keeps the cue’s identity and timing, replacing only its values', () => {
    const source = cue({
      name: 'Look', fadeMs: 800, blackout: false,
      presetIds: ['p1'], fixtureValues: { f1: { red: 10 } }
    })
    const resolved = resolveCue(source, [preset('p1', { f1: { red: 255, green: 5 } })])
    expect(resolved.id).toBe('c1')
    expect(resolved.name).toBe('Look')
    expect(resolved.fadeMs).toBe(800)
    expect(resolved.presetIds).toEqual(['p1'])
    expect(resolved.fixtureValues).toEqual({ f1: { red: 10, green: 5 } })
    // The source cue is untouched.
    expect(source.fixtureValues).toEqual({ f1: { red: 10 } })
  })
})
