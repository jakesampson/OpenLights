import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import {
  copyObjects,
  deleteObjects,
  duplicateObjects,
  emptyClipboard,
  isClipboardEmpty,
  moveObjects,
  objectsInRect,
  pasteObjects,
  positionedObjects,
  type PageObjectRef
} from '../src/renderer/src/lib/livePageObjects'

function makePage(): LivePage {
  return {
    id: 'page',
    name: 'Page',
    controls: [
      { id: 'c1', name: 'One', type: 'toggle', presetIds: [], x: 20, y: 20 },
      { id: 'c2', name: 'Two', type: 'flash', presetIds: [], x: 220, y: 20 }
    ],
    cueListWidgets: [{ id: 'w1', cueListId: 'list', x: 20, y: 120 }],
    annotations: [{ id: 'a1', type: 'frame', text: 'Frame', x: 300, y: 200, width: 200, height: 100 }]
  }
}

const cue = (id: string): PageObjectRef => ({ type: 'cue', id })

describe('live page multi-object logic (7.5)', () => {
  it('positions all object types with bounds', () => {
    const objects = positionedObjects(makePage())
    expect(objects.map((o) => o.id)).toEqual(['c1', 'c2', 'w1', 'a1'])
    expect(objects.find((o) => o.id === 'a1')).toMatchObject({ width: 200, height: 100 })
  })

  it('selects objects intersecting a marquee rect, including negative drag direction', () => {
    const page = makePage()
    expect(objectsInRect(page, { x: 0, y: 0, width: 200, height: 100 }).map((o) => o.id)).toEqual(['c1'])
    expect(objectsInRect(page, { x: 210, y: 0, width: 400, height: 400 }).map((o) => o.id).sort()).toEqual(['a1', 'c2'])
    // Dragging up-left (negative width/height) must behave the same.
    const forward = objectsInRect(page, { x: 0, y: 0, width: 250, height: 150 }).map((o) => o.id).sort()
    const reverse = objectsInRect(page, { x: 250, y: 150, width: -250, height: -150 }).map((o) => o.id).sort()
    expect(reverse).toEqual(forward)
  })

  it('moves several objects together, immutably and clamped to the page', () => {
    const page = makePage()
    const refs: PageObjectRef[] = [cue('c1'), { type: 'list', id: 'w1' }, { type: 'annotation', id: 'a1' }]
    const moved = moveObjects(page, refs, 30, 40)
    expect(moved.controls[0]).toMatchObject({ x: 50, y: 60 })
    expect(moved.controls[1]).toMatchObject({ x: 220, y: 20 }) // untouched
    expect(moved.cueListWidgets![0]).toMatchObject({ x: 50, y: 160 })
    expect(moved.annotations![0]).toMatchObject({ x: 330, y: 240 })
    expect(page.controls[0]).toMatchObject({ x: 20, y: 20 }) // source unchanged
    expect(moveObjects(page, refs, -1000, -1000).controls[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('deletes several objects across all collections', () => {
    const page = makePage()
    const refs: PageObjectRef[] = [cue('c1'), { type: 'annotation', id: 'a1' }]
    const next = deleteObjects(page, refs)
    expect(next.controls.map((c) => c.id)).toEqual(['c2'])
    expect(next.cueListWidgets!.map((w) => w.id)).toEqual(['w1'])
    expect(next.annotations!.map((a) => a.id)).toEqual([])
    expect(page.controls).toHaveLength(2)
  })

  it('copies selected objects deeply into a clipboard', () => {
    const page = makePage()
    const clip = copyObjects(page, [cue('c1'), { type: 'annotation', id: 'a1' }])
    expect(clip.controls.map((c) => c.id)).toEqual(['c1'])
    expect(clip.annotations.map((a) => a.id)).toEqual(['a1'])
    expect(clip.widgets).toEqual([])
    clip.controls[0].name = 'changed'
    expect(page.controls[0].name).toBe('One')
    expect(isClipboardEmpty(clip)).toBe(false)
    expect(isClipboardEmpty(emptyClipboard())).toBe(true)
    expect(isClipboardEmpty(null)).toBe(true)
  })

  it('pastes clipboard objects with fresh ids and an offset', () => {
    const page = makePage()
    const clip = copyObjects(page, [cue('c1'), { type: 'list', id: 'w1' }])
    let n = 0
    const { page: next, refs } = pasteObjects(page, clip, () => `new-${++n}`, 10, 10)
    expect(refs.map((r) => r.id)).toEqual(['new-1', 'new-2'])
    expect(next.controls.map((c) => c.id)).toEqual(['c1', 'c2', 'new-1'])
    expect(next.controls[2]).toMatchObject({ x: 30, y: 30 })
    expect(next.cueListWidgets!.map((w) => w.id)).toEqual(['w1', 'new-2'])
    expect(page.controls).toHaveLength(2)
  })

  it('duplicates selected objects with fresh ids', () => {
    const page = makePage()
    let n = 0
    const { page: next, refs } = duplicateObjects(page, [cue('c2')], () => `dup-${++n}`)
    expect(refs).toEqual([{ type: 'cue', id: 'dup-1' }])
    expect(next.controls.map((c) => c.id)).toEqual(['c1', 'c2', 'dup-1'])
    expect(next.controls[2].name).toBe('Two')
    expect(next.controls[2].x).not.toBe(next.controls[1].x)
  })
})
