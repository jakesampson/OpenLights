// @vitest-environment jsdom
/**
 * NDI Ambience — sampling (edge regions, most-saturated thresholds) and
 * region→fixture mapping. Synthetic frames are exact, so assertions are
 * exact here; NDI compression loss only applies to real frames.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_SCREEN_HEIGHT,
  DEFAULT_SCREEN_WIDTH,
  NDI_REGION_COUNT,
  NDI_THUMBNAIL_MAX_HEIGHT,
  NDI_THUMBNAIL_MAX_WIDTH,
  downscaleFrame,
  edgeRegionAnchors,
  findNdiScreen,
  mapRegionsToFixtures,
  sampleEdgeRegions,
  screenRect,
  screenRegionAnchors,
  type NdiFrame,
  type NdiRgb
} from '@shared/ndiAmbience'
import { DMXEngine } from '../src/shared/dmx'
import {
  computeAmbiencePatch,
  configureAmbienceFixtures,
  getAmbienceStats,
  getAmbienceFixtureGroup,
  getAmbienceTransitionMs,
  interpolateAmbiencePatch,
  isAmbienceActive,
  NDI_DEFAULT_TRANSITION_MS,
  resolvedFixturePosition,
  resolveAmbienceFixtureGroup,
  resetAmbienceState,
  setAmbienceActive,
  setAmbienceFixtureGroup,
  setAmbienceRegions,
  setAmbienceTransitionMs
} from '@renderer/lib/ndiAmbience'
import type { FixtureDef, StageObject } from '@shared/types'

function solidFrame(width: number, height: number, colour: NdiRgb): NdiFrame {
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = colour.b
    data[i * 4 + 1] = colour.g
    data[i * 4 + 2] = colour.r
    data[i * 4 + 3] = 255
  }
  return { xres: width, yres: height, lineStrideBytes: width * 4, data }
}

/** Frame split top half / bottom half by colour. */
function splitFrame(width: number, height: number, top: NdiRgb, bottom: NdiRgb): NdiFrame {
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const colour = y < height / 2 ? top : bottom
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = colour.b
      data[i + 1] = colour.g
      data[i + 2] = colour.r
      data[i + 3] = 255
    }
  }
  return { xres: width, yres: height, lineStrideBytes: width * 4, data }
}

/** Paint a solid rectangle onto a frame (white base, for band tests). */
function paintRect(frame: NdiFrame, x0: number, y0: number, x1: number, y1: number, colour: NdiRgb) {
  const { lineStrideBytes, data } = frame
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * lineStrideBytes + x * 4
      data[i] = colour.b
      data[i + 1] = colour.g
      data[i + 2] = colour.r
      data[i + 3] = 255
    }
  }
}

const RED: NdiRgb = { r: 255, g: 0, b: 0 }
const BLUE: NdiRgb = { r: 0, g: 0, b: 255 }
const GREEN: NdiRgb = { r: 0, g: 255, b: 0 }

function screenObject(x = 400, y = 170, width = DEFAULT_SCREEN_WIDTH, height = DEFAULT_SCREEN_HEIGHT): StageObject {
  return { id: 'screen-1', kind: 'screen', name: 'Screen', x, y, width, height, rotation: 0, fill: '', stroke: '', opacity: 1 }
}

function rgbaFixture(id: string, channelStart: number, pos?: { x: number; y: number }): FixtureDef {
  return {
    id,
    profileId: 'simger-q12bt-rgba-4ch',
    type: 'rgba-4ch',
    name: id,
    channelStart,
    channels: 4,
    previewPosition: pos,
    disabled: false,
    inStorage: false,
    instances: 1
  }
}

