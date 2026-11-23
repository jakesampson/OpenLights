/**
 * NDI Ambience — HyperHDR-style ambient lighting from an NDI video feed
 * (Jake, 23 Nov 2026). The feed's screen is a draggable object on the
 * Preview; the edges of the placed screen map to the nearest lights, so
 * each part of the room follows the edge of the screen nearest to it —
 * not one colour for the whole rig. NDI latency is fine: this is ambient,
 * not beat-synced, so regions are sampled about five times a second.
 *
 * Pure logic only — no Node, Electron or DOM imports — so the sampling
 * can run in the NDI worker, the mapping in the renderer, and both in
 * unit tests. The worker posts small per-region colour sets about five
 * times a second; the frame itself never leaves the worker.
 *
 * Sampling is HyperHDR-style (Jake, 23 Nov 2026 — "take the brightest
 * colors from frames, not the average"): each region reports the
 * root-mean-square mean of its sample points, per channel, with the
 * outer half of the band weighted 3/4 against the inner half's 1/4
 * (HyperHDR's "advanced weighted" mode). Bright pixels count far more
 * than dark ones under RMS, so a small bright accent in a dark region
 * survives instead of washing out to grey — and a white slide reads as
 * white, a black frame as dark. A region that is genuinely black still
 * reports no colour, so the renderer holds its previous colour.
 */
import type { StageObject } from './types'

/** Edge regions around the frame perimeter. 8 = two per edge. */
export const NDI_REGION_COUNT = 8
/** How far into the frame the top and bottom edge bands reach
 * (fraction of the frame height). 50%, not 30% (Jake, 23 Nov 2026):
 * the outer edge of a worship screen is often dark, and a 30% band
 * can still come back dark with nothing usable in it — at 50% the
 * top and bottom bands meet in the middle, so the whole frame height
 * is covered and a region always reaches the slide content. */
export const NDI_EDGE_BAND_VERTICAL = 0.5
/** How far into the frame the left and right edge bands reach
 * (fraction of the frame width). Stays at 12% — Jake specified top
 * and bottom only. */
export const NDI_EDGE_BAND_HORIZONTAL = 0.12
/** Edge weighting for the RMS sample (HyperHDR's "advanced weighted"
 * mode): each region is split in half along its band depth, and the
 * outer half — the part nearest the screen edge — carries 3/4 of the
 * weight against the inner half's 1/4. With equal sample counts per
 * half, per-point weights 3 and 1 give exactly that. */
export const NDI_EDGE_WEIGHT_OUTER = 3
export const NDI_EDGE_WEIGHT_INNER = 1
/** A region whose RMS brightness (brightest channel) is under this
 * counts as genuinely black — it reports no colour, so the renderer
 * holds its previous colour instead of jumping its fixtures to dark.
 * There is deliberately no near-white skip any more: under RMS a white
 * slide reads as white, which is exactly the light it should drive
 * (the old most-saturated rule skipped white pixels, so white slides
 * left the rig blank). */
export const NDI_NEAR_BLACK_MAX = 32
/** How long with zero frames before the session counts as stalled — a
 * connection that never delivers is otherwise indistinguishable from
 * a working one, and the panel would claim to be "driving" with no
 * colours at all (Mac, 23 Nov 2026: the feed's advertised address was
 * a Tailscale address the Mac could not reach, so video() timed out
 * forever and nothing ever surfaced it). */
export const NDI_STALL_WARN_MS = 10_000

export interface NdiRgb { r: number; g: number; b: number }
export interface NdiSourceInfo { name: string; urlAddress?: string }

/**
 * Receive health, reported by the NDI worker every 2 s while a session
 * is running — even when no frames arrive, so a stalled receiver is
 * visible instead of silently "driving". `connections` is how many
 * connections the receiver holds to the sender (0 when the video
 * connection never established); `framesReceived` counts frames the
 * worker actually got; `lastFrameAt` is when the last one arrived.
 */
export interface NdiReceiveHealth {
  framesReceived: number
  connections: number
  lastFrameAt: number | null
  startedAt: number
}
export interface NdiRegionColour {
  index: number
  /** RMS colour of the region (see sampleEdgeRegions), or null when the
   * region is genuinely black — the caller holds the region's previous
   * colour instead of jumping to dark. */
  rgb: NdiRgb | null
  /** Share of sampled pixels in the region that carry light (brightest
   * channel at or above the near-black threshold). */
  usableShare: number
}

