// Cue resolution (Piece 8, LightKey Guide ch.11 pp.199–202): a cue is
// built from the presets it references, in list order, plus its own
// ad-hoc properties — which win over any preset.
import { describe, expect, it } from 'vitest'
import { resolveCue, resolveCueValues } from '../src/shared/cueResolution'
import type { CueDef, FixtureDef, PresetDef } from '../src/shared/types'

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

  it('the most recently listed colour preset wins entirely', () => {
    // Jake, 22 Nov 2026 (LightKey stacking): the most recently
    // turned-on colour preset overrides everything else — Red then
    // Green gives green-only, not red+green. p2 only names green, so
    // its completion zeroes red and blue before merging, and the later
    // preset wins every channel of the base colour.
    const values = resolveCueValues(
      cue({ presetIds: ['p1', 'p2'], fixtureValues: {} }),
      [
        preset('p1', { f1: { red: 255, green: 0, blue: 0 } }),
        preset('p2', { f1: { green: 200 } })
      ],
      [{ id: 'f1', name: 'Par 1', type: 'par', channelStart: 1, channels: 4 }] as FixtureDef[]
    )
    expect(values).toEqual({ f1: { red: 0, green: 200, blue: 0 } })
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

describe('base-colour completion', () => {
  // Jake, 22 Nov 2026: a cue referencing a colour-only preset must not
  // leak the fixture's default blue through computeCueChannels'
  // zero-missing fill — a look that names part of the base colour
  // names the whole of it. p1: par with a hardware dimmer; q1: Q12BT
  // (rgba-4ch, no intensity channel, amber is a separate LED).
  const fixtures = [
    { id: 'p1', name: 'Par 1', type: 'par', channelStart: 1, channels: 4 },
    { id: 'q1', name: 'Q12BT 1', type: 'rgba-4ch', channelStart: 20, channels: 4 }
  ] as FixtureDef[]

  it('a cue referencing a Red-only preset resolves green and blue to zero', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['p1'], fixtureValues: {} }),
      [preset('p1', { q1: { red: 255 } })],
      fixtures
    )
    expect(values.q1).toEqual({ red: 255, green: 0, blue: 0 })
  })

  it('a dimmer-only preset is untouched (no base colour named)', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['p1'], fixtureValues: {} }),
      [preset('p1', { q1: { intensity: 255 } })],
      fixtures
    )
    expect(values.q1).toEqual({ intensity: 255 })
  })

  it('an amber-only preset neither fills nor triggers the fill', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['p1'], fixtureValues: {} }),
      [preset('p1', { q1: { amber: 200 } })],
      fixtures
    )
    expect(values.q1).toEqual({ amber: 200 })
  })

  it('ad-hoc values pass through untouched — only preset contributions are completed', () => {
    // Resolution must not invent values the cue never programmed (a
    // per-beam ad-hoc red stays beam-1-only). A partial ad-hoc colour
    // can still leak the default blue — Jake's cues carry complete
    // ad-hoc values in practice, so that case stays open.
    const values = resolveCueValues(
      cue({ fixtureValues: { q1: { red: 255 } } }),
      [],
      fixtures
    )
    expect(values.q1).toEqual({ red: 255 })
  })

  it('a red preset plus a green ad-hoc value fills only the blue', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['p1'], fixtureValues: { q1: { green: 200 } } }),
      [preset('p1', { q1: { red: 255 } })],
      fixtures
    )
    expect(values.q1).toEqual({ red: 255, green: 200, blue: 0 })
  })

  it('old-style partial presets stack most-recent-wins: Red then Green is green-only', () => {
    // Jake, 22 Nov 2026 (LightKey stacking): the presets carry no
    // zeros in the file, so the per-preset completion in
    // resolveCueValues is what makes the later preset win entirely.
    const values = resolveCueValues(
      cue({ presetIds: ['p1', 'p2'], fixtureValues: {} }),
      [
        preset('p1', { q1: { red: 255 } }),
        preset('p2', { q1: { green: 255 } })
      ],
      fixtures
    )
    expect(values.q1).toEqual({ red: 0, green: 255, blue: 0 })
  })

  it('old-style partial presets stack most-recent-wins: Green then Red is red-only', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['p1', 'p2'], fixtureValues: {} }),
      [
        preset('p1', { q1: { green: 255 } }),
        preset('p2', { q1: { red: 255 } })
      ],
      fixtures
    )
    expect(values.q1).toEqual({ red: 255, green: 0, blue: 0 })
  })

  it('a colour preset plus a dimmer preset still combine', () => {
    // Different properties still combine (Jake, 22 Nov 2026): the
    // dimmer-only preset names no base colour, so the fill leaves it
    // untouched and it lifts the colour preset under it.
    const values = resolveCueValues(
      cue({ presetIds: ['p1', 'p2'], fixtureValues: {} }),
      [
        preset('p1', { q1: { red: 255 } }),
        preset('p2', { q1: { intensity: 255 } })
      ],
      fixtures
    )
    expect(values.q1).toEqual({ red: 255, green: 0, blue: 0, intensity: 255 })
  })

  it('a fixture the cue never mentions stays out of the result', () => {
    const values = resolveCueValues(
      cue({ presetIds: ['p1'], fixtureValues: {} }),
      [preset('p1', { p1: { red: 255 } })],
      fixtures
    )
    expect(values).toEqual({ p1: { red: 255, green: 0, blue: 0 } })
    expect(values.q1).toBeUndefined()
  })
})
