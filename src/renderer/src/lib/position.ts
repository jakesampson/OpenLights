export function splitPosition(value: number): { coarse: number; fine: number } {
  const raw = Math.round(Math.max(0, Math.min(1, value)) * 65535)
  return { coarse: raw >> 8, fine: raw & 255 }
}
export function positionValues(x: number, y: number, supported: string[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [attribute, value] of [['pan', x], ['tilt', y]] as const) if (supported.includes(attribute)) {
    const split = splitPosition(value); result[attribute] = supported.includes(`${attribute}Fine`) ? split.coarse : Math.round(Math.max(0, Math.min(1, value)) * 255)
    if (supported.includes(`${attribute}Fine`)) result[`${attribute}Fine`] = split.fine
  }
  return result
}

/**
 * Current pan/tilt as 0..1 fractions, for axis locking (Guide ch.8,
 * p.93: hold Command to lock pan, Shift to lock tilt while dragging
 * the position control). A missing value reads as centre (0.5); a
 * 16-bit pair combines coarse + fine so the lock holds the exact angle.
 */
export function positionFractions(values: Record<string, number>, supported: string[]): { pan: number; tilt: number } {
  const fraction = (attribute: 'pan' | 'tilt'): number => {
    if (!supported.includes(attribute)) return 0.5
    const coarse = values[attribute]
    if (coarse === undefined) return 0.5
    if (supported.includes(`${attribute}Fine`)) {
      return (Math.max(0, Math.min(255, Math.round(coarse))) * 256 + Math.max(0, Math.min(255, values[`${attribute}Fine`] ?? 0))) / 65535
    }
    return Math.max(0, Math.min(255, Math.round(coarse))) / 255
  }
  return { pan: fraction('pan'), tilt: fraction('tilt') }
}

// LightKey's position control is a CIRCLE (Guide ch.8, pp.90–91), not
// a square pad: the angle around the circle is the pan angle (home at
// the top, 0°), the distance from the centre is the tilt, and the
// centre is the home position (pan 0°, tilt 0°). The helpers below map
// between the 0..1 DMX fractions the rest of the app works in and a
// point in the disc (x/y also 0..1 of the control box).
/** Where the dot sits for a pan/tilt fraction pair: angle = pan around
 *  the circle clockwise from the top, radius = |tilt| from the centre. */
export function positionPoint(pan: number, tilt: number): { x: number; y: number } {
  const angle = (pan - 0.5) * Math.PI * 2
  const radius = Math.abs(tilt - 0.5) * 2
  return { x: 0.5 + radius * Math.sin(angle) * 0.5, y: 0.5 - radius * Math.cos(angle) * 0.5 }
}
/** Which pan/tilt fractions a point in the disc means. A point fixes
 *  the pan angle and the tilt magnitude, but not the tilt sign — the
 *  guide's circle shows both signs at the same point (p.91: pan −60° /
 *  tilt +45° and pan +120° / tilt −45° are the same point), so the sign
 *  is kept from the drag start (or the current value on a click) and
 *  only changes via Flip Tilt. Points outside the disc clamp to the rim. */
export function positionFromPoint(x: number, y: number, tiltSign: 1 | -1): { pan: number; tilt: number } {
  const dx = x - 0.5
  const dy = y - 0.5
  const radius = Math.min(1, Math.hypot(dx, dy) * 2)
  const angle = Math.atan2(dx, -dy)
  const pan = angle / (Math.PI * 2) + 0.5
  return { pan: pan >= 1 ? pan - 1 : pan < 0 ? pan + 1 : pan, tilt: 0.5 + (tiltSign * radius) / 2 }
}
/** Pan/tilt fractions as degrees, for the readout under the control
 *  (LightKey shows degrees, e.g. "Pan: −60° Tilt: +45°", Guide p.91).
 *  The ranges are the calibration ranges from the Limits step: pan
 *  ±270°, tilt ±135°. */
export function positionDegrees(pan: number, tilt: number): { pan: number; tilt: number } {
  return { pan: (pan - 0.5) * 540, tilt: (tilt - 0.5) * 270 }
}
/** Flip Pan / Flip Tilt (Guide ch.8, p.93: Control-click the position
 *  control and choose Flip Pan or Flip Tilt) — reverse the sign of one
 *  angle around home, a one-off change to the value, not a persistent
 *  per-fixture invert option. */
export function flipPosition(pan: number, tilt: number, axis: 'pan' | 'tilt'): { pan: number; tilt: number } {
  return axis === 'pan' ? { pan: 1 - pan, tilt } : { pan, tilt: 1 - tilt }
}
