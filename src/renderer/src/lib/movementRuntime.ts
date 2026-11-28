import { fixtureChannelMap } from '@shared/fixtureProfiles'
import type { EffectDef, FixtureDef, MovementPathDef } from '@shared/types'
import { degreesToChannel, panTiltRange } from './calibration'
import {
  effectDurationSeconds,
  orderedEffectPixels,
  writeEffectChannel,
  type EffectPatchOptions
} from './effects'
import { movementPoint, type MovementPoint } from './movementEffects'

/**
 * Movement effects (LightKey Guide ch.10, pp.165-171). A movement effect describes a
 * continuous pan and tilt movement along a predefined closed path. Paths are stored
 * independently of effects and can be reused; editing a built-in path duplicates it.
 *
 * Built-in paths are Circle, Figure Eight and Line (computed parametrically) plus
 * LightKey's named path templates from the effects chooser (Jake's screenshots,
 * 21 Nov 2026, 9.16.22 pm): Bow Tie, Flower, Half Flower 3/5, Pan Track,
 * Random Dots, Tilt Track 1/2, Triangle Small/Wide, Wedge Curved/Straight and
 * Zigzag 2/5. The named paths' exact geometry is not in the guide — the point
 * sets below approximate each name's shape, and are flagged to confirm against
 * LightKey — EXCEPT the Flower, which is re-derived from Jake's LightKey
 * recording (26 Nov 2026), see `flowerPoints`. Path points are normalized
 * pan/tilt coordinates (-1..1); they map to DMX via the fixture's pan/tilt
 * range (Guide p.60, lib/calibration.ts).
 */

export interface BuiltinMovementPath {
  id: string
  name: string
  /** Point-based built-ins (LightKey's named paths). The parametric ones
   *  (Circle, Figure Eight, Line) have no points — they are computed. */
  points?: MovementPoint[]
  type?: MovementPathDef['type']
}

/** Rose-curve points: `petals` lobes over θ in [0, span] (a full flower
 *  spans 2π; a half flower spans π, with the lobes kept in the upper half). */
function rosePoints(petals: number, span: number, count = 16): MovementPoint[] {
  const points: MovementPoint[] = []
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * span
    const r = Math.abs(Math.sin((petals * theta * Math.PI) / span))
    points.push({ pan: Math.cos(theta) * r * 0.8, tilt: Math.sin(theta) * r * 0.8 })
  }
  return points
}

/** LightKey's Flower, re-derived from Jake's LightKey recording
 *  (26 Nov 2026, PAN/TILT readout every 0.5 s over the full 10 s
 *  cycle): PAN completes ONE cycle and TILT completes TWO per period —
 *  a Lissajous with frequency ratio 1:2 — and the drawn path has 4
 *  lobes. Recorded extremes on a generic moving head at its default
 *  ranges (540° pan / 270° tilt, no limits applied): PAN ±57°, TILT
 *  ±89°, i.e. normalized amplitudes pan 57/270 = 0.211, tilt 89/135 =
 *  0.659 — asymmetric, NOT the 0.8 convention the other paths use.
 *  The least-squares fit over the 21 readout samples pins the phase
 *  difference at ≈0° (pan 1 cycle, amplitude 60.67°, phase −157.36°;
 *  tilt 2 cycles, amplitude 89.09°, phase +44.78°; RMS 3.11°/2.04°),
 *  so the curve is pan = Ap·sin(2πt), tilt = At·sin(4πt). Under the
 *  chart mapping (angle = pan, radius = signed tilt,
 *  lib/movementChart.ts) the tilt maxima land at chart angles ±40° /
 *  ±140°, matching the measured petal tips (+44.3°, +135.5°, −134.7°,
 *  −45.1°) within readout jitter. The old `rosePoints(2, 2π)` had the
 *  ratio swapped (pan 2 cycles, tilt 1) and collapsed to a single
 *  bottom lobe under the signed-radius mapping. */
