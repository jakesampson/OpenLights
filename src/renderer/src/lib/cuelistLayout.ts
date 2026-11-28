// Cuelist auto-enlarge (Guide ch.11 p.189 + Jake, 28 Nov 2026, from
// his own LightKey testing): "Lightkey will automatically enlarge
// the cuelist to fit the Live view when you exit edit mode" — but
// ONLY when the cuelist sits entirely underneath the other objects
// on the page, in free space below the row of cue buttons. Then it
// grows RIGHT to the full width of the Live view and its height
// stays exactly as placed. A cuelist placed on the line with the
// other buttons — its vertical span overlapping any other object's
// — is left exactly as placed (Jake: "unless other cue buttons are
// on the same row as it, in which case it does not auto-expand").
// LightKey's minimum cuelist size is 600x180 (the resize tooltip in
// Jake's screenshot 1), so a fresh insert starts at the minimum and
// the user expands from there. Positions are canvas coordinates;
// `view` is the visible viewport's right/bottom edge in the same
// coordinates (bottom is unused now — the height never changes —
// but stays in the shape so the caller doesn't change).
import { snapCanvasValue } from '@shared/liveObjectDefaults'

export type CuelistRect = { x: number; y: number; width: number; height: number }

/** True when the widget sits entirely underneath every other object:
 *  its top edge is at or below each other's bottom edge. With no
 *  other objects the condition holds vacuously — a lone cuelist in
 *  free space counts as underneath. */
export function isCuelistUnderneath(widget: CuelistRect, others: CuelistRect[]): boolean {
  return others.every((other) => widget.y >= other.y + other.height)
}

export function enlargeCuelistToFitView(
  widget: CuelistRect,
  view: { right: number; bottom: number },
  others: CuelistRect[],
): { width: number; height: number } {
  // On the line with another object: LightKey leaves the cuelist
  // exactly as placed — no enlarge at all.
  if (!isCuelistUnderneath(widget, others)) {
    return { width: widget.width, height: widget.height }
  }
  // Underneath: grow RIGHT only, to the viewport's right edge,
  // stopping at a neighbour in the same vertical band. The height
  // never changes, and the size never shrinks.
  let right = view.right
  for (const other of others) {
    // Starts right of the widget's left edge and overlaps its
    // vertical band: the expansion stops at this object's left edge.
    if (other.x > widget.x && other.y < widget.y + widget.height && other.y + other.height > widget.y) {
      right = Math.min(right, other.x)
    }
  }
  return {
    width: Math.max(widget.width, snapCanvasValue(right - widget.x)),
    height: widget.height,
  }
}
