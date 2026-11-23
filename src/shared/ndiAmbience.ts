/**
 * NDI Ambience — HyperHDR-style ambient lighting from an NDI video feed
 * (Jake, 23 Nov 2026). The feed's screen is a draggable object on the
 * Preview; the edges of the placed screen map to the nearest lights, so
 * each part of the room follows the edge of the screen nearest to it —
 * not one colour for the whole rig. NDI latency is fine: this is ambient,
 * not beat-synced, so regions are sampled about once a second.
 *
 * Pure logic only — no Node, Electron or DOM imports — so the sampling
 * can run in the NDI worker, the mapping in the renderer, and both in
 * unit tests. The worker posts small per-region colour sets; the frame
 * itself never leaves the worker.
 */
import type { StageObject } from './types'

/** Edge regions around the frame perimeter. 8 = two per edge. */
export const NDI_REGION_COUNT = 8
/** How far into the frame the edge band reaches (fraction of the frame). */
export const NDI_EDGE_BAND = 0.12
/** Most-saturated thresholds, as proven by the standalone spike
 * (~/workspace/ndi-spike/spike.js): pixels at either extreme carry no
 * useful colour for lighting, so they are skipped when picking the
 * most-saturated colour of a region — near-black when the brightest
 * channel is under 32, near-white when the darkest channel is over 235. */
export const NDI_NEAR_BLACK_MAX = 32
export const NDI_NEAR_WHITE_MIN = 235

export interface NdiRgb { r: number; g: number; b: number }
export interface NdiSourceInfo { name: string; urlAddress?: string }
export interface NdiRegionColour {
  index: number
  /** Most-saturated colour of the region, or null when the region has no
   * usable colour at all (e.g. a plain white slide edge) — the caller
   * holds the region's previous colour instead of jumping to black. */
  rgb: NdiRgb | null
  /** Share of sampled pixels in the region that were usable colour. */
  usableShare: number
}

/** A BGRA video frame, as grandi's receiver returns it. */
export interface NdiFrame {
  xres: number
  yres: number
  lineStrideBytes: number
  data: Uint8Array
}

/**
 * Unit-frame anchors of the edge regions, clockwise from the top-left
 * corner: two per edge for 8 regions — top (0.25, 0) and (0.75, 0),
 * right (1, 0.25) and (1, 0.75), bottom (0.75, 1) and (0.25, 1), left
 * (0, 0.75) and (0, 0.25). The worker samples around these anchors in
 * frame space; the renderer maps them onto the placed screen in Preview
 * space, so both sides agree on region order.
 */
export function edgeRegionAnchors(count = NDI_REGION_COUNT): Array<{ x: number; y: number }> {
  const anchors: Array<{ x: number; y: number }> = []
  for (let i = 0; i < count; i++) {
    const s = ((i + 0.5) / count) * 4 // perimeter position, 0..4
    if (s < 1) anchors.push({ x: s, y: 0 })
    else if (s < 2) anchors.push({ x: 1, y: s - 1 })
    else if (s < 3) anchors.push({ x: 3 - s, y: 1 })
    else anchors.push({ x: 0, y: 4 - s })
  }
  return anchors
}