describe('edgeRegionAnchors', () => {
  it('returns 8 anchors, clockwise from the top-left, on the perimeter', () => {
    const anchors = edgeRegionAnchors()
    expect(anchors).toHaveLength(NDI_REGION_COUNT)
    expect(anchors[0]).toEqual({ x: 0.25, y: 0 })
    expect(anchors[1]).toEqual({ x: 0.75, y: 0 })
    expect(anchors[2]).toEqual({ x: 1, y: 0.25 })
    expect(anchors[3]).toEqual({ x: 1, y: 0.75 })
    expect(anchors[4]).toEqual({ x: 0.75, y: 1 })
    expect(anchors[5]).toEqual({ x: 0.25, y: 1 })
    expect(anchors[6]).toEqual({ x: 0, y: 0.75 })
    expect(anchors[7]).toEqual({ x: 0, y: 0.25 })
    for (const a of anchors) {
      expect(a.x === 0 || a.x === 1 || a.y === 0 || a.y === 1).toBe(true)
    }
  })
})

describe('sampleEdgeRegions', () => {
  it('samples a solid red frame as red in every region', () => {
    const regions = sampleEdgeRegions(solidFrame(320, 180, RED))
    expect(regions).toHaveLength(NDI_REGION_COUNT)
    for (const region of regions) {
      expect(region.rgb).toEqual(RED)
    }
  })

  it('splits a red-top / blue-bottom frame by region', () => {
    const regions = sampleEdgeRegions(splitFrame(320, 180, RED, BLUE))
    expect(regions[0].rgb).toEqual(RED)
    expect(regions[1].rgb).toEqual(RED)
    expect(regions[4].rgb).toEqual(BLUE)
    expect(regions[5].rgb).toEqual(BLUE)
    // Side regions sit in one half each: right-top is red, right-bottom blue.
    expect(regions[2].rgb).toEqual(RED)
    expect(regions[3].rgb).toEqual(BLUE)
    expect(regions[6].rgb).toEqual(BLUE)
    expect(regions[7].rgb).toEqual(RED)
  })

  it('reads an all-white frame as white in every region', () => {
    // White must read as white (Jake, 23 Nov 2026 — the old
    // most-saturated rule skipped white pixels, so white slides left
    // the rig blank). Under RMS a white region is simply white.
    const regions = sampleEdgeRegions(solidFrame(320, 180, { r: 255, g: 255, b: 255 }))
    expect(regions.every((r) => r.rgb !== null && r.rgb.r === 255 && r.rgb.g === 255 && r.rgb.b === 255)).toBe(true)
  })

  it('returns null for every region on an all-black frame', () => {
    const regions = sampleEdgeRegions(solidFrame(320, 180, { r: 0, g: 0, b: 0 }))
    expect(regions.every((r) => r.rgb === null)).toBe(true)
  })

  it('reads a dark region with a bright orange patch as orange, not grey', () => {
    // Jake's case (23 Nov 2026): a dark edge with a little bright orange
    // should read bright orange. Under RMS the black pixels contribute
    // ~nothing to the squares, so the orange dominates: a 160x32 orange
    // patch in the top-left region's outer half comes out (180, 117, 0)
    // — the orange at the weight it carries — not a grey average.
    const frame = solidFrame(320, 180, { r: 0, g: 0, b: 0 })
    paintRect(frame, 0, 0, 160, 32, { r: 255, g: 165, b: 0 })
    const regions = sampleEdgeRegions(frame)
    expect(regions[0].rgb).toEqual({ r: 180, g: 117, b: 0 })
    // The other top region has no orange in it: genuinely black, null.
    expect(regions[1].rgb).toBeNull()
    expect(regions[4].rgb).toBeNull()
  })

  it('tints, rather than wins, a thin stripe in a mostly-white region', () => {
    // The flip side of RMS: a thin red stripe at the very top of a
    // mostly-white region is a small share of the samples, so it tints
    // the white toward pink instead of taking the region over — the
    // region really is mostly white.
    const frame = solidFrame(320, 180, { r: 240, g: 240, b: 240 })
    for (let x = 0; x < 320; x++) {
      for (let y = 0; y < 4; y++) {
        const i = (y * 320 + x) * 4
        frame.data[i] = 0
        frame.data[i + 1] = 0
        frame.data[i + 2] = 255
        frame.data[i + 3] = 255
      }
    }
    const regions = sampleEdgeRegions(frame)
    expect(regions[0].rgb).toEqual({ r: 242, g: 224, b: 224 })
    expect(regions[1].rgb).toEqual({ r: 242, g: 224, b: 224 })
    // The bottom regions have no stripe at all: plain near-white.
    expect(regions[4].rgb).toEqual({ r: 240, g: 240, b: 240 })
  })

  it('respects lineStrideBytes wider than the row', () => {
    const width = 64
    const height = 36
    const stride = width * 4 + 32
    const data = Buffer.alloc(stride * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * stride + x * 4
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 255
        data[i + 3] = 255
      }
    }
    const regions = sampleEdgeRegions({ xres: width, yres: height, lineStrideBytes: stride, data })
    expect(regions.every((r) => r.rgb !== null && r.rgb.r === 255)).toBe(true)
  })

  it('returns null for a degenerate frame', () => {
    expect(sampleEdgeRegions({ xres: 0, yres: 0, lineStrideBytes: 0, data: Buffer.alloc(0) })).toHaveLength(NDI_REGION_COUNT)
  })

  it('samples the top and bottom bands 50% into the frame', () => {
    // Black base, so a region only reads what the stripe gives it.
    // A red stripe at 22–27% of the height sits inside the 50% top
    // band: the top regions read a dim red (one sampled row, outer
    // half — RMS (90, 0, 0)).
    const topStripe = solidFrame(320, 180, { r: 0, g: 0, b: 0 })
    paintRect(topStripe, 0, 40, 320, 48, RED)
    const top = sampleEdgeRegions(topStripe)
    expect(top[0].rgb).toEqual({ r: 90, g: 0, b: 0 })
    expect(top[1].rgb).toEqual({ r: 90, g: 0, b: 0 })
    expect(top[4].rgb).toBeNull()
    expect(top[5].rgb).toBeNull()
    // A stripe at 55–60% is past the top band but inside the bottom
    // band — and it counts less there, because it sits in the inner
    // half (RMS (52, 0, 0) against the outer half's 90 above: same
    // stripe, less weight).
    const pastTop = solidFrame(320, 180, { r: 0, g: 0, b: 0 })
    paintRect(pastTop, 0, 99, 320, 108, RED)
    const past = sampleEdgeRegions(pastTop)
    expect(past[0].rgb).toBeNull()
    expect(past[1].rgb).toBeNull()
    expect(past[4].rgb).toEqual({ r: 52, g: 0, b: 0 })
    expect(past[5].rgb).toEqual({ r: 52, g: 0, b: 0 })
    // A red stripe at 73–78% of the height is inside the bottom band.
    const bottomStripe = solidFrame(320, 180, { r: 0, g: 0, b: 0 })
    paintRect(bottomStripe, 0, 132, 320, 140, RED)
    const bottom = sampleEdgeRegions(bottomStripe)
    expect(bottom[4].rgb).toEqual({ r: 90, g: 0, b: 0 })
    expect(bottom[5].rgb).toEqual({ r: 90, g: 0, b: 0 })
    expect(bottom[0].rgb).toBeNull()
    expect(bottom[1].rgb).toBeNull()
  })

  it('keeps the side bands at 12% of the frame width', () => {
    // Black base, so a region only reads what the stripe gives it.
    // A red stripe at 12.5–15% of the width sits outside the 12% side
    // bands: no region must see it (a wider side band would catch it).
    const outside = solidFrame(320, 180, { r: 0, g: 0, b: 0 })
    paintRect(outside, 40, 70, 48, 110, RED)
    expect(sampleEdgeRegions(outside).every((r) => r.rgb === null)).toBe(true)
    // Control: the same stripe at 3–6% of the width is inside the band.
    const inside = solidFrame(320, 180, { r: 0, g: 0, b: 0 })
    paintRect(inside, 10, 70, 20, 110, RED)
    const seen = sampleEdgeRegions(inside)
    expect(seen[6].rgb).toEqual({ r: 65, g: 0, b: 0 })
    expect(seen[7].rgb).toEqual({ r: 65, g: 0, b: 0 })
    expect(seen[2].rgb).toBeNull()
    expect(seen[3].rgb).toBeNull()
  })
})

