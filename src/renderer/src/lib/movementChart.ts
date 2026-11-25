import type { MovementPathDef } from '@shared/types'
import type { MovementPoint } from './movementEffects'
import { pathPointAt } from './movementRuntime'

/**
 * Polar mapping for LightKey's Position HUD (Guide ch.10, pp.167-169) and
 * for the movement-path tiles. Angle around the circle is PAN — 0° at
 * the bottom, +90° at the right, ±180° at the top, −90° at the left
 * (the same convention as the Rotation dial in CalibrationDialog,
 * `polarRotation`) — and radius from the centre is |TILT|. Path points
 * are normalized pan/tilt in −1..1, so a point's pan angle is pan × 180°
 * and its radius is |tilt| × the chart radius.
 *
 * The sign of tilt is NOT encoded in the screen position: (pan, +tilt)
 * and (pan, −tilt) draw at the same point. It is carried by the drag
 * state instead — dragging without Command keeps the point's existing
 * tilt sign, and a Command-drag flips it when the pointer crosses the
 * centre (Guide p.169: "Hold down Command and drag a point beyond the
 * center to move it to a negative tilt angle"). See
 * `chartOffsetToNormalized` and `cmdDragTiltSign`.
 */

/** Screen offset from the chart centre for a normalized path point. */
export function normalizedToChartOffset(
  pan: number,
  tilt: number,
  radius: number
): { x: number; y: number } {
  const angle = pan * Math.PI
  const r = Math.abs(tilt) * radius
  return { x: r * Math.sin(angle), y: r * Math.cos(angle) }
}

/** Normalized {pan, tilt} for a screen offset from the chart centre.
 *  `tiltSign` (+1 or −1) is the tilt sign carried by the drag — sticky
 *  per drag, see `cmdDragTiltSign`. Radius clamps to the chart rim. */
export function chartOffsetToNormalized(
  dx: number,
  dy: number,
  radius: number,
  tiltSign: number
): { pan: number; tilt: number } {
  const r = Math.min(1, Math.hypot(dx, dy) / radius)
  // atan2(dx, dy): 0 at the bottom, +90° at the right, ±180° at the top.
  const pan = ((Math.atan2(dx, dy) * 180) / Math.PI / 180)
  return { pan: Math.max(-1, Math.min(1, pan)), tilt: (tiltSign < 0 ? -1 : 1) * r }
}

/** Tilt-sign state for a Command-drag across the centre. `radiusFraction`
 *  is the pointer's distance from the centre as a fraction of the chart
 *  radius. The sign flips once, when the pointer has passed through the
 *  centre (radius dips near zero, arming the flip) and come out the
 *  other side. */
export function cmdDragTiltSign(
  state: { sign: number; armed: boolean },
  radiusFraction: number
): { sign: number; armed: boolean } {
  if (radiusFraction < 0.08) return { ...state, armed: true }
  if (state.armed && radiusFraction > 0.2) return { sign: -state.sign, armed: false }
  return state
}

/** Pan/tilt degrees for display, LightKey's signed form (e.g. −113.5°). */
export function formatPanTiltDegrees(value: number): string {
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}°`
}

/** Sample the drawn path with the same interpolation the runtime uses
 *  (`pathPointAt`), so the live dot sits on the drawn curve. A 'points'
 *  path has no connection lines, so it samples to its control points. */
export function samplePathPoints(
  points: MovementPoint[],
  type: MovementPathDef['type'],
  count = 64
): MovementPoint[] {
  if (points.length < 2) return [...points]
  if (type === 'points') return [...points]
  return Array.from({ length: count }, (_, i) => pathPointAt(points, type, i / count))
}

/** The connection-line segment whose midpoint is nearest a chart
 *  position, for the add-point-on-line rule (Guide p.169: "move the
 *  pointer over a connection line and click the transparent handle which
 *  appears between the points"). Returns the segment's start index and
 *  the midpoint's normalized coordinates, or null when no midpoint is
 *  within `threshold` chart units. Only for paths with connection lines
 *  ('smooth'/'line'); a 'points' path has none. */
export function nearestSegmentMidpoint(
  points: MovementPoint[],
  type: MovementPathDef['type'],
  dx: number,
  dy: number,
  radius: number,
  threshold: number
): { index: number; point: MovementPoint } | null {
  if (type === 'points' || points.length < 2) return null
  const n = points.length
  let best: { index: number; point: MovementPoint } | null = null
  let bestDistance = Infinity
  for (let i = 0; i < n; i++) {
    const mid = pathPointAt(points, type, (i + 0.5) / n)
    const at = normalizedToChartOffset(mid.pan, mid.tilt, radius)
    const distance = Math.hypot(at.x - dx, at.y - dy)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { index: i, point: mid }
    }
  }
  return best !== null && bestDistance <= threshold ? best : null
}
