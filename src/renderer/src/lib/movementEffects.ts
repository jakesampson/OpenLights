export interface MovementPoint { pan: number; tilt: number }
export interface MovementTransform {
  pan?: number
  tilt?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
}

export type MovementPath = 'circle' | 'figure-eight' | 'line' | MovementPoint[]

const cycle = (t: number): number => ((t % 1) + 1) % 1

function interpolate(points: MovementPoint[], t: number): MovementPoint {
  if (points.length === 0) return { pan: 0, tilt: 0 }
  if (points.length === 1) return points[0]
  const location = cycle(t) * points.length
  const index = Math.floor(location) % points.length
  const next = (index + 1) % points.length
  const amount = location - Math.floor(location)
  return {
    pan: points[index].pan + (points[next].pan - points[index].pan) * amount,
    tilt: points[index].tilt + (points[next].tilt - points[index].tilt) * amount
  }
}

/** Generate a normalized pan/tilt point and apply editable geometric transforms.
 * Parametric paths (circle, figure-eight, line) run at 0.8 amplitude —
 * the same convention as the point-based built-in paths (±0.8) and the
 * Position HUD's sampling of them, so the chart and the driven fixture
 * agree. The guide (ch.10) names the shapes but pins no amplitude. */
export function movementPoint(path: MovementPath, t: number, transform: MovementTransform = {}): MovementPoint {
  const p = cycle(t)
  const angle = p * Math.PI * 2
  const point = Array.isArray(path)
    ? interpolate(path, p)
    : path === 'circle'
      ? { pan: Math.cos(angle) * 0.8, tilt: Math.sin(angle) * 0.8 }
      : path === 'figure-eight'
        ? { pan: Math.sin(angle) * 0.8, tilt: Math.sin(angle * 2) * 0.8 }
        : { pan: (p * 2 - 1) * 0.8, tilt: 0 }
  const x = point.pan * (transform.scaleX ?? 1)
  const y = point.tilt * (transform.scaleY ?? 1)
  const rotation = (transform.rotation ?? 0) * Math.PI / 180
  return {
    pan: x * Math.cos(rotation) - y * Math.sin(rotation) + (transform.pan ?? 0),
    tilt: x * Math.sin(rotation) + y * Math.cos(rotation) + (transform.tilt ?? 0)
  }
}