const FLOWER_PAN_AMPLITUDE = 57 / 270
const FLOWER_TILT_AMPLITUDE = 89 / 135
function flowerPoints(count = 16): MovementPoint[] {
  const points: MovementPoint[] = []
  for (let i = 0; i < count; i++) {
    const t = i / count
    points.push({
      pan: FLOWER_PAN_AMPLITUDE * Math.sin(2 * Math.PI * t),
      tilt: FLOWER_TILT_AMPLITUDE * Math.sin(4 * Math.PI * t)
    })
  }
  return points
}

export const BUILTIN_MOVEMENT_PATHS: BuiltinMovementPath[] = [
  { id: 'builtin-circle', name: 'Circle' },
  { id: 'builtin-figure-eight', name: 'Figure Eight' },
  { id: 'builtin-line', name: 'Line' },
  {
    id: 'builtin-bow-tie', name: 'Bow Tie', type: 'smooth',
    points: [
      { pan: 0, tilt: 0 }, { pan: 0.8, tilt: 0.8 }, { pan: 0.8, tilt: -0.8 },
      { pan: 0, tilt: 0 }, { pan: -0.8, tilt: -0.8 }, { pan: -0.8, tilt: 0.8 },
      { pan: 0, tilt: 0 }
    ]
  },
  { id: 'builtin-flower', name: 'Flower', type: 'smooth', points: flowerPoints() },
  { id: 'builtin-half-flower-3', name: 'Half Flower 3', type: 'smooth', points: rosePoints(3, Math.PI) },
  { id: 'builtin-half-flower-5', name: 'Half Flower 5', type: 'smooth', points: rosePoints(5, Math.PI) },
  {
    id: 'builtin-pan-track', name: 'Pan Track', type: 'smooth',
    points: [{ pan: -0.8, tilt: -0.1 }, { pan: 0, tilt: 0.2 }, { pan: 0.8, tilt: -0.1 }]
  },
  {
    id: 'builtin-random-dots', name: 'Random Dots', type: 'points',
    points: [
      { pan: -0.6, tilt: 0.4 }, { pan: 0.3, tilt: -0.7 }, { pan: 0.8, tilt: 0.5 },
      { pan: -0.2, tilt: -0.3 }, { pan: 0.6, tilt: 0.1 }, { pan: -0.9, tilt: -0.6 },
      { pan: 0.1, tilt: 0.8 }, { pan: -0.4, tilt: 0.2 }
    ]
  },
  {
    id: 'builtin-tilt-track-1', name: 'Tilt Track 1', type: 'line',
    points: [{ pan: 0, tilt: -0.8 }, { pan: 0, tilt: 0.8 }]
  },
  {
    id: 'builtin-tilt-track-2', name: 'Tilt Track 2', type: 'smooth',
    points: [{ pan: 0, tilt: -0.8 }, { pan: 0.25, tilt: -0.3 }, { pan: -0.25, tilt: 0.3 }, { pan: 0, tilt: 0.8 }]
  },
  {
    id: 'builtin-triangle-small', name: 'Triangle Small', type: 'line',
    points: [{ pan: 0, tilt: 0.4 }, { pan: 0.4, tilt: -0.3 }, { pan: -0.4, tilt: -0.3 }]
  },
  {
    id: 'builtin-triangle-wide', name: 'Triangle Wide', type: 'line',
    points: [{ pan: 0, tilt: 0.4 }, { pan: 0.8, tilt: -0.3 }, { pan: -0.8, tilt: -0.3 }]
  },
  {
    id: 'builtin-wedge-curved', name: 'Wedge Curved', type: 'smooth',
    points: [{ pan: 0, tilt: 0.8 }, { pan: 0.7, tilt: -0.5 }, { pan: -0.7, tilt: -0.5 }]
  },
  {
    id: 'builtin-wedge-straight', name: 'Wedge Straight', type: 'line',
    points: [{ pan: 0, tilt: 0.8 }, { pan: 0.7, tilt: -0.5 }, { pan: -0.7, tilt: -0.5 }]
  },
  {
    id: 'builtin-zigzag-2', name: 'Zigzag 2', type: 'line',
    points: [
      { pan: -0.8, tilt: 0 }, { pan: -0.4, tilt: 0.6 }, { pan: 0, tilt: -0.6 },
      { pan: 0.4, tilt: 0.6 }, { pan: 0.8, tilt: 0 }
    ]
  },
  {
    id: 'builtin-zigzag-5', name: 'Zigzag 5', type: 'line',
    points: [
      { pan: -0.8, tilt: 0 }, { pan: -0.48, tilt: 0.6 }, { pan: -0.16, tilt: -0.6 },
      { pan: 0.16, tilt: 0.6 }, { pan: 0.48, tilt: -0.6 }, { pan: 0.8, tilt: 0 }
    ]
  }
]