describe('screenRegionAnchors', () => {
  it('maps the anchors into Preview coordinates of the placed screen', () => {
    const anchors = screenRegionAnchors(screenRect(screenObject(400, 170, 320, 180)))
    expect(anchors[0]).toEqual({ x: 320, y: 80 })
    expect(anchors[1]).toEqual({ x: 480, y: 80 })
    expect(anchors[2]).toEqual({ x: 560, y: 125 })
    expect(anchors[4]).toEqual({ x: 480, y: 260 })
    expect(anchors[7]).toEqual({ x: 240, y: 125 })
  })
})

describe('mapRegionsToFixtures', () => {
  it('maps each region to its nearest fixture', () => {
    const mapping = mapRegionsToFixtures(
      [
        { x: 320, y: 80 },
        { x: 480, y: 80 },
        { x: 560, y: 125 },
        { x: 560, y: 215 },
        { x: 480, y: 260 },
        { x: 320, y: 260 },
        { x: 240, y: 215 },
        { x: 240, y: 125 }
      ],
      [
        { id: 'top-left', x: 320, y: 60 },
        { id: 'bottom-right', x: 480, y: 280 }
      ]
    )
    expect(mapping['top-left']).toBe(0)
    expect(mapping['bottom-right']).toBe(4)
  })

  it('returns an empty mapping with no fixtures', () => {
    expect(mapRegionsToFixtures([{ x: 1, y: 1 }], [])).toEqual({})
  })
})

