import { useRef } from 'react'

// A draggable divider between two main panels (Jake, 27 Nov 2026 — the
// four main panels resize by dragging: Preview, Preset Palette,
// Shortcuts, Live/Design bottom panel). The hit area is 6px with a
// visible grip bar, not a 1px invisible line: the grip is always
// visible and brightens on hover / focus / drag. Dragging reports pixel
// deltas to the parent, which owns the size and clamps it; keyboard
// arrows nudge 10px (Shift: 50px). Pointer capture keeps the drag alive
// when the pointer leaves the strip, and the divider never starts any
// other drag — fixture dragging, button dragging and marquee all live on
// elements below it, and this strip stops propagation.
export function PanelDivider({
  orientation,
  label,
  onDrag,
  onDragEnd
}: {
  orientation: 'vertical' | 'horizontal'
  label: string
  onDrag: (deltaPx: number) => void
  onDragEnd?: () => void
}) {
  const drag = useRef<{ start: number } | null>(null)
  const horizontal = orientation === 'horizontal'
  return <div
    role="separator"
    aria-orientation={orientation}
    aria-label={label}
    tabIndex={0}
    className={`panel-divider panel-divider-${orientation}`}
    onPointerDown={(event) => {
      if (event.button !== 0) return
      event.stopPropagation()
      drag.current = { start: horizontal ? event.clientY : event.clientX }
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* jsdom has no pointer capture */ }
    }}
    onPointerMove={(event) => {
      if (!drag.current) return
      event.stopPropagation()
      const now = horizontal ? event.clientY : event.clientX
      onDrag(now - drag.current.start)
      drag.current = { start: now }
    }}
    onPointerUp={(event) => {
      if (!drag.current) return
      event.stopPropagation()
      drag.current = null
      onDragEnd?.()
    }}
    onPointerCancel={() => { drag.current = null; onDragEnd?.() }}
    onKeyDown={(event) => {
      const step = event.shiftKey ? 50 : 10
      if (horizontal && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        onDrag(event.key === 'ArrowUp' ? -step : step)
      } else if (!horizontal && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        onDrag(event.key === 'ArrowLeft' ? -step : step)
      }
    }}
  >
    <span aria-hidden="true" className="panel-divider-grip" />
  </div>
}
