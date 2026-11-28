import { describe, expect, it } from 'vitest'
import type { EffectDef, FixtureDef } from '../src/shared/types'
import { fixtureChannelMap } from '../src/shared/fixtureProfiles'
import {
  assignActivationSeeds,
  computeEffectPatch,
  orderedEffectFixtures,
  orderedEffectPixels,
  seededShuffle
} from '../src/renderer/src/lib/effects'

// Fixture-order fixes (Jake, 28 Nov 2026): Random (Variable) repeated instead
// of varying (no caller ever passed activationSeed, so it hashed with seed 0
// forever); Random (Fixed) never re-rolled on selection; Consider Spacing
// changed nothing for curve/movement timing (the runtimes used the uniform
// phaseIndex, not the spacing-based position). Guide p.151: the random order
// changes each time the effect becomes active / each time you select the
// option, and stays the same afterwards. Guide p.152: Consider Spacing is
// available for curve and movement effects.
//
// Note on the shuffle: a string hash cannot carry the seed — hashing the
// seed BEFORE the fixture id makes it a common prefix that cancels out of
// the comparison, so for ids sharing a prefix (Jake's demo fixtures) only
// 2 distinct orders appeared over 500 seeds. seededShuffle (mulberry32 +
// Fisher-Yates) gives 495.

const pars: FixtureDef[] = [
  { id: 'f1', name: 'P1', type: 'par', channelStart: 1, channels: 4, previewPosition: { x: 0, y: 0 } },
  { id: 'f2', name: 'P2', type: 'par', channelStart: 5, channels: 4, previewPosition: { x: 100, y: 0 } },
  { id: 'f3', name: 'P3', type: 'par', channelStart: 9, channels: 4, previewPosition: { x: 200, y: 0 } },
  { id: 'f4', name: 'P4', type: 'par', channelStart: 13, channels: 4, previewPosition: { x: 300, y: 0 } }
]

// Uneven row for the spacing tests: two fixtures close together, one far away.
const uneven: FixtureDef[] = [
  { id: 's1', name: 'Near A', type: 'par', channelStart: 1, channels: 4, previewPosition: { x: 0, y: 0 } },
  { id: 's2', name: 'Near B', type: 'par', channelStart: 5, channels: 4, previewPosition: { x: 10, y: 0 } },
  { id: 's3', name: 'Far', type: 'par', channelStart: 9, channels: 4, previewPosition: { x: 100, y: 0 } }
]

const heads: FixtureDef[] = [
  { id: 'h1', name: 'Left', type: 'moving-head', channelStart: 1, channels: 8, previewPosition: { x: 0, y: 0 } },
  { id: 'h2', name: 'Middle', type: 'moving-head', channelStart: 9, channels: 8, previewPosition: { x: 10, y: 0 } },
  { id: 'h3', name: 'Right', type: 'moving-head', channelStart: 17, channels: 8, previewPosition: { x: 100, y: 0 } }
]

function effect(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    id: 'e1',
    name: 'Order test effect',
    fixtureIds: ['f1', 'f2', 'f3', 'f4'],
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

function bellCurve(overrides: Partial<EffectDef> = {}): EffectDef {
  return effect({
    kind: 'curve',
    attribute: 'intensity',
    pixelMode: 'fixtures',
    timeOffset: 25,
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
    }],
    ...overrides
  })
}

function channelOf(fixture: FixtureDef, attribute: string): number {
  const offset = fixtureChannelMap(fixture)[attribute]
  if (offset === undefined) throw new Error(`no ${attribute} channel on ${fixture.name}`)
  return fixture.channelStart + offset
}

const orderIds = (fx: EffectDef, fixtures: FixtureDef[], seed: number): string[] =>
  orderedEffectFixtures(fx, fixtures, seed).map((f) => f.id)

/** First sampled time at which the level reaches `target`, having been below
 *  it at the previous sample. */
function firstHigh(times: number[], read: (t: number) => number | undefined, target: number): number {
  let prev: number | undefined
  for (const t of times) {
    const value = read(t)
    if (value !== undefined && value >= target && prev !== undefined && prev < target) return t
    prev = value
  }
  return Infinity
}

const sampleTimes = (from: number, to: number, step: number): number[] => {
  const out: number[] = []
  for (let t = from; t <= to + 1e-9; t += step) out.push(Math.round(t * 100) / 100)
  return out
}