describe('findNdiScreen', () => {
  it('finds the screen object and returns undefined without one', () => {
    expect(findNdiScreen([screenObject()])?.id).toBe('screen-1')
    expect(findNdiScreen(undefined)).toBeUndefined()
    expect(findNdiScreen([{ ...screenObject(), kind: 'rectangle' }])).toBeUndefined()
  })
})

describe('resolvedFixturePosition', () => {
  it('prefers the stored Preview position', () => {
    expect(resolvedFixturePosition(rgbaFixture('f1', 20, { x: 123, y: 45 }), 0, 1)).toEqual({ x: 123, y: 45 })
  })

  it('falls back to the demo arc', () => {
    // Single fixture on the arc: centre top (400, 59).
    expect(resolvedFixturePosition(rgbaFixture('f1', 20), 0, 1)).toEqual({ x: 400, y: 59 })
  })
})

describe('computeAmbiencePatch', () => {
  const screen = screenObject()
  const regions = sampleEdgeRegions(splitFrame(320, 180, RED, BLUE))

  it('drives each fixture from its nearest screen-edge region', () => {
    resetAmbienceState()
    // Fixture 1 sits just above the screen's top-left corner; fixture 2
    // just below its bottom-right corner.
    const fixtures = [rgbaFixture('f1', 20, { x: 320, y: 60 }), rgbaFixture('f2', 24, { x: 480, y: 280 })]
    const { patch, stats } = computeAmbiencePatch(fixtures, screen, regions, Array(NDI_REGION_COUNT).fill(null), 255)
    expect(patch[20]).toBe(255) // f1 red
    expect(patch[21]).toBe(0)
    expect(patch[22]).toBe(0)
    expect(patch[23]).toBe(0) // amber zeroed — the colour is pure
    expect(patch[24]).toBe(0)
    expect(patch[25]).toBe(0)
    expect(patch[26]).toBe(255) // f2 blue
    expect(patch[27]).toBe(0)
    expect(stats.mapped).toBe(2)
  })

  it('returns an empty patch with no screen placed', () => {
    resetAmbienceState()
    const { patch, stats } = computeAmbiencePatch([rgbaFixture('f1', 20)], null, regions, Array(NDI_REGION_COUNT).fill(null), 255)
    expect(patch).toEqual({})
    expect(stats.mapped).toBe(0)
  })

  it('holds the last colour when a region goes genuinely black, and skips with none held', () => {
    resetAmbienceState()
    const fixtures = [rgbaFixture('f1', 20, { x: 320, y: 60 })]
    // A white frame now reads as white (RMS), so it drives the fixture
    // white — it no longer counts as "blank" the way it did under the
    // old most-saturated rule.
    const white = sampleEdgeRegions(solidFrame(320, 180, { r: 255, g: 255, b: 255 }))
    const first = computeAmbiencePatch(fixtures, screen, white, Array(NDI_REGION_COUNT).fill(null), 255)
    expect(first.patch[20]).toBe(255)
    expect(first.patch[21]).toBe(255)
    expect(first.patch[22]).toBe(255)
    // A black frame is genuinely black: the region reports no colour,
    // so the patch holds the last colour (green) instead of going dark.
    const black = sampleEdgeRegions(solidFrame(320, 180, { r: 0, g: 0, b: 0 }))
    const second = computeAmbiencePatch(fixtures, screen, black, Array(NDI_REGION_COUNT).fill(null).map((_, i) => (i === 0 ? GREEN : null)), 255)
    expect(second.patch[20]).toBe(0)
    expect(second.patch[21]).toBe(255)
    expect(second.patch[22]).toBe(0)
    // And with no colour held at all, a black region drives nothing.
    const third = computeAmbiencePatch(fixtures, screen, black, Array(NDI_REGION_COUNT).fill(null), 255)
    expect(third.patch).toEqual({})
  })

  it('drives a dimmer-only fixture as white light, and counts undrivable fixtures without driving them', () => {
    resetAmbienceState()
    const dimmer: FixtureDef = { ...rgbaFixture('dim', 28), type: 'dimmer', profileId: 'dimmer-1ch', channels: 1 }
    const disabled = { ...rgbaFixture('off', 32, { x: 320, y: 60 }), disabled: true }
    const stored = { ...rgbaFixture('box', 36, { x: 320, y: 60 }), inStorage: true }
    const fixtures = [rgbaFixture('f1', 20, { x: 320, y: 60 }), dimmer, disabled, stored]
    const { patch, stats } = computeAmbiencePatch(fixtures, screen, regions, Array(NDI_REGION_COUNT).fill(null), 255)
    expect(patch[20]).toBe(255)
    // The dimmer-only spotlight follows its region as a bright white
    // light (Jake, 23 Nov 2026): its region is red (255, 0, 0), so its
    // dimmer rides at the region's brightest channel, 255.
    expect(patch[28]).toBe(255)
    // Disabled fixtures stay dark: computeCueChannels writes explicit
    // zeroes for them, which agrees with the composed output.
    expect(patch[32]).toBe(0)
    expect(patch[36]).toBeUndefined()
    expect(stats).toEqual({ mapped: 2, colourless: 0, disabled: 1, inStorage: 1 })
  })

  it('drives a dimmer-only fixture at its region brightness, not full', () => {
    resetAmbienceState()
    // A dimmer-only fixture in the top-left region, whose colour is the
    // dim orange of the dark+orange test: its dimmer tracks the
    // region's brightest channel (180), not a flat 255.
    const dimmer: FixtureDef = { ...rgbaFixture('dim', 28, { x: 320, y: 60 }), type: 'dimmer', profileId: 'dimmer-1ch', channels: 1 }
    const frame = solidFrame(320, 180, { r: 0, g: 0, b: 0 })
    paintRect(frame, 0, 0, 160, 32, { r: 255, g: 165, b: 0 })
    const { patch, stats } = computeAmbiencePatch([dimmer], screen, sampleEdgeRegions(frame), Array(NDI_REGION_COUNT).fill(null), 255)
    expect(patch[28]).toBe(180)
    expect(stats.mapped).toBe(1)
  })

  it('scales with the master fader', () => {
    resetAmbienceState()
    const fixtures = [rgbaFixture('f1', 20, { x: 320, y: 60 })]
    const { patch } = computeAmbiencePatch(fixtures, screen, regions, Array(NDI_REGION_COUNT).fill(null), 128)
    expect(patch[20]).toBeGreaterThan(0)
    expect(patch[20]).toBeLessThan(255)
  })
})

