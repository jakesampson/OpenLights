import type { PreviewTruss } from '@shared/types'
export type PreviewPoint = { x: number; y: number }
export function moveTruss(original: PreviewTruss, start: PreviewPoint, current: PreviewPoint): PreviewTruss {
  return { ...original, x: Math.round(original.x + current.x - start.x), y: Math.round(original.y + current.y - start.y) }
}

/** Angle convention for curved trusses: degrees in the truss's local
 *  frame, 0° = +x (right), increasing clockwise (SVG y-down), so the
 *  point at angle θ on the ellipse is (cx + rx·cos θ, cy + ry·sin θ).
 *  A curved truss is an arc of the ellipse in its width × height box;
 *  a circular truss is the full ellipse (width == height). Defaults are
 *  a 90° arc, top (−90°) to right (0°) — the arc in Jake's LightKey
 *  screenshot (lightkey-curved-truss-arc-90deg.png). */
export function trussArcAngles(truss: PreviewTruss): { start: number; end: number } {
  if (truss.shape === 'circular') return { start: 0, end: 360 }
  return { start: truss.startAngle ?? -90, end: truss.endAngle ?? 0 }
}

/** Point on the truss's arc at the given angle, in truss-local coords
 *  (before the truss rotation is applied). */
export function trussArcPoint(truss: PreviewTruss, angleDeg: number): PreviewPoint {
  const angle = angleDeg * Math.PI / 180
  // Snap floating-point dust (e.g. cos(−90°) ≈ 6e-17) to exact zeros so
  // arc endpoints and SVG paths are clean.
  const clean = (v: number): number => Math.abs(v) < 1e-9 ? 0 : v
  return { x: clean(truss.width / 2 * Math.cos(angle)), y: clean(truss.height / 2 * Math.sin(angle)) }
}

/** SVG arc path for a curved / circular truss, in truss-local coords. */
export function trussArcPath(truss: PreviewTruss): string {
  const { start, end } = trussArcAngles(truss)
  const rx = truss.width / 2, ry = truss.height / 2
  const a = trussArcPoint(truss, start), b = trussArcPoint(truss, end)
  const sweep = end - start
  if (truss.shape === 'circular') {
    // A full ellipse needs two arcs — a single arc command cannot close it.
    return `M ${rx} 0 A ${rx} ${ry} 0 1 1 ${-rx} 0 A ${rx} ${ry} 0 1 1 ${rx} 0 Z`
  }
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0
  const sweepFlag = sweep >= 0 ? 1 : 0
  return `M ${a.x} ${a.y} A ${rx} ${ry} 0 ${largeArc} ${sweepFlag} ${b.x} ${b.y}`
}

/** Sampled polyline points along the arc (every `step` degrees), in
 *  truss-local coords — the basis for fixture snapping and the lattice. */
export function trussArcSamples(truss: PreviewTruss, step = 5): PreviewPoint[] {
  const { start, end } = trussArcAngles(truss)
  const points: PreviewPoint[] = []
  for (let angle = start; angle <= end; angle += step) points.push(trussArcPoint(truss, angle))
  const last = points[points.length - 1], target = trussArcPoint(truss, end)
  if (!last || Math.hypot(last.x - target.x, last.y - target.y) > 0.01) points.push(target)
  return points
}

/** Diagonal rungs across the arc (triangular bracing, as LightKey
 *  renders a truss lattice): at each sample angle a short line across
 *  the arc, leaning to the next sample — in truss-local coords. */
export function trussLatticeRungs(truss: PreviewTruss, step = 30): [PreviewPoint, PreviewPoint][] {
  const { start, end } = trussArcAngles(truss)
  const rungs: [PreviewPoint, PreviewPoint][] = []
  const half = 4
  for (let angle = start; angle < end; angle += step) {
    const next = Math.min(angle + step / 2, end)
    const p = trussArcPoint(truss, angle), q = trussArcPoint(truss, next)
    // Normal to the arc at `angle` (perpendicular to the tangent).
    const tangent = { x: q.x - p.x, y: q.y - p.y }
    const length = Math.hypot(tangent.x, tangent.y) || 1
    const normal = { x: -tangent.y / length, y: tangent.x / length }
    rungs.push([
      { x: p.x - normal.x * half, y: p.y - normal.y * half },
      { x: q.x + normal.x * half, y: q.y + normal.y * half },
    ])
  }
  return rungs
}

/** Rotate around the truss centre without jumping when crossing the angle
 *  boundary. Snap to 45° only when `snap` is true — Guide p.56: "Hold
 *  down Shift to constrain the angle to 45°." The old behaviour snapped
 *  always; that is the bug this fixes. */
export function rotateTruss(original: PreviewTruss, start: PreviewPoint, current: PreviewPoint, snap = false): PreviewTruss {
  const startAngle = Math.atan2(start.y - original.y, start.x - original.x)
  const currentAngle = Math.atan2(current.y - original.y, current.x - original.x)
  const delta = Math.atan2(Math.sin(currentAngle - startAngle), Math.cos(currentAngle - startAngle))
  const rotation = original.rotation + delta * 180 / Math.PI
  if (!snap) return { ...original, rotation: Math.round(rotation) }
  const nearest = Math.round(rotation / 45) * 45
  return { ...original, rotation: Math.round(Math.abs(rotation - nearest) <= 4 ? nearest : rotation) }
}