/** Point set for a point-based built-in path, or null for the parametric
 *  ones (Circle, Figure Eight, Line) and unknown ids. */
export function builtinMovementPathPoints(id: string): { points: MovementPoint[]; type: MovementPathDef['type'] } | null {
  const found = BUILTIN_MOVEMENT_PATHS.find((p) => p.id === id && p.points)
  if (!found?.points) return null
  return { points: found.points, type: found.type ?? 'smooth' }
}

export function builtinMovementPathName(id: string): 'circle' | 'figure-eight' | 'line' | null {
  if (id === 'builtin-circle' || id === 'Circle') return 'circle'
  if (id === 'builtin-figure-eight' || id === 'Figure Eight') return 'figure-eight'
  if (id === 'builtin-line' || id === 'Line') return 'line'
  return null
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const cycleOf = (t: number) => ((t % 1) + 1) % 1

/** Point on a closed user path at cycle t (0..1), by path type (Guide p.170). */
export function pathPointAt(
  points: MovementPoint[],
  type: MovementPathDef['type'],
  t: number
): MovementPoint {
  const n = points.length
  if (n === 0) return { pan: 0, tilt: 0 }
  if (n === 1) return points[0]
  const c = cycleOf(t)
  if (type === 'points') {
    // Points: the fixture moves instantly from one control point to the next
    // and remains at each for an equal time.
    return points[Math.floor(c * n) % n]
  }
  const location = c * n
  const i = Math.floor(location) % n
  const u = location - Math.floor(location)
  const p1 = points[i]
  const p2 = points[(i + 1) % n]
  if (type === 'line') {
    return {
      pan: p1.pan + (p2.pan - p1.pan) * u,
      tilt: p1.tilt + (p2.tilt - p1.tilt) * u
    }
  }
  // Smooth: Catmull-Rom through the neighbouring points (closed loop).
  const p0 = points[(i - 1 + n) % n]
  const p3 = points[(i + 2) % n]
  const u2 = u * u
  const u3 = u2 * u
  const catmull = (a: number, b: number, c2: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c2) * u +
      (2 * a - 5 * b + 4 * c2 - d) * u2 +
      (-a + 3 * b - 3 * c2 + d) * u3)
  return {
    pan: catmull(p0.pan, p1.pan, p2.pan, p3.pan),
    tilt: catmull(p0.tilt, p1.tilt, p2.tilt, p3.tilt)
  }
}

export function resolveMovementPath(
  movementPathId: string,
  movementPaths: MovementPathDef[] = []
): { path: 'circle' | 'figure-eight' | 'line' | MovementPoint[]; type: MovementPathDef['type'] } | null {
  const builtin = builtinMovementPathName(movementPathId)
  if (builtin) return { path: builtin, type: builtin === 'line' ? 'line' : 'smooth' }
  const named = builtinMovementPathPoints(movementPathId)
  if (named) return { path: named.points, type: named.type }
  const user = movementPaths.find((p) => p.id === movementPathId)
  if (!user) return null
  return { path: user.points, type: user.type }
}

/**
 * Write a movement effect's pan/tilt channels at a moment in time.
 * Guide ch.10, pp.165-166. `into` receives the patch (blend modes honoured).
 */
