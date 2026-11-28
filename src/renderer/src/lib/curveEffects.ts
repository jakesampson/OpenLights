import { fixtureBeams, fixtureChannelMap } from '@shared/fixtureProfiles'
import type { CurveComponent, CurveControlPoint, EffectDef, FixtureDef } from '@shared/types'
import { scaleAttribute } from './automationRuntime'
import {
  effectDurationSeconds,
  orderedEffectPixels,
  waveformValue,
  writeColourDimmer,
  writeEffectChannel,
  writeVirtualDimmer,
  type EffectPatchOptions,
  type EffectPixel
} from './effects'

/**
 * Drawable curve effects (LightKey Guide ch.10, pp.161-164). A curve is a set of control
 * points; the segments between them are straight lines or curves. Each component of a
 * multi-component property (Color, Position) has its own curve.
 *
 * Straight segments interpolate linearly — that is the guide's "straight line".
 * Curved segments use Catmull-Rom interpolation through the neighbouring points.
 * The guide does not specify the smoothing math, so this is flagged as an
 * interpretation to confirm against LightKey (see the chapter-10 notes).
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Value of a curve at time t (0..1 across the effect duration). */
export function evaluateCurve(
  points: CurveControlPoint[],
  curvedSegments: boolean[],
  t: number
): number {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return clamp01(sorted[0].y)
  const clampedT = clamp01(t)
  if (clampedT <= sorted[0].x) return clamp01(sorted[0].y)
  if (clampedT >= sorted[sorted.length - 1].x) return clamp01(sorted[sorted.length - 1].y)
  let i = 0
  while (i < sorted.length - 2 && clampedT > sorted[i + 1].x) i++
  const a = sorted[i]
  const b = sorted[i + 1]
  const span = b.x - a.x
  const u = span > 0 ? (clampedT - a.x) / span : 0
  if (!curvedSegments[i]) return clamp01(a.y + (b.y - a.y) * u)
  // Catmull-Rom through the neighbouring points (ends clamp to the edge points).
  const p0 = sorted[Math.max(0, i - 1)]
  const p3 = sorted[Math.min(sorted.length - 1, i + 2)]
  const u2 = u * u
  const u3 = u2 * u
  const value =
    0.5 *
    (2 * a.y +
      (-p0.y + b.y) * u +
      (2 * p0.y - 5 * a.y + 4 * b.y - p3.y) * u2 +
      (-p0.y + 3 * a.y - 3 * b.y + p3.y) * u3)
  return clamp01(value)
}

/** Built-in curve templates (Guide p.161): sample a waveform into control points. */
export function waveformPoints(
  waveform: EffectDef['waveform'],
  count = 9
): CurveControlPoint[] {
  const points: CurveControlPoint[] = []
  for (let i = 0; i < count; i++) {
    const x = count <= 1 ? 0 : i / (count - 1)
    const value = waveformValue(waveform, x, 0)
    points.push({ id: `point-${i}`, x, y: (value + 1) / 2 })
  }
  return points
}

/** Default two-point curve: a flat line at the middle (a fresh custom curve). */
export function defaultCurvePoints(): CurveControlPoint[] {
  return [
    { id: 'point-0', x: 0, y: 0.5 },
    { id: 'point-1', x: 1, y: 0.5 }
  ]
}

export interface Hsv { h: number; s: number; v: number }
export interface Rgb { r: number; g: number; b: number }

/** Standard HSV (h 0-360, s/v 0-1) to RGB (0-255). */
export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/** Components of a Color curve effect for a color model (Guide p.161). */
export function colorModelComponents(colorModel: 'hsb' | 'rgb' | 'cmy'): string[] {
  if (colorModel === 'hsb') return ['hue', 'saturation', 'brightness']
  if (colorModel === 'cmy') return ['cyan', 'magenta', 'yellow']
  return ['red', 'green', 'blue']
}

/** Extra color components a fixture supports (Guide p.146, p.161): cool white, warm white,
 *  amber, lime, ultraviolet — as channel attributes when present. Built-in
 *  profiles spell white 'white' and ultraviolet 'uv'. */
export function extraColorComponents(fixture: FixtureDef): string[] {
  const map = fixtureChannelMap(fixture)
  const candidates: [string, string][] = [
    ['cool white', 'cool white'],
    ['warm white', 'warm white'],
    ['white', 'white'],
    ['amber', 'amber'],
    ['lime', 'lime'],
    ['ultraviolet', 'uv']
  ]
  return candidates.filter(([, attr]) => map[attr] !== undefined).map(([name]) => name)
}

