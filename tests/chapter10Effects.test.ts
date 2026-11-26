import { describe, expect, it } from 'vitest'
import type { EffectDef, FixtureDef } from '../src/shared/types'
import { fixtureChannelMap } from '../src/shared/fixtureProfiles'
import {
  blendEffectValue,
  computeEffectPatch,
  effectDurationSeconds,
  orderedEffectPixels
} from '../src/renderer/src/lib/effects'
import { defaultSamples, normalizedPatternSamples, patternPixelValue, sampleLevelFromColor } from '../src/renderer/src/lib/patternRuntime'
import { defaultCurvePoints, evaluateCurve, extraColorComponents, waveformPoints } from '../src/renderer/src/lib/curveEffects'
import { BUILTIN_MOVEMENT_PATHS, pathPointAt, resolveMovementPath } from '../src/renderer/src/lib/movementRuntime'
import { effectableProperties } from '../src/renderer/src/lib/availableProperties'

const fixtures: FixtureDef[] = [
  { id: 'f1', name: 'Front', type: 'par', channelStart: 1, channels: 4 },
  { id: 'f2', name: 'Head', type: 'moving-head', channelStart: 5, channels: 8 }
]

function effect(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    id: 'e1',
    name: 'Test effect',
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

function channelOf(fixture: FixtureDef, attribute: string): number {
  const offset = fixtureChannelMap(fixture)[attribute]
  if (offset === undefined) throw new Error(`no ${attribute} channel on ${fixture.name}`)
  return fixture.channelStart + offset
}

describe('pattern effects (Guide ch.10, pp.153-160)', () => {
  it('chases the foreground sample across fixtures', () => {
    // Guide p.155: a time offset of 0% means all pixels change at the same
    // time — the chase staggers only with a time offset. 100% offsets each
    // pixel by one sample step. The defaults are background off, foreground
    // full (LightKey's Dimmer templates show black first, white second).
    const fx = effect({
      kind: 'pattern',
      pattern: 'chase',
      samples: defaultSamples(false),
      timeOffset: 100,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const patch = computeEffectPatch(fixtures, [fx], 0, 120)
    // Background sample (0%) on the first fixture, foreground (100%) on the next.
    expect(patch[channelOf(fixtures[0], 'intensity')]).toBe(0)
    expect(patch[channelOf(fixtures[1], 'intensity')]).toBe(255)
    // One step later the chase has moved on.
    const later = computeEffectPatch(fixtures, [fx], 1, 120)
    expect(later[channelOf(fixtures[0], 'intensity')]).toBe(255)
    expect(later[channelOf(fixtures[1], 'intensity')]).toBe(0)
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

  it('defaults to a dark background and full foreground', () => {
    expect(defaultSamples(true)).toEqual([
      { id: 'sample-bg', color: '#000000' },
      { id: 'sample-1', color: '#ffffff' }
    ])
    expect(defaultSamples(false)).toEqual([
      { id: 'sample-bg', value: 0 },
      { id: 'sample-1', value: 100 }
    ])
  })

  it('runs a legacy single-channel colour pattern as levels of that channel', () => {
    // A red chase made before single-channel patterns were removed stored
    // colour samples (black background, white foreground). It must chase
    // in red only — the white foreground is 100% of red, not a white beam.
    const wash: FixtureDef = { id: 'w1', name: 'Wash', type: 'rgba-4ch', channelStart: 1, channels: 4 }
    const fx = effect({
      fixtureIds: ['w1'],
      kind: 'pattern',
      pattern: 'chase',
      attribute: 'red',
      samples: [{ id: 'sample-bg', color: '#000000' }, { id: 'sample-1', color: '#ffffff' }],
      timeOffset: 100,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    expect(normalizedPatternSamples(fx)).toEqual([
      { id: 'sample-bg', color: '#000000', value: 0 },
      { id: 'sample-1', color: '#ffffff', value: 100 }
    ])
    const patch = computeEffectPatch([wash], [fx], 0, 120)
    expect(patch[channelOf(wash, 'red')]).toBe(0)
    expect(patch[channelOf(wash, 'green')]).toBeUndefined()
    expect(patch[channelOf(wash, 'blue')]).toBeUndefined()
    // One step later the chase is on the foreground: red full, still no green/blue.
    const later = computeEffectPatch([wash], [fx], 1, 120)
    expect(later[channelOf(wash, 'red')]).toBe(255)
    expect(later[channelOf(wash, 'green')]).toBeUndefined()
    expect(later[channelOf(wash, 'blue')]).toBeUndefined()
  })

  it('derives a channel level from a stored colour sample', () => {
    expect(sampleLevelFromColor('#ffffff', 'red')).toBe(100)
    expect(sampleLevelFromColor('#000000', 'red')).toBe(0)
    expect(sampleLevelFromColor('#ff0000', 'cyan')).toBe(0)
    expect(sampleLevelFromColor('#00ffff', 'cyan')).toBe(100)
    expect(sampleLevelFromColor('#ffffff', 'white')).toBe(100)
    expect(sampleLevelFromColor('#000000', 'amber')).toBe(0)
  })

  it('drives a Dimmer pattern on a virtual-dimmer fixture from the base look', () => {
    // The Q12BT has no dimmer channel (Piece 12, virtual dimmer): a Dimmer
    // chase scales its LED channels by the effect level, in the colour the
    // base look carries — a red cue chases in red, even at dimmer 0.
    const wash: FixtureDef = { id: 'w1', name: 'Wash', type: 'rgba-4ch', channelStart: 1, channels: 4 }
    const fx = effect({
      fixtureIds: ['w1'],
      kind: 'pattern',
      pattern: 'chase',
      samples: [{ id: 'sample-bg', value: 100 }, { id: 'sample-1', value: 0 }],
      timeOffset: 100,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const baseValues = { w1: { red: 255, green: 0, blue: 0, amber: 0 } }
    const patch = computeEffectPatch([wash], [fx], 0, 120, 255, { baseValues })
    expect(patch[channelOf(wash, 'red')]).toBe(255)
    expect(patch[channelOf(wash, 'green')]).toBe(0)
    expect(patch[channelOf(wash, 'blue')]).toBe(0)
    // One step later the chase is on the foreground (0%): the beam is out.
    const later = computeEffectPatch([wash], [fx], 1, 120, 255, { baseValues })
    expect(later[channelOf(wash, 'red')]).toBe(0)
  })

  it('drives a Dimmer pattern on a virtual-dimmer fixture in its default colour', () => {
    // With no colour in the base look, the fixture defaults carry it — a
    // fresh Q12BT chases in its default blue, like raising its dimmer.
    const wash: FixtureDef = { id: 'w1', name: 'Wash', type: 'rgba-4ch', channelStart: 1, channels: 4 }
    const fx = effect({
      fixtureIds: ['w1'],
      kind: 'pattern',
      pattern: 'chase',
      samples: [{ id: 'sample-bg', value: 100 }, { id: 'sample-1', value: 0 }],
      timeOffset: 100,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const patch = computeEffectPatch([wash], [fx], 0, 120)
    expect(patch[channelOf(wash, 'red')]).toBe(0)
    expect(patch[channelOf(wash, 'blue')]).toBe(255)
  })

  it('treats the meteor trail as a percent of the pixel count', () => {
    // LightKey shows "Trail 60%" (Jake's screenshot, 9.34.46 pm) — the
    // guide gives no unit. Halfway through the cycle the meteoroid has
    // passed the first pixels; with a 100% trail they still glow behind
    // it, with a 0% trail they are dark.
    const samples = [{ id: 'sample-bg', value: 0 }, { id: 'sample-1', value: 100 }]
    const meteor = (trail: number) => effect({
      kind: 'pattern',
      pattern: 'meteor',
      samples,
      length: 1,
      distance: 6,
      trail,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const at = (fx: EffectDef) => [0, 1, 2, 3].map((i) => patternPixelValue('meteor', fx, samples, 1, 2, i, 4, false).intensity ?? 0)
    expect(at(meteor(0))).toEqual([0, 0, 0, 0])
    expect(at(meteor(100)).some((level) => level > 0)).toBe(true)
  })

  it('drives jellyfish and snakes from their own speed fields', () => {
    // Guide p.160 gives Jellyfish and Snakes a Speed of their own — the
    // runtime used to share fireSpeed for all three. The new fields win;
    // an old effect with only fireSpeed still falls back to it.
    const samples = [{ id: 'sample-bg', value: 0 }, { id: 'sample-1', value: 100 }]
    const jelly = effect({ kind: 'pattern', pattern: 'jellyfish', samples, jellyfishSpeed: 2, jellyfishCount: 1, jellyfishSize: 50, durationMs: 2000, timingMode: 'fixed' })
    const jellySlow = effect({ kind: 'pattern', pattern: 'jellyfish', samples, jellyfishSpeed: 0.5, jellyfishCount: 1, jellyfishSize: 50, durationMs: 2000, timingMode: 'fixed' })
    const at = (fx: EffectDef) => patternPixelValue('jellyfish', fx, samples, 0.5, 2, 2, 4, false).intensity
    expect(at(jelly)).not.toBe(at(jellySlow))
    const legacy = effect({ kind: 'pattern', pattern: 'snakes', samples, fireSpeed: 2, durationMs: 2000, timingMode: 'fixed' })
    const explicit = effect({ kind: 'pattern', pattern: 'snakes', samples, snakeSpeed: 2, durationMs: 2000, timingMode: 'fixed' })
    const snakeAt = (fx: EffectDef) => patternPixelValue('snakes', fx, samples, 0.5, 2, 0, 4, false).intensity
    expect(snakeAt(legacy)).toBe(snakeAt(explicit))
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

  it('drives a Dimmer curve on a virtual-dimmer fixture from the base look', () => {
    // A flat Dimmer curve at half value on the Q12BT scales its LEDs to
    // half of the base look's colour — a red cue at half red.
    const wash: FixtureDef = { id: 'w1', name: 'Wash', type: 'rgba-4ch', channelStart: 1, channels: 4 }
    const fx = effect({
      fixtureIds: ['w1'],
      kind: 'curve',
      curveComponents: [{ component: 'intensity', points: defaultCurvePoints(), curvedSegments: [false] }],
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const baseValues = { w1: { red: 255, green: 0, blue: 0, amber: 0 } }
    const patch = computeEffectPatch([wash], [fx], 0.7, 120, 255, { baseValues })
    expect(patch[channelOf(wash, 'red')]).toBe(128)
    expect(patch[channelOf(wash, 'green')]).toBe(0)
    expect(patch[channelOf(wash, 'blue')]).toBe(0)
  })

  it('writes a curve on a generic channel such as Frost', () => {
    // Frost is a generic fixture-profile attribute (Jake, 21 Nov 2026):
    // a curve on it reaches the frost channel like any other
    // single-component property — no hardcoded allowlist in the runtime.
    const frosty: FixtureDef = {
      id: 'ff', name: 'Frosty', type: 'moving-head', channelStart: 9, channels: 2,
      profile: { id: 'test-frost', name: 'Test Frost', manufacturer: 'Test', legacyType: 'moving-head', modes: [{ id: 'default', name: 'Default', channels: [
        { number: 0, attribute: 'intensity', propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
        { number: 1, attribute: 'frost', propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0 }
      ] }] }
    }
    const fx = effect({
      kind: 'curve',
      attribute: 'frost',
      fixtureIds: ['ff'],
      curveComponents: [{ component: 'frost', points: [{ id: 'p0', x: 0, y: 1 }, { id: 'p1', x: 1, y: 1 }], curvedSegments: [false] }],
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const patch = computeEffectPatch([frosty], [fx], 0.5, 120)
    expect(patch[channelOf(frosty, 'frost')]).toBe(255)
  })
})

describe('movement effects (Guide ch.10, pp.165-171)', () => {
  it('lists the built-in paths, including LightKey’s named ones', () => {
    expect(BUILTIN_MOVEMENT_PATHS.map((p) => p.name)).toEqual([
      'Circle', 'Figure Eight', 'Line',
      'Bow Tie', 'Flower', 'Half Flower 3', 'Half Flower 5', 'Pan Track',
      'Random Dots', 'Tilt Track 1', 'Tilt Track 2', 'Triangle Small',
      'Triangle Wide', 'Wedge Curved', 'Wedge Straight', 'Zigzag 2', 'Zigzag 5'
    ])
  })

  it('resolves LightKey’s named paths to point sets', () => {
    const bowTie = resolveMovementPath('builtin-bow-tie', [])
    expect(Array.isArray(bowTie?.path)).toBe(true)
    expect(bowTie?.type).toBe('smooth')
    const dots = resolveMovementPath('builtin-random-dots', [])
    expect(dots?.type).toBe('points')
    expect(Array.isArray(dots?.path) && dots.path.length).toBeGreaterThan(1)
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
    // Circle at t=0: pan at 0.8 amplitude, tilt centred. Parametric
    // paths run at 0.8 — the point-based built-ins and the Position
    // HUD sample at ±0.8, so the chart and the driven fixture agree
    // (Jake, 26 Nov 2026); 0.8 of the 540° pan range is 216°, which
    // is channel 230.
    expect(patch[channelOf(head, 'pan')]).toBe(230)
    expect(patch[channelOf(head, 'tilt')]).toBe(128)
    // A quarter cycle later: pan centred, tilt at 0.8 amplitude.
    const quarter = computeEffectPatch(fixtures, [fx], 1, 120)
    expect(quarter[channelOf(head, 'pan')]).toBe(128)
    expect(quarter[channelOf(head, 'tilt')]).toBe(230)
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

describe('effectable properties (Guide ch.10, p.146)', () => {
  it('offers Dimmer and Color for a virtual-dimmer fixture, not single channels', () => {
    // The Q12BT has no dimmer channel, but Dimmer is still a property of
    // the fixture (virtual dimmer) — and red/green/blue are components of
    // Color, not properties of their own.
    const wash: FixtureDef = { id: 'w1', name: 'Wash', type: 'rgba-4ch', channelStart: 1, channels: 4 }
    expect(effectableProperties([wash]).map((p) => p.attribute)).toEqual(['intensity', 'color'])
    expect(effectableProperties([wash]).map((p) => p.label)).toEqual(['Dimmer', 'Color'])
  })

  it('offers Dimmer, Color, Position and the other channel properties for a moving head', () => {
    const head = fixtures[1]
    expect(effectableProperties([head]).map((p) => p.attribute)).toEqual(['intensity', 'color', 'position', 'gobo', 'strobe'])
  })

  it('offers Dimmer and Color for a par', () => {
    expect(effectableProperties([fixtures[0]]).map((p) => p.attribute)).toEqual(['intensity', 'color'])
  })

  it('offers uncommon channel properties such as Frost and Focus', () => {
    // Frost is just a fixture-profile attribute (Jake, 21 Nov 2026) —
    // any channel a profile has is effectable, not only the well-known ones.
    const frosty: FixtureDef = {
      id: 'ff', name: 'Frosty', type: 'moving-head', channelStart: 9, channels: 4,
      profile: { id: 'test-frost', name: 'Test Frost', manufacturer: 'Test', legacyType: 'moving-head', modes: [{ id: 'default', name: 'Default', channels: [
        { number: 0, attribute: 'intensity', propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
        { number: 1, attribute: 'focus', propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0 },
        { number: 2, attribute: 'frost', propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0 },
        { number: 3, attribute: 'zoom', propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0 }
      ] }] }
    }
    expect(effectableProperties([frosty]).map((p) => p.attribute)).toEqual(['intensity', 'focus', 'frost', 'zoom'])
    expect(effectableProperties([frosty]).map((p) => p.label)).toEqual(['Dimmer', 'Focus', 'Frost', 'Zoom'])
  })

  it('offers nothing with no fixtures selected', () => {
    expect(effectableProperties([])).toEqual([])
  })

  it('lists the extra colour components a fixture supports', () => {
    // Guide p.146: cool white, warm white, amber, lime, ultraviolet — as
    // the fixture's own channels (white, amber, uv in the built-ins).
    const wash: FixtureDef = { id: 'w1', name: 'Wash', type: 'led-wash', channelStart: 1, channels: 7 }
    expect(extraColorComponents(wash)).toEqual(['white', 'amber', 'ultraviolet'])
    const bar: FixtureDef = { id: 'b1', name: 'Bar', type: 'rgba-4ch', channelStart: 1, channels: 4 }
    expect(extraColorComponents(bar)).toEqual(['amber'])
    expect(extraColorComponents(fixtures[0])).toEqual([])
  })
})