describe('fixture group scoping', () => {
  let engine: DMXEngine
  let frames: FrameRequestCallback[] = []

  beforeEach(() => {
    engine = new DMXEngine()
    frames = []
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      setChannels: (values: Record<number, number>) => engine.setChannels(values)
    }
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    resetAmbienceState()
    setAmbienceTransitionMs(NDI_DEFAULT_TRANSITION_MS)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    resetAmbienceState()
    setAmbienceTransitionMs(NDI_DEFAULT_TRANSITION_MS)
  })

  const groups = [
    { id: 'g-front', name: 'Front', parentId: null, fixtureIds: ['f1'] },
    { id: 'g-back', name: 'Back', parentId: null, fixtureIds: ['f2'] }
  ]
  const fixtures = [
    rgbaFixture('f1', 20, { x: 320, y: 60 }),
    rgbaFixture('f2', 24, { x: 480, y: 280 })
  ]
  const regions = sampleEdgeRegions(splitFrame(320, 180, RED, BLUE))

  it('drives only the picked group’s fixtures', () => {
    setAmbienceFixtureGroup('g-back')
    configureAmbienceFixtures(fixtures, [screenObject()], 255, groups)
    setAmbienceActive(true)
    setAmbienceRegions(regions)
    // f1 (Front) is not in the patch at all — its red channel stays at
    // the baseline 0; f2 (Back) is blue (DMX 26 → snapshot index 25).
    expect(engine.snapshot()[19]).toBe(0)
    expect(engine.snapshot()[25]).toBe(255)
    expect(getAmbienceStats().mapped).toBe(1)
  })

  it('falls back to all fixtures when the picked group no longer exists', () => {
    setAmbienceFixtureGroup('g-gone')
    configureAmbienceFixtures(fixtures, [screenObject()], 255, groups)
    setAmbienceActive(true)
    setAmbienceRegions(regions)
    expect(engine.snapshot()[19]).toBe(255)
    expect(engine.snapshot()[25]).toBe(255)
    expect(getAmbienceStats().mapped).toBe(2)
  })

  it('resolves the picked group, or null for all fixtures and stale picks', () => {
    expect(getAmbienceFixtureGroup()).toBeNull()
    expect(resolveAmbienceFixtureGroup(groups)).toBeNull()
    setAmbienceFixtureGroup('g-front')
    expect(getAmbienceFixtureGroup()).toBe('g-front')
    expect(resolveAmbienceFixtureGroup(groups)?.name).toBe('Front')
    expect(resolveAmbienceFixtureGroup([])).toBeNull()
    setAmbienceFixtureGroup(null)
    expect(resolveAmbienceFixtureGroup(groups)).toBeNull()
  })
})

