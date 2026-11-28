import { describe, expect, it } from 'vitest'
import type { EffectDef, FixtureDef } from '../src/shared/types'
import {
  computeEffectPatch,
  effectFrequency,
  mergeEffects,
  orderedEffectFixtures,
  waveformValue
} from '../src/renderer/src/lib/effects'

const fixtures: FixtureDef[] = [
  { id: 'f1', name: 'Front', type: 'par', channelStart: 1, channels: 4 },
  { id: 'f2', name: 'Head', type: 'moving-head', channelStart: 5, channels: 8 }
]

function effect(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    id: 'e1',
    name: 'Sine intensity',
    // An empty fixtureIds runs on nothing (Jake, 27 Nov 2026), so the
    // helper names both fixtures explicitly.
    fixtureIds: ['f1', 'f2'],
    attribute: 'intensity',
    waveform: 'sine',
    speed: 1,
    syncToBpm: false,
    size: 128,
    offset: 128,
    phaseSpread: 0,
    enabled: true,
    ...overrides
  }
}

describe('waveforms', () => {
  it('produces a full sine cycle', () => {
    expect(waveformValue('sine', 0)).toBeCloseTo(0)
    expect(waveformValue('sine', 0.25)).toBeCloseTo(1)
    expect(waveformValue('sine', 0.5)).toBeCloseTo(0)
    expect(waveformValue('sine', 0.75)).toBeCloseTo(-1)
  })

  it('produces triangle, square and saw shapes', () => {
    expect(waveformValue('triangle', 0)).toBeCloseTo(-1)
    expect(waveformValue('triangle', 0.5)).toBeCloseTo(1)
    expect(waveformValue('square', 0.25)).toBe(1)
    expect(waveformValue('square', 0.75)).toBe(-1)
    expect(waveformValue('saw', 0)).toBeCloseTo(-1)
    expect(waveformValue('saw', 0.5)).toBeCloseTo(0)
    expect(waveformValue('cosine', 0)).toBeCloseTo(1)
    expect(waveformValue('pulse', 0.1)).toBe(1)
    expect(waveformValue('pulse', 0.3)).toBe(-1)
    expect(waveformValue('smooth', 0.5)).toBeCloseTo(0)
  })

  it('steps random values per cycle, stably', () => {
    const a = waveformValue('random', 1.2, 0)
    const b = waveformValue('random', 1.8, 0)
    expect(a).toBe(b)
    expect(waveformValue('random', 2.1, 0)).not.toBe(a)
  })
})

describe('effect frequency', () => {
  it('syncs cycles to beats, or runs in Hz', () => {
    expect(effectFrequency(effect({ speed: 2, syncToBpm: true }), 120)).toBe(4)
    expect(effectFrequency(effect({ speed: 0.5, syncToBpm: false }), 120)).toBe(0.5)
  })
})

describe('effect fixture order', () => {
  it('orders forward, reverse, stable random and custom', () => {
    expect(orderedEffectFixtures(effect(), fixtures).map((item) => item.id)).toEqual(['f1', 'f2'])
    expect(orderedEffectFixtures(effect({ fixtureOrder: 'reverse' }), fixtures).map((item) => item.id)).toEqual(['f2', 'f1'])
    const random = orderedEffectFixtures(effect({ fixtureOrder: 'random' }), fixtures).map((item) => item.id)
    expect(orderedEffectFixtures(effect({ fixtureOrder: 'random' }), fixtures).map((item) => item.id)).toEqual(random)
    expect(orderedEffectFixtures(effect({ fixtureOrder: 'custom', customFixtureNumbers: { f2: 1, f1: 2 } }), fixtures).map((item) => item.id)).toEqual(['f2', 'f1'])
  })
})

describe('computeEffectPatch', () => {
  it('animates the targeted attribute around its offset', () => {
    const fx = effect()
    expect(computeEffectPatch(fixtures, [fx], 0, 120)[1]).toBe(128)
    expect(computeEffectPatch(fixtures, [fx], 0.25, 120)[1]).toBe(255)
    expect(computeEffectPatch(fixtures, [fx], 0.75, 120)[1]).toBe(0)
    // Head intensity is channel 5
    expect(computeEffectPatch(fixtures, [fx], 0.25, 120)[5]).toBe(255)
    // Untargeted colour channels are absent
    expect(computeEffectPatch(fixtures, [fx], 0.25, 120)[2]).toBeUndefined()
  })

  it('only touches the requested fixtures', () => {
    const patch = computeEffectPatch(fixtures, [effect({ fixtureIds: ['f2'] })], 0.25, 120)
    expect(patch[5]).toBe(255)
    expect(patch[1]).toBeUndefined()
  })

  it('fans out phases across fixtures', () => {
    const patch = computeEffectPatch(
      fixtures,
      [effect({ phaseSpread: 180 })],
      0.25,
      120
    )
    expect(patch[1]).toBe(255)
    // Second fixture is half a cycle behind
    expect(patch[5]).toBe(0)
  })

  it('scales dimming attributes by master, not pan/tilt', () => {
    const intensity = computeEffectPatch(fixtures, [effect()], 0.25, 120, 128)
    expect(intensity[1]).toBe(128)
    const pan = computeEffectPatch(
      fixtures,
      [effect({ attribute: 'pan', offset: 255, size: 0 })],
      0,
      120,
      128
    )
    expect(pan[6]).toBe(255)
  })

  it('maps every curve to explicit minimum and maximum values on any property', () => {
    const low = computeEffectPatch(fixtures, [effect({ waveform: 'square', minValue: 40, maxValue: 200, attribute: 'red' })], 0.75, 120)
    const high = computeEffectPatch(fixtures, [effect({ waveform: 'square', minValue: 40, maxValue: 200, attribute: 'red' })], 0.25, 120)
    expect(low[2]).toBe(40); expect(high[2]).toBe(200)
  })

  it('skips disabled effects and handles no fixtures', () => {
    expect(computeEffectPatch(fixtures, [effect({ enabled: false })], 0.25, 120)).toEqual({})
    expect(computeEffectPatch([], [effect()], 0.25, 120)).toEqual({})
  })

  it('layers over the base look without dropping channels', () => {
    const merged = mergeEffects({ 1: 10, 2: 20 }, { 1: 99 })
    expect(merged).toEqual({ 1: 99, 2: 20 })
  })

  it('overlays additive and maximum effects on the same property', () => {
    const patch = computeEffectPatch(fixtures, [
      effect({ id: 'base', size: 0, offset: 40 }),
      effect({ id: 'add', size: 0, offset: 30, blendMode: 'add' }),
      effect({ id: 'max', size: 0, offset: 90, blendMode: 'max' })
    ], 0, 120)
    expect(patch[1]).toBe(90)
  })
})
