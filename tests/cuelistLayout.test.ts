// Cuelist auto-enlarge (Guide ch.11 p.189 + Jake, 28 Nov 2026):
// on exiting edit mode the cuelist grows right and down from where it
// was left to fill the free space, stopping at other objects or the
// edge of the visible Live view — and it never shrinks, and never
// covers another object.
import { describe, it, expect } from 'vitest'
import { enlargeCuelistToFitView } from '../src/renderer/src/lib/cuelistLayout'

describe('enlargeCuelistToFitView', () => {
  it('fills the free space at the bottom to the full width (Jake, 28 Nov 2026)', () => {
    // Jake's screenshot 8.49.01: the cuelist dragged to the bottom
    // free space expands to the full width on Done.
    expect(enlargeCuelistToFitView(
      { x: 280, y: 1050, width: 480, height: 300 },
      { right: 2880, bottom: 1440 },
      [],
    )).toEqual({ width: 2600, height: 390 })
  })

  it('fills the free strip at the side instead (Jake, 28 Nov 2026)', () => {
    // Jake's screenshot 8.48.14: the cuelist placed at the right fills
    // the free strip beside the buttons, not the full width.
    expect(enlargeCuelistToFitView(
      { x: 2100, y: 700, width: 480, height: 300 },
      { right: 2880, bottom: 1440 },
      [],
    )).toEqual({ width: 780, height: 740 })
  })

  it('stops at an object to the right', () => {
    expect(enlargeCuelistToFitView(
      { x: 280, y: 1050, width: 480, height: 300 },
      { right: 2880, bottom: 1440 },
      [{ x: 1500, y: 1050, width: 120, height: 40 }],
    )).toEqual({ width: 1220, height: 390 })
  })

  it('stops at an object below, and never shrinks', () => {
    // The object below caps the height at 250 — under the current
    // 300 — so the height stays 300 and only the width grows.
    expect(enlargeCuelistToFitView(
      { x: 280, y: 1050, width: 480, height: 300 },
      { right: 2880, bottom: 1440 },
      [{ x: 280, y: 1300, width: 120, height: 40 }],
    )).toEqual({ width: 2600, height: 300 })
  })

  it('does not grow past an object already overlapping its span', () => {
    // A button dropped onto the widget blocks both directions at its
    // near edge — rightward at its left edge, downward at its top —
    // so the cuelist stays 480x300 and covers nothing.
    expect(enlargeCuelistToFitView(
      { x: 280, y: 1050, width: 480, height: 300 },
      { right: 2880, bottom: 1440 },
      [{ x: 500, y: 1100, width: 120, height: 40 }],
    )).toEqual({ width: 480, height: 300 })
  })

  it('leaves a cuelist already filling its space alone', () => {
    expect(enlargeCuelistToFitView(
      { x: 0, y: 0, width: 2880, height: 1440 },
      { right: 2880, bottom: 1440 },
      [],
    )).toEqual({ width: 2880, height: 1440 })
  })

  it('snaps the enlarged size to the 10px grid', () => {
    expect(enlargeCuelistToFitView(
      { x: 283, y: 100, width: 480, height: 300 },
      { right: 1000, bottom: 500 },
      [],
    )).toEqual({ width: 720, height: 400 })
  })
})
