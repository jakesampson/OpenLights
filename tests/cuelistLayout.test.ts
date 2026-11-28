// Cuelist auto-enlarge (Guide ch.11 p.189 + Jake, 28 Nov 2026, from
// his own LightKey testing): on exiting edit mode the cuelist grows
// RIGHT to the full width of the Live view — but ONLY when it sits
// entirely underneath the other objects on the page, in free space
// below the row of cue buttons. Its height never changes. A cuelist
// placed on the line with the other buttons — its vertical span
// overlapping any other object's — is left exactly as placed. It
// never shrinks, and never covers another object.
import { describe, it, expect } from 'vitest'
import { enlargeCuelistToFitView, isCuelistUnderneath } from '../src/renderer/src/lib/cuelistLayout'

describe('isCuelistUnderneath', () => {
  it('is true with no other objects (vacuous)', () => {
    expect(isCuelistUnderneath({ x: 20, y: 20, width: 600, height: 180 }, [])).toBe(true)
  })

  it('is true when the top edge sits at another object\'s bottom edge', () => {
    expect(isCuelistUnderneath(
      { x: 20, y: 60, width: 600, height: 180 },
      [{ x: 20, y: 20, width: 120, height: 40 }],
    )).toBe(true)
  })

  it('is true when entirely below every other object', () => {
    expect(isCuelistUnderneath(
      { x: 20, y: 500, width: 600, height: 180 },
      [
        { x: 20, y: 20, width: 120, height: 40 },
        { x: 160, y: 20, width: 120, height: 40 },
      ],
    )).toBe(true)
  })

  it('is false when its vertical span overlaps another object', () => {
    expect(isCuelistUnderneath(
      { x: 20, y: 20, width: 600, height: 180 },
      [{ x: 700, y: 20, width: 120, height: 40 }],
    )).toBe(false)
  })

  it('is false when one pixel above another object\'s bottom edge', () => {
    expect(isCuelistUnderneath(
      { x: 20, y: 59, width: 600, height: 180 },
      [{ x: 20, y: 20, width: 120, height: 40 }],
    )).toBe(false)
  })

  it('is false when an object sits below it', () => {
    expect(isCuelistUnderneath(
      { x: 20, y: 20, width: 600, height: 180 },
      [{ x: 20, y: 500, width: 120, height: 40 }],
    )).toBe(false)
  })
})

describe('enlargeCuelistToFitView', () => {
  it('underneath the buttons, grows right to the full width, height unchanged (Jake, 28 Nov 2026)', () => {
    // Jake's screenshots 3 -> 4: the cuelist placed underneath the
    // row of cue buttons at ~600x180 enlarges to the full width on
    // Done, and the height does not move.
    expect(enlargeCuelistToFitView(
      { x: 20, y: 120, width: 600, height: 180 },
      { right: 2880, bottom: 1440 },
      [
        { x: 20, y: 20, width: 120, height: 40 },
        { x: 160, y: 20, width: 120, height: 40 },
      ],
    )).toEqual({ width: 2860, height: 180 })
  })

  it('underneath with no other objects, fills to the viewport edge (vacuous)', () => {
    expect(enlargeCuelistToFitView(
      { x: 20, y: 500, width: 600, height: 180 },
      { right: 1200, bottom: 800 },
      [],
    )).toEqual({ width: 1180, height: 180 })
  })

  it('on the line with the buttons, stays exactly as placed (Jake, 28 Nov 2026)', () => {
    // Jake's screenshot 2: a cuelist placed on the line with the
    // other cue buttons does NOT auto-enlarge on Done.
    expect(enlargeCuelistToFitView(
      { x: 20, y: 20, width: 600, height: 180 },
      { right: 2880, bottom: 1440 },
      [{ x: 700, y: 20, width: 120, height: 40 }],
    )).toEqual({ width: 600, height: 180 })
  })

  it('a neighbour in the same band blocks the enlarge entirely — it is on the line, not a stop', () => {
    // A button overlapping the widget's vertical band makes the
    // widget "on the line", so there is no enlarge to stop: the
    // underneath test fails first and the size stays as placed. The
    // rightward stop in the code is a guard for that reason — with
    // the predicate passing, no other object can overlap the band.
    expect(enlargeCuelistToFitView(
      { x: 20, y: 120, width: 600, height: 180 },
      { right: 2880, bottom: 1440 },
      [
        { x: 20, y: 20, width: 120, height: 40 },
        { x: 1500, y: 120, width: 120, height: 40 },
      ],
    )).toEqual({ width: 600, height: 180 })
  })

  it('underneath, a neighbour in a different band does not stop it', () => {
    // The button above the cuelist is underneath-checked, not a
    // rightward blocker — it does not overlap the widget's band.
    expect(enlargeCuelistToFitView(
      { x: 20, y: 120, width: 600, height: 180 },
      { right: 2880, bottom: 1440 },
      [{ x: 1500, y: 20, width: 120, height: 40 }],
    )).toEqual({ width: 2860, height: 180 })
  })

  it('never shrinks, even when the viewport is narrower than the widget', () => {
    expect(enlargeCuelistToFitView(
      { x: 20, y: 500, width: 600, height: 180 },
      { right: 400, bottom: 800 },
      [],
    )).toEqual({ width: 600, height: 180 })
  })

  it('leaves a cuelist already filling its space alone', () => {
    expect(enlargeCuelistToFitView(
      { x: 0, y: 500, width: 2880, height: 180 },
      { right: 2880, bottom: 1440 },
      [],
    )).toEqual({ width: 2880, height: 180 })
  })

  it('snaps the enlarged width to the 10px grid', () => {
    expect(enlargeCuelistToFitView(
      { x: 23, y: 500, width: 600, height: 180 },
      { right: 1000, bottom: 500 },
      [],
    )).toEqual({ width: 980, height: 180 })
  })
})