/** Resize around the centre in the truss's own axes, even when rotated.
 *  A curved truss scales both axes (the arc stays an arc of the resized
 *  ellipse); with `constrain` (Shift) it is forced to a circle segment —
 *  Guide p.56: "To constrain a curved truss to a circle segment, hold
 *  down the Shift key as you drag." A circular truss always scales
 *  uniformly and stays a circle. */
export function resizeTruss(original: PreviewTruss, start: PreviewPoint, current: PreviewPoint, constrain = false): PreviewTruss {
  const angle = -original.rotation * Math.PI / 180
  const dx = current.x - start.x, dy = current.y - start.y
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
  if (original.shape === 'circular') {
    const size = Math.max(10, Math.round(Math.max(original.width, original.height) + 2 * Math.max(Math.abs(localX), Math.abs(localY)) * Math.sign(localX + localY || 1)))
    return { ...original, width: size, height: size }
  }
  const width = Math.max(10, Math.round(original.width + 2 * localX))
  if (original.shape === 'curved' && constrain) return { ...original, width, height: width }
  return { ...original, width, height: original.shape === 'u' || original.shape === 'curved' ? Math.max(10, Math.round(original.height + 2 * localY)) : original.height }
}

/** Drag one of the green end handles of a curved truss (Guide p.69:
 *  "Drag one of the green selection handles at each end. Hold down the
 *  Shift key as you drag to constrain the angle to 45°.") The handle
 *  stays on the radius — only the sweep changes. `start` is where the
 *  drag began (the handle's original position), `current` where the
 *  pointer is now, both in canvas coords. The sweep is clamped to
 *  5°…355° so the arc never collapses or inverts. */
export function sweepTruss(original: PreviewTruss, end: 'start' | 'end', start: PreviewPoint, current: PreviewPoint, snap = false): PreviewTruss {
  const { start: startAngle, end: endAngle } = trussArcAngles(original)
  const toLocalAngle = (point: PreviewPoint): number => {
    const angle = -original.rotation * Math.PI / 180
    const dx = point.x - original.x, dy = point.y - original.y
    const local = { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) }
    return Math.atan2(local.y, local.x) * 180 / Math.PI
  }
  const delta = Math.atan2(Math.sin((toLocalAngle(current) - toLocalAngle(start)) * Math.PI / 180), Math.cos((toLocalAngle(current) - toLocalAngle(start)) * Math.PI / 180)) * 180 / Math.PI
  const moved = (end === 'start' ? startAngle : endAngle) + delta
  const snapped = snap ? Math.round(moved / 45) * 45 : Math.round(moved)
  if (end === 'start') return { ...original, startAngle: Math.max(endAngle - 355, Math.min(endAngle - 5, snapped)) }
  return { ...original, endAngle: Math.max(startAngle + 5, Math.min(startAngle + 355, snapped)) }
}

/** Endpoints of a truss section, for joining sections end to end. A
 *  curved truss joins at its two arc ends; a circular truss has no
 *  free endpoints. */
export function trussEndpoints(truss: PreviewTruss): PreviewPoint[] {
  const angle = truss.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  const toCanvas = (p: PreviewPoint): PreviewPoint => ({ x: truss.x + p.x * cos - p.y * sin, y: truss.y + p.x * sin + p.y * cos })
  if (truss.shape === 'circular') return []
  if (truss.shape === 'curved') {
    const { start, end } = trussArcAngles(truss)
    return [toCanvas(trussArcPoint(truss, start)), toCanvas(trussArcPoint(truss, end))]
  }
  const y = truss.shape === 'u' ? truss.height / 2 : 0
  return [-truss.width / 2, truss.width / 2].map((x) => toCanvas({ x, y }))
}

/** Join the nearest pair of free endpoints, without changing the section's angle or length. */
export function snapTrussEndpoints(truss: PreviewTruss, others: PreviewTruss[], radius = 14): PreviewTruss {
  const endpoints = (item: PreviewTruss): PreviewPoint[] => trussEndpoints(item)
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

/** Snap to the nearest truss segment within the supplied radius — a
 *  straight / U truss segment, or the sampled arc of a curved /
 *  circular truss. */
export function snapFixtureToTruss(point: PreviewPoint, trusses: PreviewTruss[], radius = 14): PreviewPoint {
  let best = point, bestDistance = radius
  for (const truss of trusses) {
    const angle = truss.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
    const dx = point.x - truss.x, dy = point.y - truss.y
    const local = { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
    const w = truss.width / 2, h = truss.height / 2
    const segments: [PreviewPoint, PreviewPoint][] = truss.shape === 'u'
      ? [[{ x: -w, y: h }, { x: -w, y: -h }], [{ x: -w, y: -h }, { x: w, y: -h }], [{ x: w, y: -h }, { x: w, y: h }]]
      : truss.shape === 'curved' || truss.shape === 'circular'
        ? (() => { const samples = trussArcSamples(truss); return samples.slice(0, -1).map((p, i) => [p, samples[i + 1]] as [PreviewPoint, PreviewPoint]) })()
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