/** A BGRA video frame, as grandi's receiver returns it. */
export interface NdiFrame {
  xres: number
  yres: number
  lineStrideBytes: number
  data: Uint8Array
}

/** Live video preview on the Screen (Jake, 23 Nov 2026): the worker
 * downscales each sampled frame to a small thumbnail — 360p at most
 * (Jake: 480p or even 360p is fine) — and main JPEG-encodes it for the
 * renderer. Full frames never leave the worker. */
export const NDI_THUMBNAIL_MAX_WIDTH = 640
export const NDI_THUMBNAIL_MAX_HEIGHT = 360

/** A downscaled frame in BGRA byte order, ready for
 * `nativeImage.createFromBitmap` in the main process — Electron's
 * bitmap format is the `toBitmap()` format (BGRA on this platform),
 * i.e. the same order the NDI frame arrives in, so no channel
 * swapping is needed (and swapping it is exactly what would turn a
 * red feed blue on the Screen). */
export interface NdiThumbnail {
  width: number
  height: number
  data: Uint8Array
}

/**
 * Downscale a BGRA frame to a thumbnail, preserving aspect ratio and
 * never upscaling. Nearest-neighbour: at the usual 2x step (1280x720 →
 * 640x360) that is every second pixel, and a preview needs no more.
 * Bytes stay BGRA (grandi hands us BGRA; Electron's createFromBitmap
 * wants BGRA). Respects lineStrideBytes — the stride can be wider
 * than the row.
 */
export function downscaleFrame(
  frame: NdiFrame,
  maxWidth = NDI_THUMBNAIL_MAX_WIDTH,
  maxHeight = NDI_THUMBNAIL_MAX_HEIGHT
): NdiThumbnail {
  const { xres: w, yres: h, lineStrideBytes, data } = frame
  if (w <= 0 || h <= 0) return { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]) }
  const scale = Math.min(1, maxWidth / w, maxHeight / h)
  const outW = Math.max(1, Math.round(w * scale))
  const outH = Math.max(1, Math.round(h * scale))
  const out = new Uint8Array(outW * outH * 4)
  for (let y = 0; y < outH; y++) {
    const srcY = Math.min(h - 1, Math.floor(y / scale))
    const row = srcY * lineStrideBytes
    for (let x = 0; x < outW; x++) {
      const srcX = Math.min(w - 1, Math.floor(x / scale))
      const src = row + srcX * 4
      const dst = (y * outW + x) * 4
      out[dst] = data[src] // B
      out[dst + 1] = data[src + 1] // G
      out[dst + 2] = data[src + 2] // R
      out[dst + 3] = 255
    }
  }
  return { width: outW, height: outH, data: out }
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
 * samples its edge band over its stretch of the perimeter — the top and
 * bottom bands reach 50% into the frame, the side bands 12% — and
 * reports the root-mean-square mean of its sample points, per channel,
 * with the outer half of the band weighted 3/4 against the inner
 * half's 1/4 (HyperHDR's "advanced weighted" mode). Squaring the
 * channels before averaging means bright pixels count far more than
 * dark ones: a dark region with a little bright orange reads orange,
 * not grey, and a white slide reads white. A region that is genuinely
 * black reports rgb null.
 */
