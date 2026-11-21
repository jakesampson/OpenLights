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
 * Built-in paths are Circle, Figure Eight and Line. Path points are normalized
 * pan/tilt coordinates (-1..1); they map to DMX via the fixture's pan/tilt range
 * (Guide p.60, lib/calibration.ts).
 */

export const BUILTIN_MOVEMENT_PATHS: { id: string; name: string }[] = [
  { id: 'builtin-circle', name: 'Circle' },
  { id: 'builtin-figure-eight', name: 'Figure Eight' },
  { id: 'builtin-line', name: 'Line' }
]

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
      const t = cycleOf((timeSeconds + pixel.phaseIndex * timeOffset * duration) / duration)
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