function hexOf(rgb: NdiRgb): string {
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${hex(rgb.r)}${hex(rgb.g)}${hex(rgb.b)}`
}

/**
 * Sample the edges of a BGRA frame into per-region colours. Each region
 * samples the edge band (the outer 12% of the frame) over its stretch of
 * the perimeter, and reports its most-saturated pixel — the same measure
 * the spike proved on real slides, where the dominant colour just comes
 * out white. A region with no usable colour reports rgb null.
 */
export function sampleEdgeRegions(frame: NdiFrame, regionCount = NDI_REGION_COUNT): NdiRegionColour[] {
  const { xres: w, yres: h, lineStrideBytes, data } = frame
  const band = NDI_EDGE_BAND
  const regions: NdiRegionColour[] = []
  for (let i = 0; i < regionCount; i++) {
    const s0 = (i / regionCount) * 4
    const s1 = ((i + 1) / regionCount) * 4
    // The band rectangle for this region's stretch of the perimeter.
    // A stretch inside one edge samples that edge's band; one straddling
    // a corner (only when the count is not a multiple of 4) samples a
    // square around its anchor instead.
    let rect: { x: number; y: number; w: number; h: number }
    const edgeOf = (s: number) => (s < 1 ? 0 : s < 2 ? 1 : s < 3 ? 2 : 3)
    if (edgeOf(s0) === edgeOf(s1 - 1e-9)) {
      const edge = edgeOf(s0)
      const a = s0 - edge
      const b = s1 - edge
      if (edge === 0) rect = { x: a * w, y: 0, w: (b - a) * w, h: band * h }
      else if (edge === 1) rect = { x: (1 - band) * w, y: a * h, w: band * w, h: (b - a) * h }
      else if (edge === 2) rect = { x: (1 - b) * w, y: (1 - band) * h, w: (b - a) * w, h: band * h }
      else rect = { x: 0, y: (1 - b) * h, w: band * w, h: (b - a) * h }
    } else {
      const anchor = edgeRegionAnchors(regionCount)[i]
      const side = band * Math.min(w, h) * 2
      rect = { x: anchor.x * w - side / 2, y: anchor.y * h - side / 2, w: side, h: side }
    }
    const x0 = Math.max(0, Math.floor(rect.x))
    const y0 = Math.max(0, Math.floor(rect.y))
    const x1 = Math.min(w, Math.ceil(rect.x + rect.w))
    const y1 = Math.min(h, Math.ceil(rect.y + rect.h))
    // Step so each region samples at most ~200 pixels.
    const area = Math.max(1, (x1 - x0) * (y1 - y0))
    const step = Math.max(1, Math.floor(Math.sqrt(area / 200)))
    let sampled = 0
    let usable = 0
    let bestSat = -1
    let best: NdiRgb | null = null
    for (let y = y0; y < y1; y += step) {
      const row = y * lineStrideBytes
      for (let x = x0; x < x1; x += step) {
        const idx = row + x * 4
        if (idx + 3 >= data.length) continue
        sampled++
        const b = data[idx]
        const g = data[idx + 1]
        const r = data[idx + 2]
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max < NDI_NEAR_BLACK_MAX || min > NDI_NEAR_WHITE_MIN) continue
        usable++
        const sat = max === 0 ? 0 : (max - min) / max
        if (sat > bestSat) {
          bestSat = sat
          best = { r, g, b }
        }
      }
    }
    regions.push({ index: i, rgb: best, usableShare: sampled ? usable / sampled : 0 })
  }
  return regions
}

/** The placed screen: centre (x, y) and size in Preview coordinates. */
export interface NdiScreenRect { x: number; y: number; width: number; height: number }

/** Default screen size on the Preview (16:9 in Preview units). */
export const DEFAULT_SCREEN_WIDTH = 320
export const DEFAULT_SCREEN_HEIGHT = 180

/** The screen object of a show, if one has been placed on the Preview. */
export function findNdiScreen(stageObjects?: StageObject[]): StageObject | undefined {
  return stageObjects?.find((o) => o.kind === 'screen')
}

export function screenRect(screen: StageObject): NdiScreenRect {
  return { x: screen.x, y: screen.y, width: screen.width, height: screen.height }
}

/**
 * Preview-space anchors of the screen's edge regions: the unit-frame
 * anchors stretched onto the placed screen rectangle. Region i of the
 * frame and region i of the screen are the same region.
 */
export function screenRegionAnchors(screen: NdiScreenRect, count = NDI_REGION_COUNT): Array<{ x: number; y: number }> {
  return edgeRegionAnchors(count).map((a) => ({
    x: screen.x + (a.x - 0.5) * screen.width,
    y: screen.y + (a.y - 0.5) * screen.height
  }))
}

/**
 * Map each fixture to the edge region nearest to it in the Preview:
 * the fixture takes the colour of the screen edge nearest to it. Only
 * fixtures with a resolved Preview position are mapped — the caller
 * resolves stored positions with the demo-arc fallback, the same
 * positions the Preview itself shows. Returns fixture id → region index.
 */
export function mapRegionsToFixtures(
  anchors: Array<{ x: number; y: number }>,
  fixtures: Array<{ id: string; x: number; y: number }>
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const fixture of fixtures) {
    let best = -1
    let bestDist = Infinity
    anchors.forEach((anchor, i) => {
      const d = (anchor.x - fixture.x) ** 2 + (anchor.y - fixture.y) ** 2
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    if (best >= 0) out[fixture.id] = best
  }
  return out
}

/** A fixture's colour capability, from its channel map keys. */
export function fixtureColourKinds(channelAttrs: string[]): { hasRgb: boolean; hasCmy: boolean } {
  const has = (base: string) =>
    channelAttrs.some((attr) => new RegExp(`^${base}\\s*\\d*$`, 'i').test(attr.trim()))
  return { hasRgb: has('red') && has('green') && has('blue'), hasCmy: has('cyan') && has('magenta') && has('yellow') }
}

export function rgbHex(rgb: NdiRgb | null): string | null {
  return rgb ? hexOf(rgb) : null
}