describe('interpolateAmbiencePatch', () => {
  it('returns the start values at 0 and the target at 1', () => {
    expect(interpolateAmbiencePatch({ 20: 255, 22: 0 }, { 20: 0, 22: 255 }, 0)).toEqual({ 20: 255, 22: 0 })
    expect(interpolateAmbiencePatch({ 20: 255, 22: 0 }, { 20: 0, 22: 255 }, 1)).toEqual({ 20: 0, 22: 255 })
  })

  it('passes through the midpoint at 0.5', () => {
    expect(interpolateAmbiencePatch({ 20: 255 }, { 20: 0 }, 0.5)).toEqual({ 20: 128 })
    expect(interpolateAmbiencePatch({ 20: 0 }, { 20: 255 }, 0.5)).toEqual({ 20: 128 })
  })

  it('fades a newly mapped channel in from 0', () => {
    expect(interpolateAmbiencePatch({}, { 20: 200 }, 0.5)).toEqual({ 20: 100 })
  })

  it('drops channels that leave the patch instead of dipping them to zero', () => {
    expect(interpolateAmbiencePatch({ 20: 255, 21: 100 }, { 20: 0 }, 0.5)).toEqual({ 20: 128 })
  })

  it('clamps progress outside 0–1', () => {
    expect(interpolateAmbiencePatch({ 20: 0 }, { 20: 100 }, -1)).toEqual({ 20: 0 })
    expect(interpolateAmbiencePatch({ 20: 0 }, { 20: 100 }, 2)).toEqual({ 20: 100 })
  })
})

