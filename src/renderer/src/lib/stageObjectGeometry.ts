import type { StageObject } from '@shared/types'
export function sanitizeStageObjectPatch(patch: Partial<StageObject>): Partial<StageObject> {
  const result = { ...patch }
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'fontSize'] as const) {
    const value = result[key]
    if (value === undefined) continue
    if (!Number.isFinite(value)) { delete result[key]; continue }
    result[key] = key === 'width' || key === 'height' ? Math.max(4, value) : key === 'opacity' ? Math.max(0, Math.min(1, value)) : key === 'fontSize' ? Math.max(4, Math.min(200, value)) : value
  }
  return result
}

export type StageObjectCorner = 'nw' | 'ne' | 'sw' | 'se'

/** Resize a stage object by dragging one corner, keeping the opposite
 *  corner fixed (Jake, 27 Nov 2026 — Preview background images).
 *  `current` is the pointer in canvas (SVG) coords. By default the
 *  resize is uniform (aspect ratio locked); with `free` (Shift) width
 *  and height change independently. Rotation and flips are honoured —
 *  the drag is measured in the object's own axes, so the grabbed corner
 *  follows the pointer and the opposite corner stays put. */
export function resizeStageObject(original: StageObject, corner: StageObjectCorner, current: { x: number; y: number }, free: boolean): StageObject {
  const sx = corner.includes('e') ? 1 : -1
  const sy = corner.includes('s') ? 1 : -1
  const fx = original.flipX ? -1 : 1
  const fy = original.flipY ? -1 : 1
  // Canvas -> object-local: un-rotate, then un-flip (the flip is its own inverse).
  const angle = -original.rotation * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const toLocal = (p: { x: number; y: number }) => {
    const dx = p.x - original.x, dy = p.y - original.y
    const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos
    return { x: rx * fx, y: ry * fy }
  }
  const w0 = original.width, h0 = original.height
  const fixed = { x: -sx * w0 / 2, y: -sy * h0 / 2 }
  const grabbed = { x: sx * w0 / 2, y: sy * h0 / 2 }
  const p = toLocal(current)
  let w1: number, h1: number
  if (free) {
    w1 = Math.max(4, sx * (p.x - fixed.x))
    h1 = Math.max(4, sy * (p.y - fixed.y))
  } else {
    const diag = Math.hypot(grabbed.x - fixed.x, grabbed.y - fixed.y) || 1
    const scale = Math.max(4 / Math.max(w0, h0), Math.hypot(p.x - fixed.x, p.y - fixed.y) / diag)
    w1 = w0 * scale
    h1 = h0 * scale
  }
  // The opposite corner stays put: the centre moves by half the size
  // change along each local axis, back through flip then rotation.
  const dLocal = { x: sx * (w1 - w0) / 2, y: sy * (h1 - h0) / 2 }
  const dFlipped = { x: dLocal.x * fx, y: dLocal.y * fy }
  const a2 = original.rotation * Math.PI / 180
  const dx = dFlipped.x * Math.cos(a2) - dFlipped.y * Math.sin(a2)
  const dy = dFlipped.x * Math.sin(a2) + dFlipped.y * Math.cos(a2)
  return { ...original, x: Math.round(original.x + dx), y: Math.round(original.y + dy), width: Math.round(w1), height: Math.round(h1) }
}