describe('random order seeds (Guide p.151)', () => {
  it('seededShuffle is stable per seed and varies across seeds', () => {
    expect(seededShuffle(pars, 1).map((f) => f.id)).toEqual(seededShuffle(pars, 1).map((f) => f.id))
    expect(seededShuffle(pars, 1).map((f) => f.id)).not.toEqual(seededShuffle(pars, 2).map((f) => f.id))
    expect(seededShuffle(pars, 1).map((f) => f.id).sort()).toEqual(['f1', 'f2', 'f3', 'f4'])
    // The old string hash could not do this: for ids sharing a prefix only
    // 2 distinct orders appeared over 500 seeds. The shuffle varies even
    // for Jake's demo-style slug ids.
    const demoIds = ['simger-q12bt-1', 'simger-q12bt-2', 'simger-q12bt-3', 'simger-q12bt-4', 'corepar-q120-1', 'corepar-q120-2', 'corepar-q120-3', 'corepar-q120-4']
    const seen = new Set(Array.from({ length: 20 }, (_, i) => seededShuffle(demoIds, i + 1).join(',')))
    expect(seen.size).toBeGreaterThan(10)
  })

  it('random-variable yields different orders for different activation seeds', () => {
    const fx = effect({ fixtureOrder: 'random-variable' })
    expect(orderIds(fx, pars, 1)).not.toEqual(orderIds(fx, pars, 2))
    expect(orderIds(fx, pars, 1)).toEqual(orderIds(fx, pars, 1))
  })

  it('assignActivationSeeds keeps a running effect’s seed and mints fresh ones on activation', () => {
    let nextSeed = 100
    const fresh = () => nextSeed++
    const e1 = effect({ id: 'e1' })
    const e2 = effect({ id: 'e2', enabled: false })
    let seeds = assignActivationSeeds(new Map(), [e1, e2], fresh)
    expect([...seeds.entries()]).toEqual([['e1', 100]])
    // e2 becomes enabled: e1 keeps its seed, e2 mints a fresh one.
    seeds = assignActivationSeeds(seeds, [e1, effect({ id: 'e2' })], fresh)
    expect(seeds.get('e1')).toBe(100)
    expect(seeds.get('e2')).toBe(101)
    // e1 is disabled and re-enabled later: a new activation, a new seed.
    seeds = assignActivationSeeds(seeds, [effect({ id: 'e1', enabled: false }), effect({ id: 'e2' })], fresh)
    expect(seeds.has('e1')).toBe(false)
    expect(seeds.get('e2')).toBe(101)
    seeds = assignActivationSeeds(seeds, [e1, effect({ id: 'e2' })], fresh)
    expect(seeds.get('e1')).toBe(102)
    expect(seeds.get('e2')).toBe(101)
  })

  it('computeEffectPatch honours per-effect activation seeds, not one global seed', () => {
    // A chase at t=0 alternates background/foreground across the pixels in
    // order (the first is on the background; each next pixel runs one step
    // behind the cycle). With 2 samples and 4 pixels, the 2nd and 4th pixels
    // in the order show the foreground. Two seeds must light different
    // fixtures, and each must match its own seed's order.
    const chase = (id: string): EffectDef => effect({
      id,
      kind: 'pattern',
      pattern: 'chase',
      fixtureOrder: 'random-variable',
      samples: [{ id: 'sample-bg', value: 0 }, { id: 'sample-1', value: 100 }],
      timeOffset: 100,
      durationMs: 2000,
      timingMode: 'fixed'
    })
    const litOf = (seed: number): string[] => {
      const fx = chase('e1')
      const patch = computeEffectPatch(pars, [fx], 0, 120, 255, { activationSeeds: { e1: seed } })
      return pars.filter((f) => patch[channelOf(f, 'intensity')] === 255).map((f) => f.id).sort()
    }
    const expectedLit = (seed: number): string[] => {
      const ordered = orderIds(chase('e1'), pars, seed)
      return [ordered[1], ordered[3]].sort()
    }
    expect(litOf(1)).toEqual(expectedLit(1))
    expect(litOf(2)).toEqual(expectedLit(2))
    expect(litOf(1)).not.toEqual(litOf(2))
  })

  it('random-fixed keeps the legacy order without a seed and re-rolls with one', () => {
    const fx = effect({ fixtureOrder: 'random-fixed' })
    // No seed: the legacy id-only hash — effects saved before the seed
    // existed keep exactly this order on upgrade.
    const legacyHash = (id: string) =>
      [...`e1:${id}`].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 7)
    const legacyOrder = [...pars].sort((a, b) => legacyHash(a.id) - legacyHash(b.id)).map((f) => f.id)
    expect(orderIds(fx, pars, 0)).toEqual(legacyOrder)
    expect(orderIds(fx, pars, 0)).toEqual(orderIds(fx, pars, 0))
    // A stored seed shuffles genuinely, and stays put for that seed.
    expect(orderIds(effect({ fixtureOrder: 'random-fixed', randomOrderSeed: 7 }), pars, 0))
      .not.toEqual(orderIds(effect({ fixtureOrder: 'random-fixed', randomOrderSeed: 8 }), pars, 0))
    expect(orderIds(effect({ fixtureOrder: 'random-fixed', randomOrderSeed: 7 }), pars, 0))
      .toEqual(orderIds(effect({ fixtureOrder: 'random-fixed', randomOrderSeed: 7 }), pars, 0))
  })
})