describe('ambience transition setting', () => {
  it('defaults to 500 ms and clamps to 0–2000 ms', () => {
    setAmbienceTransitionMs(NDI_DEFAULT_TRANSITION_MS)
    expect(getAmbienceTransitionMs()).toBe(500)
    setAmbienceTransitionMs(5000)
    expect(getAmbienceTransitionMs()).toBe(2000)
    setAmbienceTransitionMs(-100)
    expect(getAmbienceTransitionMs()).toBe(0)
    setAmbienceTransitionMs(NDI_DEFAULT_TRANSITION_MS)
  })
})

describe('colour smoothing (glide)', () => {
  let engine: DMXEngine
  let frames: FrameRequestCallback[] = []
  let cancelMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    engine = new DMXEngine()
    frames = []
    cancelMock = vi.fn()
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      setChannels: (values: Record<number, number>) => engine.setChannels(values)
    }
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', cancelMock)
    resetAmbienceState()
    setAmbienceTransitionMs(500)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    resetAmbienceState()
    setAmbienceTransitionMs(NDI_DEFAULT_TRANSITION_MS)
  })

  const redRegions = () => sampleEdgeRegions(solidFrame(320, 180, RED))
  const blueRegions = () => sampleEdgeRegions(solidFrame(320, 180, BLUE))

  function startWithRed() {
    const fixtures = [rgbaFixture('f1', 20, { x: 320, y: 60 })]
    configureAmbienceFixtures(fixtures, [screenObject()], 255)
    setAmbienceActive(true)
    setAmbienceRegions(redRegions())
    expect(engine.snapshot()[19]).toBe(255)
    expect(engine.snapshot()[21]).toBe(0)
  }

  it('glides between sampled colours over the transition time instead of jumping', () => {
    startWithRed()
    const start = performance.now()
    setAmbienceRegions(blueRegions())
    expect(frames.length).toBe(1)
    frames.shift()!(start + 250)
    const mid = engine.snapshot()
    expect(mid[19]).toBeGreaterThan(90)
    expect(mid[19]).toBeLessThan(165)
    expect(mid[21]).toBeGreaterThan(90)
    expect(mid[21]).toBeLessThan(165)
    frames.shift()!(start + 600)
    expect(engine.snapshot()[19]).toBe(0)
    expect(engine.snapshot()[21]).toBe(255)
    expect(frames.length).toBe(0)
  })

  it('retargets mid-glide from the current values without jumping', () => {
    startWithRed()
    const start = performance.now()
    setAmbienceRegions(blueRegions())
    frames.shift()!(start + 250)
    expect(engine.snapshot()[19]).toBeGreaterThan(90)
    expect(engine.snapshot()[19]).toBeLessThan(165)
    // A new sample arrives mid-glide (green): the glide restarts from
    // the interpolated values, so red never jumps back up.
    const greenRegions = sampleEdgeRegions(solidFrame(320, 180, GREEN))
    setAmbienceRegions(greenRegions)
    const retarget = performance.now()
    frames.shift()!(retarget + 600)
    expect(engine.snapshot()[19]).toBe(0)
    expect(engine.snapshot()[20]).toBe(255)
    expect(engine.snapshot()[21]).toBe(0)
  })

  it('repeated samples mid-glide do not restart the clock — the glide lands on the original deadline', () => {
    startWithRed()
    const start = performance.now()
    setAmbienceRegions(blueRegions())
    frames.shift()!(start + 250)
    expect(engine.snapshot()[19]).toBeGreaterThan(90)
    expect(engine.snapshot()[19]).toBeLessThan(165)
    // The worker re-posts the same colour every ~200 ms; mid-glide the
    // current (interpolated) patch still differs from it, so each sample
    // retargets. The retarget must keep the original start time, or the
    // glide would creep toward the target forever and never land.
    setAmbienceRegions(blueRegions())
    setAmbienceRegions(blueRegions())
    frames.shift()!(start + 500)
    expect(engine.snapshot()[19]).toBe(0)
    expect(engine.snapshot()[21]).toBe(255)
    frames.shift()!(start + 600)
    expect(frames.length).toBe(0)
  })

  it('applies new samples instantly with a 0 ms transition', () => {
    setAmbienceTransitionMs(0)
    startWithRed()
    setAmbienceRegions(blueRegions())
    expect(frames.length).toBe(0)
    expect(engine.snapshot()[19]).toBe(0)
    expect(engine.snapshot()[21]).toBe(255)
  })

  it('stopping mid-glide cancels the glide and hands the rig back', () => {
    startWithRed()
    setAmbienceRegions(blueRegions())
    expect(frames.length).toBe(1)
    setAmbienceActive(false)
    expect(isAmbienceActive()).toBe(false)
    expect(cancelMock).toHaveBeenCalled()
    // The composed output now carries explicit zeroes for the released
    // ambience channels (previousChannels), so the rig goes dark rather
    // than holding the last glide value.
    expect(engine.snapshot()[19]).toBe(0)
    expect(engine.snapshot()[21]).toBe(0)
  })
})

