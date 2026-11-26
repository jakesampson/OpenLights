import type { MovementPathDef } from '@shared/types'
import type { MovementPoint } from './movementEffects'
import { pathPointAt } from './movementRuntime'

/**
 * Polar mapping for LightKey's Position HUD (Guide ch.10, pp.90-91,
 * 167-169, and Jake's LightKey recording, 26 Nov 2026) and for the
 * movement-path tiles. Angle around the circle IS the pan angle in
 * degrees — 0° at the bottom, +90° at the right, ±180° at the top,
 * −90° at the left — and radius from the centre is the SIGNED tilt:
 * a negative tilt flips the point through the centre, so (pan θ,
 * tilt −ρ) draws where (pan θ + 180°, tilt +ρ) would. That is the
 * guide's p.91 equivalence — (pan −60°, tilt +45°) and (pan +120°,
 * tilt −45°) are the same point — and it is confirmed by pixel
 * measurement of Jake's recording: the Flower's four tilt maxima
 * (pan ±43°/±48°, tilt ±89°) land at chart angles −43°, +132°,
 * +43°, −132° under this mapping, matching the measured petal tips
 * (+44.3°, +135.5°, −134.7°, −45.1°) within readout jitter, while a
 * radius = |tilt| mapping cannot produce the upper petals at all.
 * Path points are normalized pan/tilt in −1..1, so a point's pan angle
 * is pan × (panRange/2)° — normalized ±1 is the fixture's full pan
 * range (default 540°, so ±270°), NOT ±180°. A 540° head's pan wraps
 * one and a half times around the circle, so pan values a full turn
 * (360°) apart draw at the same point.
 *
 * The tilt sign IS encoded in the screen position, but ambiguously: a
 * chart position is two (pan, tilt) pairs at once — (pan α, tilt +ρ)
 * and (pan α + 180°, tilt −ρ). The sign is carried by the drag state
 * to pick the branch — dragging without Command keeps the point's
 * existing tilt sign, and a Command-drag flips it when the pointer
 * crosses the centre (Guide p.169: "Hold down Command and drag a
 * point beyond the center to move it to a negative tilt angle"). See
 * `chartOffsetToNormalized` and `cmdDragTiltSign`. The Design pad
 * (lib/position.ts) uses this same mapping, so the pad, the HUD and
 * the tile previews agree for the same pan/tilt.
 */

/** Screen offset from the chart centre for a normalized path point.
 *  `panRange` is the fixture's total pan range in degrees (default
 *  540°); the tile previews use the default. */
export function normalizedToChartOffset(
  pan: number,
  tilt: number,
  radius: number,
  panRange = 540
): { x: number; y: number } {
  const angle = (pan * (panRange / 2) * Math.PI) / 180
  return { x: radius * tilt * Math.sin(angle), y: radius * tilt * Math.cos(angle) }
}

/** Normalized {pan, tilt} for a screen offset from the chart centre.
 *  `tiltSign` (+1 or −1) is the tilt sign carried by the drag — sticky
 *  per drag, see `cmdDragTiltSign` — and picks which of the two
 *  (pan, tilt) pairs at this screen point is returned (Guide p.91).
 *  Pan comes back as the principal value in (−180°, 180°] normalized
 *  by the pan range; radius clamps to the chart rim. `nearPan` (the
 *  dragged point's current pan) picks the representative nearest it,
 *  so dragging a point with |pan| > 180° does not teleport it to the
 *  aliased reading a full turn away on the first move. */