describe('consider spacing (Guide p.152)', () => {
  it('curve delays follow Preview distances with spacing on, uniform steps with it off', () => {
    // Bell curve, 2s, 25% offset, left-right order, fixtures at x=0, 10, 100.
    // Spacing off: uniform 0.5s steps — peaks at 1.0, 1.5, 2.0.
    // Spacing on: positions 0, 0.1, 1 — delays 0, 0.1s, 1.0s, peaks at
    // 1.0, 1.1, 2.0. The close pair gets near-equal delays, the far fixture
    // a much larger one.
    const fx = (spacing: boolean) => bellCurve({ fixtureIds: ['s1', 's2', 's3'], fixtureOrder: 'left-right', considerSpacing: spacing })
    const times = sampleTimes(0, 3, 0.05)
    const peakTimes = (spacing: boolean) => {
      const effectDef = fx(spacing)
      const ch = uneven.map((f) => channelOf(f, 'intensity'))
      return ch.map((_, i) => firstHigh(times, (t) => computeEffectPatch(uneven, [effectDef], t, 120)[ch[i]], 250))
    }
    expect(peakTimes(false)).toEqual([1.0, 1.5, 2.0])
    expect(peakTimes(true)).toEqual([1.0, 1.1, 2.0])
  })

  it('movement delays follow Preview distances with spacing on', () => {
    // Circle path: pan peaks at the start of each cycle, so at t=0 the
    // fixture whose delay is smallest reads near-full pan and the others
    // read by their delay. Spacing off, the close pair (x=0, x=10) read
    // far apart (229 vs 127); spacing on they read near-equal (229 vs ~224)
    // while the far fixture stays low.
    const fx = (spacing: boolean): EffectDef => effect({
      fixtureIds: ['h1', 'h2', 'h3'],
      kind: 'movement',
      attribute: 'position',
      movementPathId: 'builtin-circle',
      fixtureOrder: 'left-right',
      pixelMode: 'fixtures',
      timeOffset: 25,
      durationMs: 2000,
      timingMode: 'fixed',
      considerSpacing: spacing
    })
    const panAt0 = (spacing: boolean) => {
      const patch = computeEffectPatch(heads, [fx(spacing)], 0, 120)
      return heads.map((f) => patch[channelOf(f, 'pan')])
    }
    const off = panAt0(false)
    expect(Math.abs((off[0] ?? 0) - (off[1] ?? 0))).toBeGreaterThan(80)
    const on = panAt0(true)
    expect(Math.abs((on[0] ?? 0) - (on[1] ?? 0))).toBeLessThanOrEqual(10)
    expect(on[2] ?? 0).toBeLessThan(60)
  })
})