export function computeMovementPatch(
  fixtures: FixtureDef[],
  effect: EffectDef,
  timeSeconds: number,
  bpm: number,
  master = 255,
  options: EffectPatchOptions = {},
  into: Record<number, number> = {}
): Record<number, number> {
  const resolved = effect.movementPathId
    ? resolveMovementPath(effect.movementPathId, options.movementPaths ?? [])
    : null
  if (!resolved) return into
  const duration = effectDurationSeconds(effect, bpm) ?? 1
  const timeOffset = (effect.timeOffset ?? 0) / 100
  const panPixels = orderedEffectPixels(effect, fixtures, 'pan', options.activationSeed ?? 0)
  const tiltPixels = orderedEffectPixels(effect, fixtures, 'tilt', options.activationSeed ?? 0)

  // Mirror (Guide pp.166-167): with the From Center fixture order, pan and/or tilt
  // angles on one side of the center are reversed in sign.
  const mirror = effect.fixtureOrderOrigin === 'from-center' && (effect.mirrorPan || effect.mirrorTilt)
  const xs = fixtures.map((f) => f.previewPosition?.x ?? f.previewPositions?.[0]?.x ?? 0)
  const ys = fixtures.map((f) => f.previewPosition?.y ?? f.previewPositions?.[0]?.y ?? 0)
  const midX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
  const midY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0

  const pointAt = (t: number): MovementPoint => {
    if (Array.isArray(resolved.path)) return pathPointAt(resolved.path, resolved.type, t)
    return movementPoint(resolved.path, t)
  }

  const write = (
    pixels: ReturnType<typeof orderedEffectPixels>,
    component: 'pan' | 'tilt',
    valueOf: (point: MovementPoint) => number
  ) => {
    pixels.forEach((pixel) => {
      if (pixel.fixture.disabled) return
      // Guide p.154: the offset is subtracted — each pixel runs behind the
      // preceding one, so the path is traced in fixture order, not against it.
      const t = cycleOf((timeSeconds - pixel.phaseIndex * timeOffset * duration) / duration)
      const point = pointAt(t)
      const { pan: panRange, tilt: tiltRange } = panTiltRange(pixel.fixture)
      const range = component === 'pan' ? panRange : tiltRange
      const offsetDegrees =
        (component === 'pan' ? effect.panOffset ?? 0 : effect.tiltOffset ?? 0) * pixel.phaseIndex
      const offsetDmx = (offsetDegrees / range) * 255
      let normalized = clamp01((valueOf(point) + 1) / 2)
      // Mirror: reflect the value around the center for fixtures on one side.
      if (mirror) {
        const pos = pixel.fixture.previewPosition ?? pixel.fixture.previewPositions?.[0] ?? { x: 0, y: 0 }
        if (component === 'pan' && effect.mirrorPan && pos.x < midX) normalized = 1 - normalized
        if (component === 'tilt' && effect.mirrorTilt && pos.y < midY) normalized = 1 - normalized
      }
      const absolute = normalized * 255 + offsetDmx
      const map = fixtureChannelMap(pixel.fixture)
      const channelOffset = map[pixel.attribute]
      if (channelOffset === undefined) return
      const channel = pixel.fixture.channelStart + channelOffset
      let next: number
      if (effect.relative && options.base !== undefined && options.base[channel] !== undefined) {
        // Relative (Guide p.166): the path values are added to the values from
        // cues with a lower priority. The path's center (0) adds nothing.
        const delta = (valueOf(point) * 255) / 2 + offsetDmx
        next = Math.max(0, Math.min(255, options.base[channel] + delta))
      } else {
        next = Math.max(0, Math.min(255, absolute))
      }
      // Pan/tilt are not scaled by the master (only LED channels are).
      writeEffectChannel(into, channel, next, effect.blendMode)
    })
  }

  write(panPixels, 'pan', (point) => point.pan)
  write(tiltPixels, 'tilt', (point) => point.tilt)
  return into
}

/** Degrees for a normalized path coordinate, for display (Guide p.167: pan and tilt
 *  angles for the current position). */
export function normalizedToDegrees(normalized: number, range: number): number {
  return normalized * (range / 2)
}

export { degreesToChannel }
