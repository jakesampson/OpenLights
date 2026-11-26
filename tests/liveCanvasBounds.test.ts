import { describe, expect, it } from 'vitest'
import {
  canvasSizeFor, snapCanvasValue, DEFAULT_LIVE_CANVAS_BOUNDS, LIVE_CANVAS_GROW_MARGIN,
  type LiveCanvasBounds
} from '../src/shared/liveObjectDefaults'
import { applyLiveDrop, type LiveDropPayload } from '../src/renderer/src/lib/liveDrops'
import { moveObjects, pasteObjects, copyObjects, type PageObjectRef } from '../src/renderer/src/lib/livePageObjects'
import type { LivePage } from '../src/shared/types'

const WIDE: LiveCanvasBounds = { width: 2000, height: 300 }

function makePage(): LivePage {
  return {
    id: 'page',
    name: 'Page',
    controls: [
      { id: 'c1', name: 'Cue one', type: 'toggle', presetIds: [], x: 20, y: 20 },
      { id: 'c2', name: 'Cue two', type: 'toggle', presetIds: [], x: 600, y: 120 }
    ],
    annotations: [
      { id: 'label', type: 'label', text: 'Label', x: 20, y: 440, width: 160, height: 40 }
    ]
  }
}

const payload = (): LiveDropPayload => ({
  presetIds: ['p1'], sequenceIds: [], effectIds: [], presetNames: { p1: 'Blue' }
})
let counter = 0
const makeId = () => `new-${++counter}`

describe('live canvas expands on demand (Jake, 25 Nov 2026)', () => {
  it('keeps the classic 900x520 canvas as the minimum, not a maximum', () => {
    expect(DEFAULT_LIVE_CANVAS_BOUNDS).toEqual({ width: 900, height: 520 })
    // Empty page on a small viewport: the classic canvas, nothing less.
    expect(canvasSizeFor({ width: 700, height: 200 }, [])).toEqual({ width: 900, height: 200 })
  })

  it('covers the viewport when the monitor is wider than the classic canvas', () => {
    expect(canvasSizeFor(WIDE, [])).toEqual({ width: 2000, height: 300 })
  })

  it('grows past the viewport when an object approaches the edge', () => {
    // A 120-wide button with its left at 1950 on a 2000-wide viewport:
    // the canvas grows to hold it plus the margin, it is not clamped.
    expect(canvasSizeFor(WIDE, [{ x: 1950, y: 100, width: 120, height: 40 }]))
      .toEqual({ width: 1950 + 120 + LIVE_CANVAS_GROW_MARGIN, height: 300 })
  })

  it('grows downwards too, past the visible panel height', () => {
    expect(canvasSizeFor(WIDE, [{ x: 20, y: 280, width: 120, height: 40 }]))
      .toEqual({ width: 2000, height: 280 + 40 + LIVE_CANVAS_GROW_MARGIN })
  })

  it('keeps growing on repeated expansion — no fixed maximum', () => {
    const once = canvasSizeFor(WIDE, [{ x: 5000, y: 100, width: 120, height: 40 }])
    expect(once.width).toBe(5000 + 120 + LIVE_CANVAS_GROW_MARGIN)
    const twice = canvasSizeFor(once, [{ x: 12000, y: 100, width: 120, height: 40 }])
    expect(twice.width).toBe(12000 + 120 + LIVE_CANVAS_GROW_MARGIN)
  })

  it('snaps to the 10px grid and never below 0, with no ceiling', () => {
    expect(snapCanvasValue(1843)).toBe(1840)
    expect(snapCanvasValue(1836)).toBe(1840)
    expect(snapCanvasValue(1834)).toBe(1830)
    expect(snapCanvasValue(-50)).toBe(0)
    expect(snapCanvasValue(5000)).toBe(5000)
  })

  it('lets a drop land at the far right — and far past the old 740 limit', () => {
    const { page } = applyLiveDrop(makePage(), payload(), { kind: 'page', x: 1800, y: 100 }, makeId)
    expect(page.controls.at(-1)).toMatchObject({ x: 1800, y: 100 })
    const far = applyLiveDrop(makePage(), payload(), { kind: 'page', x: 5000, y: 100 }, makeId)
    expect(far.page.controls.at(-1)).toMatchObject({ x: 5000, y: 100 })
  })

  it('lets a drop land past the old bottom edge too', () => {
    const { page } = applyLiveDrop(makePage(), payload(), { kind: 'page', x: 100, y: 900 }, makeId)
    expect(page.controls.at(-1)).toMatchObject({ x: 100, y: 900 })
  })

  it('lets a drag move an object far past the old bounds', () => {
    const page = makePage()
    const moved = moveObjects(page, [{ type: 'cue', id: 'c1' }], 5000, 800)
    expect(moved.controls[0]).toMatchObject({ x: 5020, y: 820 })
  })

  it('still floors a drag at 0', () => {
    const page = makePage()
    const moved = moveObjects(page, [{ type: 'cue', id: 'c1' }], -1000, -1000)
    expect(moved.controls[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('lets a paste land past the old 740 limit', () => {
    const page = makePage()
    const clipboard = copyObjects(page, [{ type: 'cue', id: 'c2' }])
    const { page: next } = pasteObjects(page, clipboard, makeId, 1200, 0)
    expect(next.controls.at(-1)).toMatchObject({ x: 1800, y: 120 })
  })

  it('keeps existing saved pages exactly where they are', () => {
    // Growing only ever adds space; nothing already on the page moves.
    const page = makePage()
    const size = canvasSizeFor(WIDE, [
      { x: 20, y: 20, width: 120, height: 40 },
      { x: 600, y: 120, width: 120, height: 40 },
      { x: 20, y: 440, width: 160, height: 40 }
    ])
    expect(size).toEqual({ width: 2000, height: 500 })
    expect(moveObjects(page, [{ type: 'cue', id: 'c1' }], 0, 0).controls[0])
      .toMatchObject({ x: 20, y: 20 })
  })
})