describe('downscaleFrame (live video preview thumbnail)', () => {
  // Bytes are BGRA (the order Electron's createFromBitmap expects):
  // byte 0 is blue, byte 2 is red.
  const pixel = (thumb: ReturnType<typeof downscaleFrame>, x: number, y: number) => {
    const i = (y * thumb.width + x) * 4
    return { r: thumb.data[i + 2], g: thumb.data[i + 1], b: thumb.data[i], a: thumb.data[i + 3] }
  }

  it('halves a 1280x720 frame to 640x360 and keeps red red (stays BGRA)', () => {
    const thumb = downscaleFrame(solidFrame(1280, 720, RED))
    expect(thumb.width).toBe(640)
    expect(thumb.height).toBe(360)
    expect(pixel(thumb, 0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(pixel(thumb, 639, 359)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    // Raw order pin: byte 0 is B (0), byte 2 is R (255). Swapping
    // these two is exactly what would turn a red feed blue on the
    // Screen (caught by the real-app probe, 23 Nov 2026).
    expect(thumb.data[0]).toBe(0)
    expect(thumb.data[1]).toBe(0)
    expect(thumb.data[2]).toBe(255)
    expect(thumb.data[3]).toBe(255)
  })

  it('keeps top/bottom colours in the right rows on a split frame', () => {
    const thumb = downscaleFrame(splitFrame(1280, 720, RED, BLUE))
    expect(thumb.width).toBe(640)
    expect(thumb.height).toBe(360)
    expect(pixel(thumb, 0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(pixel(thumb, 0, 359)).toEqual({ r: 0, g: 0, b: 255, a: 255 })
  })

  it('caps at 360p, preserves aspect, and never upscales a small frame', () => {
    expect(downscaleFrame(solidFrame(1920, 1080, RED))).toMatchObject({ width: 640, height: 360 })
    expect(downscaleFrame(solidFrame(1000, 1000, RED))).toMatchObject({ width: 360, height: 360 })
    expect(downscaleFrame(solidFrame(320, 180, RED))).toMatchObject({ width: 320, height: 180 })
    expect(NDI_THUMBNAIL_MAX_WIDTH).toBe(640)
    expect(NDI_THUMBNAIL_MAX_HEIGHT).toBe(360)
  })

  it('respects a stride wider than the row (padding bytes are not pixels)', () => {
    const width = 4
    const height = 2
    const stride = 24 // 4 px = 16 bytes of pixels + 8 bytes padding
    const data = Buffer.alloc(stride * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * stride + x * 4
        data[i] = 0 // B
        data[i + 1] = 0 // G
        data[i + 2] = 255 // R
        data[i + 3] = 255
      }
    }
    const thumb = downscaleFrame({ xres: width, yres: height, lineStrideBytes: stride, data }, 2, 1)
    expect(thumb.width).toBe(2)
    expect(thumb.height).toBe(1)
    expect(pixel(thumb, 0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(pixel(thumb, 1, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
  })
})
