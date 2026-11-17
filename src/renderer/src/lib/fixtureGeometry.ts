import type { FixtureDef } from '@shared/types'
interface Point { x: number; y: number }
export function resizeFixtureIcon(original: FixtureDef, centre: Point, start: Point, current: Point): number {
  const initial = Math.max(1, Math.hypot(start.x - centre.x, start.y - centre.y))
  return Math.max(4, Math.min(80, Math.round((original.iconSize ?? 10) * Math.hypot(current.x - centre.x, current.y - centre.y) / initial)))
}
export function rotateFixtureIcon(original: FixtureDef, centre: Point, start: Point, current: Point): number {
  const delta = Math.atan2(current.y - centre.y, current.x - centre.x) - Math.atan2(start.y - centre.y, start.x - centre.x)
  return ((Math.round((original.rotation ?? 0) + delta * 180 / Math.PI) % 360) + 360) % 360
}