export function chartOffsetToNormalized(
  dx: number,
  dy: number,
  radius: number,
  tiltSign: number,
  panRange = 540,
  nearPan?: number
): { pan: number; tilt: number } {
  const r = Math.min(1, Math.hypot(dx, dy) / radius)
  // atan2(dx, dy): 0 at the bottom, +90° at the right, ±180° at the top.
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI
  let panDegrees: number
  if (tiltSign < 0) {
    // Negative tilt is the same screen point with the pan angle
    // rotated by 180° (Guide p.91): a point at pan angle θ and tilt
    // −ρ draws where (θ + 180°, +ρ) would.
    panDegrees = (((angle + 180 + 180) % 360) + 360) % 360 - 180
  } else {
    panDegrees = angle
  }
  let pan = panDegrees / (panRange / 2)
  if (nearPan !== undefined) {
    // One full turn in normalized units; shift the reading by whole
    // turns until it is the representative nearest the point's
    // current pan.
    const turn = 360 / (panRange / 2)
    while (pan - nearPan > turn / 2) pan -= turn
    while (nearPan - pan > turn / 2) pan += turn
  }
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
  threshold: number,
  panRange = 540
): { index: number; point: MovementPoint } | null {
  if (type === 'points' || points.length < 2) return null
  const n = points.length
  let best: { index: number; point: MovementPoint } | null = null
  let bestDistance = Infinity
  for (let i = 0; i < n; i++) {
    const mid = pathPointAt(points, type, (i + 0.5) / n)
    const at = normalizedToChartOffset(mid.pan, mid.tilt, radius, panRange)
    const distance = Math.hypot(at.x - dx, at.y - dy)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { index: i, point: mid }
    }
  }
  return best !== null && bestDistance <= threshold ? best : null
}

/**
 * Overlay layout for the Position HUD (Jake's LightKey recording, 26 Nov
 * 2026 — Flower, frame at 7s, measured at the frame's real 1274×798):
 * the chart is a LARGE circle laid over the Preview, centred over the
 * fixture being edited, with the PAN/TILT readout in a dark panel
 * overlapping the chart's right edge. Measured: chart ≈315px across in
 * a 790×440 Preview — ~72% of the Preview height and ~40% of its width
 * — so the chart diameter is 72% of the Preview height, capped by the
 * width once the readout panel is accounted for. The chart is ALWAYS
 * full size and centred on the fixture (`anchor`): a fixture near an
 * edge puts part of the chart outside the host, and the Preview pans
 * to fit it (see `chartPanDelta`) — the chart never shrinks (Jake,
 * 26 Nov 2026: full-size chart, move the Preview so the fixture fits
 * on screen with the chart). Returns screen-pixel geometry for the
 * container (left/top/width/height) and the chart diameter; left/top
 * may be negative — that is the pan's job, not a layout failure.
 */
export const CHART_READOUT_PANEL_W = 160
export const CHART_READOUT_OVERLAP = 56

export function chartOverlayLayout(
  hostW: number,
  hostH: number,
  anchorX: number,
  anchorY: number
): { chartD: number; containerW: number; containerH: number; left: number; top: number } {
  const maxByWidth = hostW - (CHART_READOUT_PANEL_W - CHART_READOUT_OVERLAP) - 8
  const chartD = Math.max(120, Math.min(Math.floor(Math.min(hostH * 0.72, maxByWidth)), hostH))
  return {
    chartD, containerW: chartD + CHART_READOUT_PANEL_W - CHART_READOUT_OVERLAP, containerH: chartD,
    left: Math.round(anchorX - chartD / 2), top: Math.round(anchorY - chartD / 2)
  }
}

/** Screen-pixel margin kept between the chart container and the host
    edge when the Preview pans to fit the chart. */
export const CHART_PAN_MARGIN = 8

/**
 * Screen-pixel shift that brings the whole chart container inside the
 * host (the Preview overlay). The chart is always full-size and centred
 * on the fixture, so a fixture near an edge puts part of the container
 * outside the host — the Preview pans by this delta instead of the
 * chart shrinking. Positive dx moves the view's contents right on
 * screen, positive dy moves them down. Returns {dx: 0, dy: 0} when the
 * container already fits. The container always fits the host (its
 * width is capped by the host width and its height is ≤ 72% of the
 * host height), so a single shift always suffices — no zoom change.
 */
export function chartPanDelta(
  hostW: number,
  hostH: number,
  left: number,
  top: number,
  containerW: number,
  containerH: number
): { dx: number; dy: number } {
  let dx = 0
  if (left < CHART_PAN_MARGIN) dx = CHART_PAN_MARGIN - left
  else if (left + containerW > hostW - CHART_PAN_MARGIN) dx = hostW - CHART_PAN_MARGIN - (left + containerW)
  let dy = 0
  if (top < CHART_PAN_MARGIN) dy = CHART_PAN_MARGIN - top
  else if (top + containerH > hostH - CHART_PAN_MARGIN) dy = hostH - CHART_PAN_MARGIN - (top + containerH)
  return { dx: Math.round(dx), dy: Math.round(dy) }
}