/** Channel attribute a colour-component curve writes (Guide p.146: the
 *  extra components are cool white, warm white, amber, lime, ultraviolet —
 *  the built-in profiles spell ultraviolet 'uv'). */
function colorComponentAttribute(component: string): string {
  return component === 'ultraviolet' ? 'uv' : component
}

function writePixelChannel(
  into: Record<number, number>,
  pixel: EffectPixel,
  value: number,
  effect: EffectDef,
  master: number,
  options: EffectPatchOptions = {}
): void {
  const { fixture, attribute } = pixel
  const map = fixtureChannelMap(fixture)
  const channelOffset = map[attribute]
  // No dimmer channel (LightKey virtual dimmer, Piece 12): the level
  // scales the fixture's LED channels instead — there is no channel
  // of its own to write.
  if (channelOffset === undefined) {
    if (attribute === 'intensity') writeVirtualDimmer(into, fixture, value, effect, master, options.baseValues)
    return
  }
  const channel = fixture.channelStart + channelOffset
  let next = scaleAttribute(attribute, value, fixture.ignoreMasterDimmer ? 255 : master)
  const base = options.base
  if (effect.relative && base !== undefined && base[channel] !== undefined) {
    // Relative (Guide pp.164-166): the curve's values are added to the values
    // defined elsewhere. The curve's midpoint (0.5) adds nothing.
    next = Math.max(0, Math.min(255, base[channel] + (value - 127.5)))
  }
  writeEffectChannel(into, channel, next, effect.blendMode)
}

/**
 * Write a drawable curve effect's channels at a moment in time.
 * Guide ch.10, pp.161-164. `into` receives the patch (blend modes honoured).
 */