export function sampleEdgeRegions(frame: NdiFrame, regionCount = NDI_REGION_COUNT): NdiRegionColour[] {
  const { xres: w, yres: h, lineStrideBytes, data } = frame
  // Top/bottom bands reach 50% into the frame vertically; side bands
  // 12% horizontally (Jake, 23 Nov 2026 — worship-screen edges are
  // often dark, so the top/bottom bands sample deep enough to reach
  // the slide content).
  const bandV = NDI_EDGE_BAND_VERTICAL
  const bandH = NDI_EDGE_BAND_HORIZONTAL
  const regions: NdiRegionColour[] = []
  for (let i = 0; i < regionCount; i++) {
    const s0 = (i / regionCount) * 4
    const s1 = ((i + 1) / regionCount) * 4
    // The band rectangle for this region's stretch of the perimeter,
    // plus which way is "out" along the band depth (toward the screen
    // edge) and where the outer half ends — the weighting split.
    // A stretch inside one edge samples that edge's band; one straddling
    // a corner (only when the count is not a multiple of 4) samples a
    // square around its anchor instead.
    let rect: { x: number; y: number; w: number; h: number }
    let depthAxis: 'x' | 'y'
    let outerLow: boolean
    let outerLimit: number
    const edgeOf = (s: number) => (s < 1 ? 0 : s < 2 ? 1 : s < 3 ? 2 : 3)
    if (edgeOf(s0) === edgeOf(s1 - 1e-9)) {
      const edge = edgeOf(s0)
      const a = s0 - edge
      const b = s1 - edge
      if (edge === 0) {
        rect = { x: a * w, y: 0, w: (b - a) * w, h: bandV * h }
        depthAxis = 'y'
        outerLow = true
        outerLimit = (bandV / 2) * h
      } else if (edge === 1) {
        rect = { x: (1 - bandH) * w, y: a * h, w: bandH * w, h: (b - a) * h }
        depthAxis = 'x'
        outerLow = false
        outerLimit = (1 - bandH / 2) * w
      } else if (edge === 2) {
        rect = { x: (1 - b) * w, y: (1 - bandV) * h, w: (b - a) * w, h: bandV * h }
        depthAxis = 'y'
        outerLow = false
        outerLimit = (1 - bandV / 2) * h
      } else {
        rect = { x: 0, y: (1 - b) * h, w: bandH * w, h: (b - a) * h }
        depthAxis = 'x'
        outerLow = true
        outerLimit = (bandH / 2) * w
      }
    } else {
      const anchor = edgeRegionAnchors(regionCount)[i]
      // Corner-straddling stretch (only when the count is not a multiple
      // of 4): square around the anchor, sized by the band of its edge.
      const onTopOrBottom = anchor.y === 0 || anchor.y === 1
      const side = (onTopOrBottom ? bandV : bandH) * Math.min(w, h) * 2
      rect = { x: anchor.x * w - side / 2, y: anchor.y * h - side / 2, w: side, h: side }
      depthAxis = onTopOrBottom ? 'y' : 'x'
      outerLow = onTopOrBottom ? anchor.y === 0 : anchor.x === 0
      outerLimit = onTopOrBottom ? anchor.y * h : anchor.x * w
    }
    const x0 = Math.max(0, Math.floor(rect.x))
    const y0 = Math.max(0, Math.floor(rect.y))
    const x1 = Math.min(w, Math.ceil(rect.x + rect.w))
    const y1 = Math.min(h, Math.ceil(rect.y + rect.h))
    // Step so each region samples at most ~200 pixels.
    const area = Math.max(1, (x1 - x0) * (y1 - y0))
    const step = Math.max(1, Math.floor(Math.sqrt(area / 200)))
    let sampled = 0
    let lit = 0
    let weightSum = 0
    let sumSqR = 0
    let sumSqG = 0
    let sumSqB = 0
    for (let y = y0; y < y1; y += step) {
      const row = y * lineStrideBytes
      for (let x = x0; x < x1; x += step) {
        const idx = row + x * 4
        if (idx + 3 >= data.length) continue
        sampled++
        const b = data[idx]
        const g = data[idx + 1]
        const r = data[idx + 2]
        if (Math.max(r, g, b) >= NDI_NEAR_BLACK_MAX) lit++
        const depth = depthAxis === 'y' ? y : x
        const outer = outerLow ? depth < outerLimit : depth >= outerLimit
        const weight = outer ? NDI_EDGE_WEIGHT_OUTER : NDI_EDGE_WEIGHT_INNER
        weightSum += weight
        sumSqR += weight * r * r
        sumSqG += weight * g * g
        sumSqB += weight * b * b
      }
    }
    let rgb: NdiRgb | null = null
    if (sampled > 0 && weightSum > 0) {
      const rms = {
        r: Math.round(Math.sqrt(sumSqR / weightSum)),
        g: Math.round(Math.sqrt(sumSqG / weightSum)),
        b: Math.round(Math.sqrt(sumSqB / weightSum))
      }
      // Genuinely black: hold the previous colour (see the renderer),
      // don't jump the fixtures to dark.
      if (Math.max(rms.r, rms.g, rms.b) >= NDI_NEAR_BLACK_MAX) rgb = rms
    }
    regions.push({ index: i, rgb, usableShare: sampled ? lit / sampled : 0 })
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
