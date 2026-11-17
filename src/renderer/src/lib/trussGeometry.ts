import type { PreviewTruss } from '@shared/types'
export type PreviewPoint = { x: number; y: number }
export function moveTruss(original: PreviewTruss, start: PreviewPoint, current: PreviewPoint): PreviewTruss {
  return { ...original, x: Math.round(original.x + current.x - start.x), y: Math.round(original.y + current.y - start.y) }
}
/** Rotate around the truss centre without jumping when crossing the angle boundary. */
export function rotateTruss(original: PreviewTruss, start: PreviewPoint, current: PreviewPoint): PreviewTruss {
  const startAngle = Math.atan2(start.y - original.y, start.x - original.x)
  const currentAngle = Math.atan2(current.y - original.y, current.x - original.x)
  const delta = Math.atan2(Math.sin(currentAngle - startAngle), Math.cos(currentAngle - startAngle))
  const rotation = original.rotation + delta * 180 / Math.PI
  const nearest = Math.round(rotation / 45) * 45
  return { ...original, rotation: Math.round(Math.abs(rotation - nearest) <= 4 ? nearest : rotation) }
}
/** Resize around the centre in the truss's own axes, even when rotated. */
export function resizeTruss(original: PreviewTruss, start: PreviewPoint, current: PreviewPoint): PreviewTruss {
  const angle = -original.rotation * Math.PI / 180
  const dx = current.x - start.x, dy = current.y - start.y
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
  return { ...original, width: Math.max(10, Math.round(original.width + 2 * localX)), height: original.shape === 'u' ? Math.max(10, Math.round(original.height + 2 * localY)) : original.height }
}

/** Join the nearest pair of free endpoints, without changing the section's angle or length. */
export function snapTrussEndpoints(truss: PreviewTruss, others: PreviewTruss[], radius = 14): PreviewTruss {
  const endpoints = (item: PreviewTruss): PreviewPoint[] => {
    const angle = item.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
    const y = item.shape === 'u' ? item.height / 2 : 0
    return [-item.width / 2, item.width / 2].map((x) => ({ x: item.x + x * cos - y * sin, y: item.y + x * sin + y * cos }))
  }
  let bestDistance = radius, offset: PreviewPoint | undefined
  for (const other of others) {
    if (other.id === truss.id) continue
    for (const from of endpoints(truss)) for (const to of endpoints(other)) {
      const distance = Math.hypot(to.x - from.x, to.y - from.y)
      if (distance <= bestDistance) { bestDistance = distance; offset = { x: to.x - from.x, y: to.y - from.y } }
    }
  }
  return offset ? { ...truss, x: truss.x + offset.x, y: truss.y + offset.y } : truss
}

/** Snap to the nearest straight or U truss segment within the supplied radius. */
export function snapFixtureToTruss(point: PreviewPoint, trusses: PreviewTruss[], radius = 14): PreviewPoint {
  let best = point, bestDistance = radius
  for (const truss of trusses) {
    const angle = truss.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
    const dx = point.x - truss.x, dy = point.y - truss.y
    const local = { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
    const w = truss.width / 2, h = truss.height / 2
    const segments: [PreviewPoint, PreviewPoint][] = truss.shape === 'u'
      ? [[{ x: -w, y: h }, { x: -w, y: -h }], [{ x: -w, y: -h }, { x: w, y: -h }], [{ x: w, y: -h }, { x: w, y: h }]]
      : [[{ x: -w, y: 0 }, { x: w, y: 0 }]]
    for (const [a, b] of segments) {
      const vx = b.x - a.x, vy = b.y - a.y, lengthSquared = vx * vx + vy * vy
      const t = lengthSquared ? Math.max(0, Math.min(1, ((local.x - a.x) * vx + (local.y - a.y) * vy) / lengthSquared)) : 0
      const x = a.x + t * vx, y = a.y + t * vy
      const distance = Math.hypot(local.x - x, local.y - y)
      if (distance <= bestDistance) { bestDistance = distance; best = { x: Math.round(truss.x + x * cos - y * sin), y: Math.round(truss.y + x * sin + y * cos) } }
    }
  }
  return best
}