describe('custom order (Guide pp.152-153)', () => {
  it('orders by number: ties keep patch order, unnumbered fixtures trail', () => {
    const fx = effect({ fixtureOrder: 'custom', customFixtureNumbers: { f2: 1, f4: 1, f1: 3 } })
    expect(orderedEffectFixtures(fx, pars, 0).map((f) => f.id)).toEqual(['f2', 'f4', 'f1', 'f3'])
  })

  it('same number is one pixel, a skipped number is a gap, numbers are relative', () => {
    const pixels = (numbers: Record<string, number>) =>
      orderedEffectPixels(effect({ fixtureOrder: 'custom', customFixtureNumbers: numbers }), pars, 'intensity')
    // f1 and f2 share number 1 (one pixel), f3 skips to 3 (a gap of one step).
    expect(pixels({ f1: 1, f2: 1, f3: 3, f4: 3 }).map((p) => [p.fixture.id, p.phaseIndex])).toEqual([
      ['f1', 0], ['f2', 0], ['f3', 2], ['f4', 2]
    ])
    // Numbers starting at 3 behave the same — the first number is step 0.
    expect(pixels({ f1: 3, f2: 3, f3: 5, f4: 5 }).map((p) => p.phaseIndex)).toEqual([0, 0, 2, 2])
    // A fixture with no number trails the numbered ones as its own step.
    expect(pixels({ f1: 2 }).map((p) => [p.fixture.id, p.phaseIndex])).toEqual([
      ['f1', 0], ['f2', 1], ['f3', 2], ['f4', 3]
    ])
    // The normalised position follows the numbers too, so the legacy
    // oscillator spread respects gaps and shared numbers as well.
    expect(pixels({ f1: 1, f2: 1, f3: 3, f4: 3 }).map((p) => p.position)).toEqual([0, 0, 1, 1])
  })

  it('a custom order applies to whole fixtures, never individual beams', () => {
    const pb1: FixtureDef = { id: 'pb1', name: 'PB1', type: 'par', profileId: 'pan-4x1x30-17ch', channelStart: 1, channels: 17, previewPosition: { x: 0, y: 0 } }
    const par: FixtureDef = { id: 'par1', name: 'Par', type: 'par', channelStart: 18, channels: 4, previewPosition: { x: 100, y: 0 } }
    const fixtures = [pb1, par]
    const beams = orderedEffectPixels(
      effect({ fixtureIds: ['pb1', 'par1'], attribute: 'red', pixelMode: 'beams' }), fixtures, 'red'
    )
    // The bar splits into one pixel per cell in beams mode — the custom
    // order must collapse it back to one pixel per fixture.
    expect(beams.length).toBeGreaterThan(2)
    expect(beams.some((p) => p.beamId !== undefined)).toBe(true)
    const custom = orderedEffectPixels(
      effect({ fixtureIds: ['pb1', 'par1'], attribute: 'red', pixelMode: 'beams', fixtureOrder: 'custom', customFixtureNumbers: { pb1: 2, par1: 1 } }),
      fixtures, 'red'
    )
    expect(custom.map((p) => [p.fixture.id, p.phaseIndex, p.beamId])).toEqual([
      ['par1', 0, undefined], ['pb1', 1, undefined]
    ])
  })

  it('a curve effect staggers by the numbers, gaps included', () => {
    // Bell curve, 2s, 25% offset (0.5s per step). Numbers 1, 1, 3: the close
    // pair peaks together at 1.0s, the far fixture a full step later at 2.0s.
    const times = sampleTimes(0, 3, 0.05)
    const peakTimes = (numbers: Record<string, number>) => {
      const effectDef = bellCurve({ fixtureIds: ['s1', 's2', 's3'], fixtureOrder: 'custom', customFixtureNumbers: numbers })
      const ch = uneven.map((f) => channelOf(f, 'intensity'))
      return ch.map((_, i) => firstHigh(times, (t) => computeEffectPatch(uneven, [effectDef], t, 120)[ch[i]], 250))
    }
    expect(peakTimes({ s1: 1, s2: 1, s3: 3 })).toEqual([1.0, 1.0, 2.0])
    // A three-step gap needs a longer cycle to read as later rather than
    // wrapped: 4s duration, 25% offset (1.0s per step), numbers 1, 2, 4.
    // At t=5.0s the third fixture is at its gap-delayed peak (255) while
    // the first two have already passed theirs.
    const longEffect = bellCurve({ fixtureIds: ['s1', 's2', 's3'], fixtureOrder: 'custom', customFixtureNumbers: { s1: 1, s2: 2, s3: 4 }, durationMs: 4000 })
    const ch = uneven.map((f) => channelOf(f, 'intensity'))
    const at5 = computeEffectPatch(uneven, [longEffect], 5, 120)
    expect(at5[ch[2]]).toBe(255)
    expect(at5[ch[0]]).toBeLessThan(250)
    expect(at5[ch[1]]).toBeLessThan(250)
  })
})
