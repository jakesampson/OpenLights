// Fader drag bug (Jake, 19 Nov 2026): a colour fader dragged down and
// released off the fader resumed dragging the next time the pointer
// hovered back over it — the drag state stayed live because pointerup
// was never seen. Pointer capture alone does not deliver pointerup when
// the button is released outside the window, so every drag control needs
// the window-level backstop plus a button-less-move guard. Source
// assertions (no DOM renderer), in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const fillFader = readFileSync(resolve(root, 'src/renderer/src/components/FillFader.tsx'), 'utf8')
const position = readFileSync(resolve(root, 'src/renderer/src/components/PositionControl.tsx'), 'utf8')
const wheel = readFileSync(resolve(root, 'src/renderer/src/components/ColorWheelControl.tsx'), 'utf8')
const dragEnd = readFileSync(resolve(root, 'src/renderer/src/components/useDragEnd.ts'), 'utf8')

describe('drag-end guard (useDragEnd)', () => {
  it('ends the drag on any window pointerup, pointercancel or blur', () => {
    expect(dragEnd).toContain("window.addEventListener('pointerup', end)")
    expect(dragEnd).toContain("window.addEventListener('pointercancel', end)")
    expect(dragEnd).toContain("window.addEventListener('blur', end)")
    expect(dragEnd).toContain("window.removeEventListener('pointerup', end)")
  })
})

describe('FillFader drag cannot re-engage on hover-back', () => {
  it('keeps pointer capture and ends the drag on every release path', () => {
    expect(fillFader).toContain('setPointerCapture')
    expect(fillFader).toContain('useDragEnd')
    expect(fillFader).toContain('drag.begin()')
    expect(fillFader).toContain('onPointerUp={() => drag.end()}')
    expect(fillFader).toContain('onPointerCancel={() => drag.end()}')
    expect(fillFader).toContain('onLostPointerCapture={() => drag.end()}')
  })

  it('a move with no button held ends the drag instead of changing the value', () => {
    // The missed-release case: the next hover-back move arrives with
    // buttons === 0, so the drag ends and the value does not move.
    expect(fillFader).toContain('if (event.buttons === 0) { drag.end(); return }')
    expect(fillFader).toContain('if (drag.isActive()) valueFromPointer(event.clientY)')
    // No bare ref-tracked dragging state left to go stale.
    expect(fillFader).not.toContain('dragging.current = true')
    expect(fillFader).not.toContain('dragging.current = false')
  })
})

describe('PositionControl drag ends the same way', () => {
  it('guards the move and ends the history group on every release path', () => {
    expect(position).toContain('useDragEnd')
    expect(position).toContain('if (e.buttons === 0) { endDrag(); return }')
    expect(position).toContain('onLostPointerCapture={endDrag}')
    expect(position).toContain('onPointerUp={endDrag}')
    expect(position).toContain('onPointerCancel={endDrag}')
    // The pad only moves while capture is held, so a missed release
    // cannot drift the value — only the history group needed the guard.
    expect(position).toContain('hasPointerCapture(e.pointerId)')
  })
})

describe('colour wheel drags end the same way', () => {
  it('uses pointer capture plus the button-less-move guard on every zone', () => {
    expect(wheel).toContain('useDragEnd')
    expect(wheel).toContain('setPointerCapture')
    // A button-less move ends the drag — and then shows the hovered
    // zone's value popup instead of the drag popup.
    expect(wheel).toContain('if (event.buttons === 0) { endDrag(); setTooltip(tooltipFor(event)); return }')
    expect(wheel).toContain('onLostPointerCapture={endDrag}')
    expect(wheel).toContain('onPointerUp={endDrag}')
    expect(wheel).toContain('onPointerCancel={endDrag}')
  })
})
