// Cuelist auto-enlarge (Guide ch.11 p.189 + Jake, 28 Nov 2026):
// "Lightkey will automatically enlarge the cuelist to fit the Live
// view when you exit edit mode." Jake's screenshots show what that
// means in practice: a cuelist dragged to free space at the bottom
// expands to the full width when he clicks Done, and one placed at
// the side fills the free strip beside the buttons instead. The rule
// is the same in both cases — from where the user left it, the cuelist
// grows right and down until it meets another object or the edge of
// the visible Live view — and it never shrinks, and never covers
// another object. Positions are canvas coordinates; `view` is the
// visible viewport's right/bottom edge in the same coordinates.
import { snapCanvasValue } from '@shared/liveObjectDefaults'

export type CuelistRect = { x: number; y: number; width: number; height: number }

export function enlargeCuelistToFitView(
  widget: CuelistRect,
  view: { right: number; bottom: number },
  others: CuelistRect[],
): { width: number; height: number } {
  let right = view.right
  let bottom = view.bottom
  for (const other of others) {
    // Starts right of the widget's left edge and overlaps its vertical
    // band: the expansion stops at this object's left edge — whether it
    // sits clear to the right or already overlaps the widget's span.
    if (other.x > widget.x && other.y < widget.y + widget.height && other.y + other.height > widget.y) {
      right = Math.min(right, other.x)
    }
    // Starts below the widget's top edge and overlaps its horizontal
    // band: the expansion stops at this object's top edge.
    if (other.y > widget.y && other.x < widget.x + widget.width && other.x + other.width > widget.x) {
      bottom = Math.min(bottom, other.y)
    }
  }
  return {
    width: Math.max(widget.width, snapCanvasValue(right - widget.x)),
    height: Math.max(widget.height, snapCanvasValue(bottom - widget.y)),
  }
}
