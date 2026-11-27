// Yellow alignment guides (Jake, 27 Nov 2026 — LightKey cue editing,
// Video 2): while a button is moved or resized in Edit Mode, thin
// yellow lines extend from its edges when they line up with a
// neighbour's edges, and the button snaps to that alignment.
import type { LivePage } from '@shared/types'
import { LIVE_CUE_SIZE, LIVE_LIST_SIZE } from '@shared/liveObjectDefaults'
import type { Rect } from './livePageObjects'

export interface AlignmentGuides {
  /** Snapped top-left of the moving rect (unchanged when nothing aligns). */
  x: number
  y: number
  /** Canvas x positions of vertical guide lines. */
  vertical: number[]
  /** Canvas y positions of horizontal guide lines. */
  horizontal: number[]
}

const TOLERANCE_PX = 4

function objectRects(page: LivePage, movingId: string): Rect[] {
  const rects: Rect[] = []
  for (const control of page.controls) {
    if (control.id === movingId) continue
    rects.push({ x: control.x ?? 0, y: control.y ?? 0, width: control.width ?? LIVE_CUE_SIZE.width, height: control.height ?? LIVE_CUE_SIZE.height })
  }
  for (const widget of page.cueListWidgets ?? []) {
    if (widget.id === movingId) continue
    rects.push({ x: widget.x, y: widget.y, width: widget.width ?? LIVE_LIST_SIZE.width, height: widget.height ?? LIVE_LIST_SIZE.height })
  }
  for (const annotation of page.annotations ?? []) {
    if (annotation.id === movingId) continue
    rects.push({ x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height })
  }
  return rects
}

/**
 * The nearest neighbour edge (left / centre / right) within tolerance
 * of a canvas x, or null. Used by the resize handles to snap the edge
 * being dragged; alignmentGuides uses it for the moving rect's edges.
 */
export function alignEdgeX(page: LivePage, movingId: string, value: number): number | null {
  for (const other of objectRects(page, movingId)) {
    for (const edge of [other.x, other.x + other.width / 2, other.x + other.width]) {
      if (Math.abs(value - edge) <= TOLERANCE_PX) return edge
    }
  }
  return null
}

/** The nearest neighbour edge (top / centre / bottom) within tolerance of a canvas y, or null. */
export function alignEdgeY(page: LivePage, movingId: string, value: number): number | null {
  for (const other of objectRects(page, movingId)) {
    for (const edge of [other.y, other.y + other.height / 2, other.y + other.height]) {
      if (Math.abs(value - edge) <= TOLERANCE_PX) return edge
    }
  }
  return null
}

/**
 * Snap a moving rect to its neighbours' edges and report the guide
 * lines. Edges compared: left / centre-x / right and top / centre-y /
 * bottom, each against the same edges of every other object on the
 * page. The first alignment found on each axis wins.
 */
export function alignmentGuides(page: LivePage, movingId: string, rect: Rect): AlignmentGuides {
  let x = rect.x
  let y = rect.y
  const vertical: number[] = []
  const horizontal: number[] = []
  for (const edge of [rect.x, rect.x + rect.width / 2, rect.x + rect.width]) {
    const aligned = alignEdgeX(page, movingId, edge)
    if (aligned !== null) { x = rect.x + (aligned - edge); vertical.push(aligned); break }
  }
  for (const edge of [rect.y, rect.y + rect.height / 2, rect.y + rect.height]) {
    const aligned = alignEdgeY(page, movingId, edge)
    if (aligned !== null) { y = rect.y + (aligned - edge); horizontal.push(aligned); break }
  }
  return { x, y, vertical, horizontal }
}