export function computeDrawableCurvePatch(
  fixtures: FixtureDef[],
  effect: EffectDef,
  timeSeconds: number,
  bpm: number,
  master = 255,
  options: EffectPatchOptions = {},
  into: Record<number, number> = {}
): Record<number, number> {
  const components = effect.curveComponents ?? []
  if (components.length === 0) return into
  const duration = effectDurationSeconds(effect, bpm) ?? 1
  const timeOffset = (effect.timeOffset ?? 0) / 100

  // Mirror (Guide pp.164-166): with the From Center fixture order, pan and/or tilt
  // angles on one side of the center are reversed in sign. "One side" is read as
  // the fixtures on the left/top half of the Preview span.
  const mirror = effect.fixtureOrderOrigin === 'from-center' && (effect.mirrorPan || effect.mirrorTilt)
  const xs = fixtures.map((f) => f.previewPosition?.x ?? f.previewPositions?.[0]?.x ?? 0)
  const ys = fixtures.map((f) => f.previewPosition?.y ?? f.previewPositions?.[0]?.y ?? 0)
  const midX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
  const midY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0

  const localT = (pixel: EffectPixel) => {
    // Guide p.154 / pp.163-164: each pixel changes LATER than the preceding
    // one — the offset is subtracted, so a later pixel trails (runs behind).
    const t = timeSeconds - pixel.phaseIndex * timeOffset * duration
    return ((t / duration) % 1 + 1) % 1
  }

  const applyMirror = (pixel: EffectPixel, component: string, value01: number): number => {
    if (!mirror) return value01
    const pos = pixel.fixture.previewPosition ?? pixel.fixture.previewPositions?.[0] ?? { x: 0, y: 0 }
    if (effect.mirrorPan && component === 'pan' && pos.x < midX) return 1 - value01
    if (effect.mirrorTilt && component === 'tilt' && pos.y < midY) return 1 - value01
    return value01
  }

  const byComponent = new Map(components.map((c) => [c.component, c]))
  const isColor = effect.attribute === 'color'
  const isPosition = effect.attribute === 'position'

  /** Same beam as `pixel`, resolved for another base attribute (e.g. 'green'). */
  const siblingPixel = (pixel: EffectPixel, attribute: string): EffectPixel => {
    if (!pixel.beamId) return { ...pixel, attribute }
    const beam = fixtureBeams(pixel.fixture).find((b) => b.id === pixel.beamId)
    const resolved = beam?.properties[attribute]
    return resolved !== undefined ? { ...pixel, attribute: resolved } : { ...pixel, attribute }
  }

  if (isColor) {
    // Colour effects also open the dimmer (writeColourDimmer): the
    // peak colour written to each fixture, so a fixture with a
    // physical dimmer lights exactly when the effect lights it.
    const colourPeaks = new Map<string, number>()
    const notePeak = (fixtureId: string, value: number) => {
      colourPeaks.set(fixtureId, Math.max(colourPeaks.get(fixtureId) ?? 0, value))
    }
    const flushColourDimmer = () => {
      for (const fixture of fixtures) writeColourDimmer(into, fixture, colourPeaks.get(fixture.id) ?? 0, effect, master)
    }
    // Color: one curve per color-model component; HSB converts to RGB.
    const model = effect.colorModel ?? 'rgb'
    if (model === 'hsb') {
      const hue = byComponent.get('hue')
      const saturation = byComponent.get('saturation')
      const brightness = byComponent.get('brightness')
      const pixels = orderedEffectPixels(effect, fixtures, 'red', options.activationSeed ?? 0)
      pixels.forEach((pixel) => {
        if (pixel.fixture.disabled) return
        const t = localT(pixel)
        const h = hue ? evaluateCurve(hue.points, hue.curvedSegments, t) * 360 : 0
        const s = saturation ? evaluateCurve(saturation.points, saturation.curvedSegments, t) : 1
        const v = brightness ? evaluateCurve(brightness.points, brightness.curvedSegments, t) : 1
        const { r, g, b } = hsvToRgb({ h, s, v })
        notePeak(pixel.fixture.id, Math.max(r, g, b))
        writePixelChannel(into, pixel, r, effect, master, options)
        writePixelChannel(into, siblingPixel(pixel, 'green'), g, effect, master, options)
        writePixelChannel(into, siblingPixel(pixel, 'blue'), b, effect, master, options)
      })
      flushColourDimmer()
      return into
    }
    // RGB / CMY: each component writes its own channel.
    for (const component of colorModelComponents(model)) {
      const curve = byComponent.get(component)
      if (!curve) continue
      const pixels = orderedEffectPixels(effect, fixtures, component, options.activationSeed ?? 0)
      pixels.forEach((pixel) => {
        if (pixel.fixture.disabled) return
        const value = evaluateCurve(curve.points, curve.curvedSegments, localT(pixel)) * 255
        notePeak(pixel.fixture.id, value)
        writePixelChannel(into, pixel, value, effect, master, options)
      })
    }
    // Extra components (cool white, warm white, white, amber, lime, ultraviolet).
    for (const component of ['cool white', 'warm white', 'white', 'amber', 'lime', 'ultraviolet']) {
      const curve = byComponent.get(component)
      if (!curve) continue
      const pixels = orderedEffectPixels(effect, fixtures, colorComponentAttribute(component), options.activationSeed ?? 0)
      pixels.forEach((pixel) => {
        if (pixel.fixture.disabled) return
        const value = evaluateCurve(curve.points, curve.curvedSegments, localT(pixel)) * 255
        notePeak(pixel.fixture.id, value)
        writePixelChannel(into, pixel, value, effect, master, options)
      })
    }
    flushColourDimmer()
    return into
  }

  if (isPosition) {
    for (const component of ['pan', 'tilt'] as const) {
      const curve = byComponent.get(component)
      if (!curve) continue
      const pixels = orderedEffectPixels(effect, fixtures, component, options.activationSeed ?? 0)
      pixels.forEach((pixel) => {
        if (pixel.fixture.disabled) return
        const raw = evaluateCurve(curve.points, curve.curvedSegments, localT(pixel))
        const value = applyMirror(pixel, component, raw) * 255
        writePixelChannel(into, pixel, value, effect, master, options)
      })
    }
    return into
  }

  // Single-component properties (Dimmer, Focus, Zoom, Iris, Frost, Fog, custom sliders).
  const curve = components[0]
  if (!curve) return into
  const pixels = orderedEffectPixels(effect, fixtures, effect.attribute, options.activationSeed ?? 0)
  pixels.forEach((pixel) => {
    if (pixel.fixture.disabled) return
    const value = evaluateCurve(curve.points, curve.curvedSegments, localT(pixel)) * 255
    writePixelChannel(into, pixel, value, effect, master, options)
  })
  return into
}
