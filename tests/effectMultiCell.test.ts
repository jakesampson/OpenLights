// Jake, 27 Nov 2026 — PB1: a multi-cell PAR bar under the K.I.T.T.
// colour scanner stayed dark, and an effect with no fixtures used to
// mean "all fixtures". The engine writes every cell's colour
// correctly; the fixture stayed dark because a colour effect never
// opened its physical dimmer — the dimmer gates the colour both on
// DMX and in the Preview — while a fixture with no dimmer channel
// (virtual dimmer) lights from the colour alone.
import { describe, expect, it } from 'vitest'
import type { EffectDef, FixtureDef } from '../src/shared/types'
import { computeEffectPatch } from '../src/renderer/src/lib/effects'
import { computePatternPatch } from '../src/renderer/src/lib/patternRuntime'
import { frameBrightness } from '../src/renderer/src/lib/output'
import { previewCellBeams, previewFixtureValues } from '../src/renderer/src/lib/previewOutput'
import { migrateShow } from '../src/shared/migrations'

// PB1 as Jake patched it: the built-in 4-cell pixel bar (17ch), master
// dimmer on channel 13, cells on channels 1-12 (RGB per cell).
const pb1: FixtureDef = {
  id: 'pb1', name: 'PB1', type: 'par', profileId: 'pan-4x1x30-17ch',
  channelStart: 1, channels: 17, universe: 1,
  previewPosition: { x: 400, y: 300 },
}
// A Q12BT-style wash: no dimmer channel, colour is the output.
const q1: FixtureDef = {
  id: 'q1', name: 'Q1', type: 'par', profileId: 'simger-q12bt-rgba-4ch',
  channelStart: 18, channels: 4, universe: 1,
  previewPosition: { x: 200, y: 300 },
}

const kitt: EffectDef = {
  id: 'kitt', name: 'K.I.T.T.', fixtureIds: ['pb1', 'q1'], attribute: 'color',
  waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 128,
  phaseSpread: 0, enabled: true, kind: 'pattern', pattern: 'scanner',
  samples: [{ id: 'bg', color: '#000000' }, { id: 'fg', color: '#ff0000' }],
  durationMs: 2000, timingMode: 'fixed', length: 1, overshoot: 0,
}

describe('multi-cell fixtures under effects (Jake, 27 Nov 2026)', () => {
  it('a colour scanner writes every cell of the pixel bar, in turn', () => {
    // The eye (length 1) sweeps cells 1-4, then the wash.
    expect(computePatternPatch([pb1, q1], kitt, 0, 120)[1]).toBe(255)
    expect(computePatternPatch([pb1, q1], kitt, 0.25, 120)[4]).toBe(255)
    expect(computePatternPatch([pb1, q1], kitt, 0.5, 120)[7]).toBe(255)
    expect(computePatternPatch([pb1, q1], kitt, 0.75, 120)[10]).toBe(255)
    expect(computePatternPatch([pb1, q1], kitt, 1, 120)[18]).toBe(255)
  })

  it('a colour effect opens the dimmer of a fixture it lights, and only then', () => {
    // Eye on PB1's cell 3: red 255 on channel 7 and the master dimmer
    // (channel 13) open, so the cell actually lights.
    const on = computePatternPatch([pb1, q1], kitt, 0.5, 120)
    expect(on[7]).toBe(255)
    expect(on[13]).toBe(255)
    // Eye on the wash: PB1's cells are black, so its dimmer is left
    // alone — the effect never closes a dimmer it did not open.
    const off = computePatternPatch([pb1, q1], kitt, 1, 120)
    expect(off[7]).toBe(0)
    expect(off[13]).toBeUndefined()
    expect(off[18]).toBe(255)
  })

  it('a dimmer effect drives the bar through its master dimmer alone', () => {
    const chase: EffectDef = {
      ...kitt, id: 'dim-chase', name: 'Dimmer Chase', attribute: 'intensity',
      pattern: 'chase', samples: [{ id: 'bg', value: 0 }, { id: 'fg', value: 100 }],
    }
    // One pixel per fixture for a global dimmer — the four cells share
    // the master dimmer, as the hardware does.
    const patch = computeEffectPatch([pb1, q1], [chase], 1, 120)
    expect(patch[13]).toBe(255)
    expect(patch[1]).toBeUndefined()
    expect(patch[7]).toBeUndefined()
  })

  it('the Preview lights the cells once the dimmer is open', () => {
    const patch = computePatternPatch([pb1, q1], kitt, 0.5, 120)
    const frame = new Array(512).fill(0)
    for (const [ch, v] of Object.entries(patch)) frame[Number(ch) - 1] = v
    const values = previewFixtureValues(pb1, frame)
    expect(values.intensity).toBe(255)
    expect(frameBrightness(patch, pb1)).toBe(255)
    // The fallback opacity is the fixture's beam opacity from the
    // display dimmer (StagePreview): fully lit here.
    const cells = previewCellBeams(pb1, values, { color: '#0000ff', opacity: 1 })
    expect(cells).toHaveLength(4)
    expect(cells[2].color).toBe('#ff0000')
    expect(cells[2].opacity).toBe(1)
    expect(cells[0].color).toBe('#000000')
    expect(cells[0].opacity).toBe(0)
  })

  it('a colour curve opens the dimmer too', () => {
    const flat = (y: number): EffectDef => ({
      ...kitt, id: 'curve', name: 'Red curve', kind: 'curve', pattern: undefined,
      attribute: 'color', colorModel: 'rgb',
      curveComponents: [
        { component: 'red', points: [{ id: 'a', x: 0, y }, { id: 'b', x: 1, y }], curvedSegments: [false] },
        { component: 'green', points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }], curvedSegments: [false] },
        { component: 'blue', points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }], curvedSegments: [false] },
      ],
    })
    expect(computeEffectPatch([pb1], [flat(1)], 0, 120)[13]).toBe(255)
    expect(computeEffectPatch([pb1], [flat(0)], 0, 120)[13]).toBeUndefined()
  })

  it('a legacy single-channel colour effect opens the dimmer', () => {
    const red: EffectDef = {
      ...kitt, id: 'red-osc', name: 'Red oscillator', kind: 'curve',
      attribute: 'red', curveComponents: undefined, pattern: undefined,
      waveform: 'sine', offset: 128, size: 127,
    }
    // Sine peaks at a quarter cycle: red full on every cell, dimmer open.
    const patch = computeEffectPatch([pb1], [red], 0.5, 120)
    expect(patch[1]).toBe(255)
    expect(patch[13]).toBe(255)
  })

  it('an effect with no fixtures runs on nothing', () => {
    const none = computeEffectPatch([pb1, q1], [{ ...kitt, fixtureIds: [] }], 0.5, 120)
    expect(none).toEqual({})
  })

  it('migrateShow expands an empty fixture list to every fixture', () => {
    const show = migrateShow({
      fixtures: [pb1, q1],
      effects: [{ ...kitt, fixtureIds: [] }],
      effectTemplates: [{ ...kitt, id: 'tpl', fixtureIds: [] }],
    } as unknown as Parameters<typeof migrateShow>[0])
    expect(show.effects[0].fixtureIds).toEqual(['pb1', 'q1'])
    expect(show.effectTemplates[0].fixtureIds).toEqual(['pb1', 'q1'])
    // A list that already names fixtures is left exactly as stored.
    const kept = migrateShow({
      fixtures: [pb1, q1],
      effects: [{ ...kitt, fixtureIds: ['pb1'] }],
    } as unknown as Parameters<typeof migrateShow>[0])
    expect(kept.effects[0].fixtureIds).toEqual(['pb1'])
  })
})
