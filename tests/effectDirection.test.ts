import { describe, expect, it } from 'vitest'
import type { EffectDef, FixtureDef } from '../src/shared/types'
import { fixtureChannelMap } from '../src/shared/fixtureProfiles'
import { computeEffectPatch } from '../src/renderer/src/lib/effects'
import { patternPixelValue } from '../src/renderer/src/lib/patternRuntime'

// Direction of effect travel (Jake, 28 Nov 2026): the per-pixel time offset
// was ADDED, so each following pixel ran AHEAD and the wave travelled
// backwards through the fixture order — with "Right to Left" selected the
// bright spot visibly travelled left to right. Guide proof — Chase, p.154:
// "each pixel changes later than the preceding one"; Curves, pp.163-164:
// "with a duration of 10 seconds and a time offset of 5%, the second pixel
// will be 0.5 seconds behind the first". These tests prove the peak travels
// IN the order direction by sampling successive moments, not just one
// instant: the existing 2-fixture chase test and the 180-degree legacy test
// are sign-blind (with 2 samples / half a cycle, +1 step and -1 step land on
// the same value) and keep passing as-is.

const pars: FixtureDef[] = [
  { id: 'f1', name: 'Left', type: 'par', channelStart: 1, channels: 4, previewPosition: { x: 0, y: 0 } },
  { id: 'f2', name: 'Middle', type: 'par', channelStart: 5, channels: 4, previewPosition: { x: 100, y: 0 } },
  { id: 'f3', name: 'Right', type: 'par', channelStart: 9, channels: 4, previewPosition: { x: 200, y: 0 } }
]

const heads: FixtureDef[] = [
  { id: 'h1', name: 'Left', type: 'moving-head', channelStart: 1, channels: 8, previewPosition: { x: 0, y: 0 } },
  { id: 'h2', name: 'Middle', type: 'moving-head', channelStart: 9, channels: 8, previewPosition: { x: 100, y: 0 } },
  { id: 'h3', name: 'Right', type: 'moving-head', channelStart: 17, channels: 8, previewPosition: { x: 200, y: 0 } }
]

