import { describe, expect, it } from 'vitest'
import type { EffectDef, FixtureDef } from '../src/shared/types'
import { fixtureChannelMap } from '../src/shared/fixtureProfiles'
import {
  blendEffectValue,
  computeEffectPatch,
  effectDurationSeconds,
  orderedEffectPixels
} from '../src/renderer/src/lib/effects'
import { defaultSamples, patternPixelValue } from '../src/renderer/src/lib/patternRuntime'
import { defaultCurvePoints, evaluateCurve, waveformPoints } from '../src/renderer/src/lib/curveEffects'
import { BUILTIN_MOVEMENT_PATHS, pathPointAt, resolveMovementPath } from '../src/renderer/src/lib/movementRuntime'

const fixtures: FixtureDef[] = [
  { id: 'f1', name: 'Front', type: 'par', channelStart: 1, channels: 4 },
  { id: 'f2', name: 'Head', type: 'moving-head', channelStart: 5, channels: 8 }
]

function effect(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    id: 'e1',
    name: 'Test effect',
    fixtureIds: [],
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

describe('pattern effects (Guide ch.10, pp.153-160)', () => {
  it('chases the foreground sample across fixtures', () => {
    // Guide p.155: a time offset of 0% means all pixels change at the same
    // time — the chase staggers only with a time offset. 100% offsets each
    // pixel by one sample step.
    const fx = effect({
      kind: 'pattern',
      pattern: 'chase',
      samples: defaultSamples(false),
      timeOffset: 100,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const patch = computeEffectPatch(fixtures, [fx], 0, 120)
    // Background sample (100%) on the first fixture, foreground (0%) on the next.
    expect(patch[channelOf(fixtures[0], 'intensity')]).toBe(255)
    expect(patch[channelOf(fixtures[1], 'intensity')]).toBe(0)
    // One step later the chase has moved on.
    const later = computeEffectPatch(fixtures, [fx], 1, 120)
    expect(later[channelOf(fixtures[0], 'intensity')]).toBe(0)
    expect(later[channelOf(fixtures[1], 'intensity')]).toBe(255)
  })

  it('fills fixtures progressively', () => {
    // Background off, foreground full: halfway through, the first fixture
    // is filled (foreground) and the second still shows the background.
    const samples = [{ id: 'sample-bg', value: 0 }, { id: 'sample-1', value: 100 }]
    const fx = effect({ kind: 'pattern', pattern: 'fill', samples, durationMs: 2000, timingMode: 'fixed' })
    expect([0, 1].map((i) => patternPixelValue(
      'fill', fx, samples, 1, 2, i, 2, false
    ).intensity)).toEqual([255, 0])
  })

  it('chases colours, not just dimmer', () => {
    const fx = effect({
      kind: 'pattern',
      pattern: 'chase',
      attribute: 'color',
      samples: defaultSamples(true),
      timeOffset: 100,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const patch = computeEffectPatch(fixtures, [fx], 0, 120)
    // Background black on the first fixture…
    expect(patch[channelOf(fixtures[0], 'red')]).toBe(0)
    expect(patch[channelOf(fixtures[0], 'green')]).toBe(0)
    // …foreground white on the second.
    expect(patch[channelOf(fixtures[1], 'red')]).toBe(255)
    expect(patch[channelOf(fixtures[1], 'green')]).toBe(255)
  })

  it('defaults to a black background and white foreground for colour', () => {
    expect(defaultSamples(true)).toEqual([
      { id: 'sample-bg', color: '#000000' },
      { id: 'sample-1', color: '#ffffff' }
    ])
    expect(defaultSamples(false)).toEqual([
      { id: 'sample-bg', value: 100 },
      { id: 'sample-1', value: 0 }
    ])
  })
})

describe('drawable curve effects (Guide ch.10, pp.161-164)', () => {
  it('interpolates straight segments linearly', () => {
    const points = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 1, y: 1 }
    ]
    expect(evaluateCurve(points, [false], 0.5)).toBeCloseTo(0.5)
    expect(evaluateCurve(points, [false], 0)).toBe(0)
    expect(evaluateCurve(points, [false], 1)).toBe(1)
  })

  it('keeps curved segments inside 0..1', () => {
    const points = waveformPoints('sine', 9)
    for (let t = 0; t <= 1; t += 0.05) {
      const value = evaluateCurve(points, Array.from({ length: 8 }, () => true), t)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('samples a sine wave into control points', () => {
    const points = waveformPoints('sine', 5)
    expect(points).toHaveLength(5)
    // One full sine cycle across the curve: peak at a quarter, trough at three quarters.
    expect(points[0].y).toBeCloseTo(0.5)
    expect(points[1].y).toBeCloseTo(1)
    expect(points[2].y).toBeCloseTo(0.5)
    expect(points[3].y).toBeCloseTo(0)
    expect(points[4].y).toBeCloseTo(0.5)
  })

  it('writes a flat curve at half value', () => {
    const fx = effect({
      kind: 'curve',
      curveComponents: [{ component: 'intensity', points: defaultCurvePoints(), curvedSegments: [false] }],
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const patch = computeEffectPatch(fixtures, [fx], 0.7, 120)
    expect(patch[channelOf(fixtures[0], 'intensity')]).toBe(128)
  })
})

describe('movement effects (Guide ch.10, pp.165-171)', () => {
  it('lists the three built-in paths', () => {
    expect(BUILTIN_MOVEMENT_PATHS.map((p) => p.name)).toEqual(['Circle', 'Figure Eight', 'Line'])
  })

  it('resolves built-in paths by id', () => {
    expect(resolveMovementPath('builtin-circle', [])?.path).toBe('circle')
    expect(resolveMovementPath('Circle', [])?.path).toBe('circle')
    expect(resolveMovementPath('no-such-path', [])).toBeNull()
  })

  it('interpolates a line path and holds points for a points path', () => {
    const line = [{ pan: -1, tilt: 0 }, { pan: 1, tilt: 0 }]
    // A closed two-point path: the first half of the cycle runs point 0 → point 1.
    expect(pathPointAt(line, 'line', 0.125).pan).toBeCloseTo(-0.5)
    expect(pathPointAt(line, 'line', 0.375).pan).toBeCloseTo(0.5)
    expect(pathPointAt(line, 'points', 0.25)).toEqual(line[0])
    expect(pathPointAt(line, 'points', 0.75)).toEqual(line[1])
  })

  it('runs a circle path through pan and tilt', () => {
    const fx = effect({
      kind: 'movement',
      attribute: 'position',
      movementPathId: 'builtin-circle',
      durationMs: 4000,
      timingMode: 'fixed'
    })
    const head = fixtures[1]
    const patch = computeEffectPatch(fixtures, [fx], 0, 120)
    // Circle at t=0: pan fully right, tilt centred.
    expect(patch[channelOf(head, 'pan')]).toBe(255)
    expect(patch[channelOf(head, 'tilt')]).toBe(128)
    // A quarter cycle later: pan centred, tilt fully up.
    const quarter = computeEffectPatch(fixtures, [fx], 1, 120)
    expect(quarter[channelOf(head, 'pan')]).toBe(128)
    expect(quarter[channelOf(head, 'tilt')]).toBe(255)
  })

  it('produces nothing for an unknown path', () => {
    const fx = effect({ kind: 'movement', attribute: 'position', movementPathId: 'no-such-path', durationMs: 2000, timingMode: 'fixed' })
    expect(computeEffectPatch(fixtures, [fx], 0, 120)).toEqual({})
  })
})

describe('effect timing and fixture order (Guide ch.10, pp.150-152)', () => {
  it('honours a fixed duration and a beat multiplier', () => {
    expect(effectDurationSeconds(effect({ durationMs: 2000, timingMode: 'fixed' }), 120)).toBe(2)
    // ÷2 repeats twice per beat: at 120bpm a beat is 0.5s, so the cycle is 0.25s.
    expect(effectDurationSeconds(effect({ beatMultiplier: 0.5, timingMode: 'beat' }), 120)).toBeCloseTo(0.25)
    expect(effectDurationSeconds(effect({ timingMode: 'random' }), 120)).toBeUndefined()
  })

  it('reverses the pixel order for the reverse fixture order', () => {
    const forward = orderedEffectPixels(effect({ fixtureOrder: 'forward' }), fixtures, 'intensity')
    const reverse = orderedEffectPixels(effect({ fixtureOrder: 'reverse' }), fixtures, 'intensity')
    expect(forward.map((p) => p.fixture.id)).toEqual(['f1', 'f2'])
    expect(reverse.map((p) => p.fixture.id)).toEqual(['f2', 'f1'])
  })

  it('overlays with the screen blend for colours (Guide p.173)', () => {
    expect(blendEffectValue('screen', 128, 128)).toBe(192)
    expect(blendEffectValue('screen', 0, 255)).toBe(255)
    expect(blendEffectValue('add', 200, 100)).toBe(255)
    expect(blendEffectValue('max', 100, 150)).toBe(150)
  })

  it('keeps the legacy waveform path unchanged', () => {
    const fx = effect({ waveform: 'sine', size: 128, offset: 128 })
    expect(computeEffectPatch(fixtures, [fx], 0, 120)[1]).toBe(128)
    expect(computeEffectPatch(fixtures, [fx], 0.25, 120)[1]).toBe(255)
    expect(computeEffectPatch(fixtures, [fx], 0.75, 120)[1]).toBe(0)
  })
})
