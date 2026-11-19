// Preview canvas drags share the fader missed-release shape (19 Nov
// 2026, NOTES.md Item 1): a release outside the window leaves the
// fixture / truss / marquee / pan / fixture-handle refs set, so the
// next hover-back move resumes the drag. The canvas gets the same
// guard as the faders (`components/useDragEnd.ts`): a window-level
// backstop armed on drag start, plus a move with no button held that
// ends the drag outright. Source assertions (no DOM renderer) —
// jsdom has no SVG geometry, so a canvas drag cannot be driven there;
// the browser-only release-outside-the-window timing is noted in
// NOTES.md and left to Jake's desktop check.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const preview = readFileSync(resolve(root, 'src/renderer/src/components/StagePreview.tsx'), 'utf8')
const dragEnd = readFileSync(resolve(root, 'src/renderer/src/components/useDragEnd.ts'), 'utf8')

describe('Preview canvas drags use the shared drag-end guard', () => {
  it('arms the window-level guard on any canvas pointerdown', () => {
    // Every canvas drag starts with a pointerdown on the svg (or one
    // of its children, bubbling to it), so one arm site covers the
    // fixture, truss, marquee, pan and fixture-handle drags alike.
    expect(preview).toContain("import { useDragEnd } from './useDragEnd'")
    expect(preview).toContain('const dragGuard = useDragEnd()')
    expect(preview).toContain('onPointerDown={() => dragGuard.begin()}')
    // The guard itself ends the drag on window pointerup /
    // pointercancel / blur.
    expect(dragEnd).toContain("window.addEventListener('pointerup', end)")
    expect(dragEnd).toContain("window.addEventListener('pointercancel', end)")
    expect(dragEnd).toContain("window.addEventListener('blur', end)")
  })

  it('a move with no button held ends the drag instead of moving anything', () => {
    // The missed-release case: the next hover-back move arrives with
    // buttons === 0, so the drag is cancelled and nothing moves.
    // The guard runs first in the move handler, before every drag
    // branch (fixture handle, marquee, truss, pan, fixture).
    expect(preview).toContain('if (event.buttons === 0) { cancelCanvasDrag(); return }')
    const move = preview.indexOf('onPointerMove={(event) =>')
    const guard = preview.indexOf('if (event.buttons === 0) { cancelCanvasDrag(); return }')
    const firstBranch = preview.indexOf('if (fixtureHandleRef.current)', move)
    expect(guard).toBeGreaterThan(move)
    expect(guard).toBeLessThan(firstBranch)
  })

  it('cancelling clears every canvas drag ref, like onPointerCancel did', () => {
    expect(preview).toContain('onPointerCancel={cancelCanvasDrag}')
    expect(preview).toContain('onLostPointerCapture={cancelCanvasDrag}')
    expect(preview).toContain('setMarquee(null); panRef.current = null; dragRef.current = null; setDragPositions(null); trussDragRef.current = null; setTrussDraft(null)')
    expect(preview).toContain('fixtureHandleRef.current = null')
    // Leaving edit mode also disarms the guard, so a drag cut short
    // by the Edit toggle cannot stay armed.
    expect(preview).toContain('dragGuard.end()')
  })
})