function effect(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    id: 'e1',
    name: 'Direction test effect',
    fixtureIds: ['f1', 'f2', 'f3'],
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

function channelOf(fixture: FixtureDef, attribute: string): number {
  const offset = fixtureChannelMap(fixture)[attribute]
  if (offset === undefined) throw new Error(`no ${attribute} channel on ${fixture.name}`)
  return fixture.channelStart + offset
}

/** First sampled time at which `read` rises to `target` (was below it at the
 *  previous sample). A rise, not just a hit: with a time offset a later pixel
 *  begins mid-pattern (cyclically behind), so it may already read the target
 *  at t=0 — the rise is what proves the travel direction. */
function firstRise(times: number[], read: (t: number) => number | undefined, target: number): number {
  let prev: number | undefined
  for (const t of times) {
    const value = read(t)
    if (value === target && prev !== undefined && prev !== target) return t
    prev = value
  }
  return Infinity
}

const sampleTimes = (from: number, to: number, step: number): number[] => {
  const out: number[] = []
  for (let t = from; t <= to + 1e-9; t += step) out.push(Math.round(t * 100) / 100)
  return out
}

describe('effect travel direction (Guide p.154, pp.163-164)', () => {
  it('bell-curve Dimmer peaks right-to-left when ordered Right to Left', () => {
    // 2s duration, 10% time offset: each pixel lags the preceding one by
    // 0.2s. The bell peaks at localT 0.5, so with Right to Left order the
    // rightmost fixture peaks at t=1.0, middle at t=1.2, leftmost at t=1.4.
    const fx = effect({
      kind: 'curve',
      attribute: 'intensity',
      fixtureOrder: 'right-left',
      pixelMode: 'fixtures',
      timeOffset: 10,
      durationMs: 2000,
      timingMode: 'fixed',
      curveComponents: [{
        component: 'intensity',
        points: [
          { id: 'p0', x: 0, y: 0 },
          { id: 'p1', x: 0.5, y: 1 },
          { id: 'p2', x: 1, y: 0 }
        ],
        curvedSegments: [false, false]
      }]
    })
    const ch = pars.map((f) => channelOf(f, 'intensity'))
    const level = (t: number, i: number) => computeEffectPatch(pars, [fx], t, 120)[ch[i]]
    // Rightmost peaks first, leftmost last.
    expect(level(1.0, 2)).toBe(255)
    expect(level(1.0, 2)).toBeGreaterThan(level(1.0, 1))
    expect(level(1.0, 1)).toBeGreaterThan(level(1.0, 0))
    expect(level(1.2, 1)).toBe(255)
    expect(level(1.4, 0)).toBe(255)
    // The peak itself travels in order — first-rise times increase.
    const times = sampleTimes(0, 3, 0.05)
    const firstPeak = ch.map((_, i) => firstRise(times, (t) => level(t, i), 255))
    expect(firstPeak).toEqual([1.4, 1.2, 1.0])
  })

  it('chase foreground moves 0 -> 1 -> 2 in order', () => {
    // 2 samples, 2s duration, 50% time offset: each pixel lags the
    // preceding one by 0.5s. The foreground (255) turns on at t=1.0 on
    // pixel 0, t=1.5 on pixel 1, t=2.0 on pixel 2.
    const fx = effect({ kind: 'pattern', pattern: 'chase', timeOffset: 50, durationMs: 2000, timingMode: 'fixed' })
    const samples = [{ id: 'sample-bg', value: 0 }, { id: 'sample-1', value: 100 }]
    const level = (t: number, i: number) => patternPixelValue('chase', fx, samples, t, 2, i, 3, false).intensity
    const times = sampleTimes(0, 3, 0.05)
    const firstFg = [0, 1, 2].map((i) => firstRise(times, (t) => level(t, i), 255))
    expect(firstFg).toEqual([1.0, 1.5, 2.0])
    // At t=1.25 only the first pixel has turned on; by t=2.25 the front has
    // moved to the last pixel and the first is dark again.
    expect([level(1.25, 0), level(1.25, 1), level(1.25, 2)]).toEqual([255, 0, 0])
    expect(level(2.25, 2)).toBe(255)
    expect(level(2.25, 0)).toBe(0)
  })

  it('delay holds later pixels at the first sample while offset begins mid-pattern', () => {
    // Same chase, plus 50% delay: each pixel waits at the first sample
    // until its offset lag AND its delay have elapsed, then runs behind.
    const samples = [{ id: 'sample-bg', value: 0 }, { id: 'sample-1', value: 100 }]
    const withDelay = effect({ kind: 'pattern', pattern: 'chase', timeOffset: 50, delay: 50, durationMs: 2000, timingMode: 'fixed' })
    const level = (t: number, i: number) => patternPixelValue('chase', withDelay, samples, t, 2, i, 3, false).intensity
    // Delay begins at the first sample and waits: pixel 1 is still dark
    // at t=1.5 (its clock only starts at t=1.0, and it needs another step).
    expect(level(0, 1)).toBe(0)
    expect(level(1.5, 1)).toBe(0)
    expect(level(2.25, 2)).toBe(0)
    // First foreground, in order, one second apart.
    const times = sampleTimes(0, 4, 0.05)
    const firstFg = [0, 1, 2].map((i) => firstRise(times, (t) => level(t, i), 255))
    expect(firstFg).toEqual([1.0, 2.0, 3.0])
    // Contrast — offset alone begins mid-pattern: pixel 1 is already on
    // the foreground at t=0 (its clock reads a step behind, cyclically).
    const offsetOnly = effect({ kind: 'pattern', pattern: 'chase', timeOffset: 50, durationMs: 2000, timingMode: 'fixed' })
    expect(patternPixelValue('chase', offsetOnly, samples, 0, 2, 1, 3, false).intensity).toBe(255)
  })

  it('movement pan peak travels left-to-right when ordered Left to Right', () => {
    // Circle path: pan peaks at cycle position 0. 2s duration, 25% time
    // offset: each fixture lags the preceding one by 0.5s, so the pan peak
    // is on the left fixture at t=0, the middle at t=0.5, the right at t=1.0.
    const fx = effect({
      fixtureIds: ['h1', 'h2', 'h3'],
      kind: 'movement',
      movementPathId: 'builtin-circle',
      attribute: 'position',
      fixtureOrder: 'left-right',
      pixelMode: 'fixtures',
      timeOffset: 25,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const ch = heads.map((f) => channelOf(f, 'pan'))
    const pan = (t: number, i: number) => computeEffectPatch(heads, [fx], t, 120)[ch[i]]
    expect(pan(0, 0)).toBeGreaterThan(pan(0, 1))
    expect(pan(0, 1)).toBeGreaterThan(pan(0, 2))
    expect(pan(0.5, 1)).toBeGreaterThan(pan(0.5, 0))
    expect(pan(0.5, 1)).toBeGreaterThan(pan(0.5, 2))
    expect(pan(1.0, 2)).toBeGreaterThan(pan(1.0, 0))
    expect(pan(1.0, 2)).toBeGreaterThan(pan(1.0, 1))
  })

  it('legacy oscillator peaks in fixture order with a phase spread', () => {
    // Sine at 1Hz, 90-degree spread over 3 fixtures: positions 0, 0.5, 1
    // lag by 0, 1/8 and 1/4 of a cycle, so the fixtures peak at t=0.25,
    // t=0.375 and t=0.5 — in order, not against it.
    const fx = effect({ phaseSpread: 90, pixelMode: 'fixtures', fixtureOrder: 'left-right' })
    const ch = pars.map((f) => channelOf(f, 'intensity'))
    const level = (t: number, i: number) => computeEffectPatch(pars, [fx], t, 120)[ch[i]]
    expect(level(0.25, 0)).toBe(255)
    expect(level(0.25, 0)).toBeGreaterThan(level(0.25, 1))
    expect(level(0.25, 1)).toBeGreaterThan(level(0.25, 2))
    expect(level(0.25, 2)).toBe(128)
    expect(level(0.5, 2)).toBe(255)
    expect(level(0.5, 2)).toBeGreaterThan(level(0.5, 1))
    expect(level(0.5, 1)).toBeGreaterThan(level(0.5, 0))
    expect(level(0.5, 0)).toBe(128)
  })
})
