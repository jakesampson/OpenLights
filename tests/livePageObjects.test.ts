import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import {
  copyObjects,
  deleteObjects,
  duplicateObjects,
  emptyClipboard,
  isClipboardEmpty,
  moveObjects,
  newAnnotationObject,
  newCueObject,
  newWidgetObject,
  objectSize,
  objectsInRect,
  pasteObjects,
  positionedObjects,
  renameObject,
  resizeObject,
  setAttachment,
  setObjectStyle,
  withAttached,
  type PageObjectRef
} from '../src/renderer/src/lib/livePageObjects'
import {
  clampLiveSize, DEFAULT_OBJECT_STYLES, LIVE_CUE_SIZE, MAX_LIVE_OBJECT_SIZE, MIN_LIVE_OBJECT_SIZE
} from '../src/shared/liveObjectDefaults'

function makePage(): LivePage {
  return {
    id: 'page',
    name: 'Page',
    controls: [
      { id: 'c1', name: 'One', type: 'push', presetIds: [], x: 20, y: 20 },
      { id: 'c2', name: 'Two', type: 'push', behavior: 'flash', presetIds: [], x: 220, y: 20 }
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
    expect(objectsInRect(page, { x: 210, y: 0, width: 400, height: 400 }).map((o) => o.id).sort()).toEqual(['a1', 'c2', 'w1'])
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
    // One cuelist widget per page (Jake, 27 Nov 2026): the page already
    // has w1, so the pasted widget is dropped — only the button lands.
    expect(refs.map((r) => r.id)).toEqual(['new-1'])
    expect(next.controls.map((c) => c.id)).toEqual(['c1', 'c2', 'new-1'])
    expect(next.controls[2]).toMatchObject({ x: 30, y: 30 })
    expect(next.cueListWidgets!.map((w) => w.id)).toEqual(['w1'])
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

describe('live page object resize and rename (7.6)', () => {
  it('clamps resize dimensions to the allowed range and snaps to the 10px grid', () => {
    expect(clampLiveSize(MIN_LIVE_OBJECT_SIZE - 100)).toBe(MIN_LIVE_OBJECT_SIZE)
    expect(clampLiveSize(MAX_LIVE_OBJECT_SIZE + 100)).toBe(MAX_LIVE_OBJECT_SIZE)
    expect(clampLiveSize(143)).toBe(140)
    expect(clampLiveSize(146)).toBe(150)
    expect(clampLiveSize(Number.NaN)).toBe(MIN_LIVE_OBJECT_SIZE)
  })

  it('stores width and height on a cue, immutably', () => {
    const page = makePage()
    const next = resizeObject(page, cue('c1'), 213, 307)
    expect(next.controls[0]).toMatchObject({ width: 210, height: 310 })
    expect(page.controls[0].width).toBeUndefined()
    expect(next.controls[1]).toEqual(page.controls[1])
    expect(next.annotations).toEqual(page.annotations)
  })

  it('resizes cue-list widgets and annotations through the same helper', () => {
    const page = makePage()
    expect(resizeObject(page, { type: 'list', id: 'w1' }, 300, 250).cueListWidgets![0]).toMatchObject({ width: 300, height: 250 })
    expect(resizeObject(page, { type: 'annotation', id: 'a1' }, 500, 400).annotations![0]).toMatchObject({ width: 500, height: 400 })
  })

  it('reports an object\'s current size, falling back to defaults', () => {
    const page = makePage()
    expect(objectSize(page, cue('c1'))).toEqual(LIVE_CUE_SIZE)
    expect(objectSize(page, { type: 'annotation', id: 'a1' })).toEqual({ width: 200, height: 100 })
    expect(objectSize(page, cue('missing'))).toEqual(LIVE_CUE_SIZE)
  })

  it('renames cues and annotation text, trimming and applying a fallback', () => {
    const page = makePage()
    expect(renameObject(page, cue('c1'), '  Dance floor  ').controls[0].name).toBe('Dance floor')
    expect(renameObject(page, cue('c1'), '   ').controls[0].name).toBe('Untitled cue')
    expect(renameObject(page, { type: 'annotation', id: 'a1' }, '  Stage left  ').annotations![0].text).toBe('Stage left')
    expect(renameObject(page, { type: 'annotation', id: 'a1' }, '  ').annotations![0].text).toBe('Label')
    expect(renameObject(page, { type: 'list', id: 'w1' }, 'ignored')).toEqual(page)
    expect(page.controls[0].name).toBe('One')
  })
})

describe('attaching page objects (7.7)', () => {
  const attachedPage = (): LivePage => ({
    id: 'page',
    name: 'Page',
    controls: [
      { id: 'c1', name: 'One', type: 'push', presetIds: [], x: 50, y: 250, attachedTo: 'a1' },
      { id: 'c2', name: 'Two', type: 'push', behavior: 'flash', presetIds: [], x: 70, y: 260, attachedTo: 'c1' },
      { id: 'c3', name: 'Three', type: 'push', presetIds: [], x: 600, y: 20 }
    ],
    cueListWidgets: [{ id: 'w1', cueListId: 'list', x: 20, y: 120 }],
    annotations: [{ id: 'a1', type: 'frame', text: 'Frame', x: 300, y: 200, width: 200, height: 100 }]
  })

  it('expands transitive attachments and is cycle-safe', () => {
    const page = attachedPage()
    expect(withAttached(page, [{ type: 'annotation', id: 'a1' }]).map((r) => r.id).sort()).toEqual(['a1', 'c1', 'c2'])
    expect(withAttached(page, [cue('c1')]).map((r) => r.id).sort()).toEqual(['c1', 'c2'])
    // A cycle a1 -> c3 -> a1 must not loop forever.
    const cyclic: LivePage = {
      ...page,
      controls: page.controls.map((c) => c.id === 'c3' ? { ...c, attachedTo: 'a1' } : c),
      annotations: page.annotations?.map((a) => ({ ...a, attachedTo: 'c3' }))
    }
    expect(withAttached(cyclic, [{ type: 'annotation', id: 'a1' }]).map((r) => r.id).sort()).toEqual(['a1', 'c1', 'c2', 'c3'])
  })

  it('moves a frame together with its attached buttons', () => {
    const page = attachedPage()
    const moved = moveObjects(page, [{ type: 'annotation', id: 'a1' }], 30, 40)
    expect(moved.annotations![0]).toMatchObject({ x: 330, y: 240 })
    expect(moved.controls[0]).toMatchObject({ x: 80, y: 290 }) // c1 attached to frame
    expect(moved.controls[1]).toMatchObject({ x: 100, y: 300 }) // c2 attached to c1
    expect(moved.controls[2]).toMatchObject({ x: 600, y: 20 }) // unattached, untouched
  })

  it('sets, clears and rejects invalid/self/cyclic attachments', () => {
    const page = attachedPage()
    expect(setAttachment(page, cue('c3'), 'a1').controls[2].attachedTo).toBe('a1')
    expect(setAttachment(page, cue('c3'), null).controls[2].attachedTo).toBeUndefined()
    expect(setAttachment(page, cue('c1'), 'c1')).toEqual(page) // self
    expect(setAttachment(page, cue('c1'), 'missing')).toEqual(page) // unknown target
    expect(setAttachment(page, { type: 'annotation', id: 'a1' }, 'c2')).toEqual(page) // c2 descends from a1
    expect(page.controls[0].attachedTo).toBe('a1')
  })

  it('clears attachments to deleted objects and remaps them on paste', () => {
    const page = attachedPage()
    const afterDelete = deleteObjects(page, [{ type: 'annotation', id: 'a1' }])
    expect(afterDelete.controls[0].attachedTo).toBeUndefined()
    expect(afterDelete.controls[1].attachedTo).toBe('c1') // still attached to surviving c1

    const clip = copyObjects(page, [cue('c1'), { type: 'annotation', id: 'a1' }])
    let n = 0
    const { page: pasted } = pasteObjects(page, clip, () => `new-${++n}`)
    const newCue = pasted.controls.find((c) => c.id === 'new-1')!
    const newFrame = pasted.annotations!.find((a) => a.id === 'new-2')!
    expect(newCue.attachedTo).toBe(newFrame.id) // link remapped to the copy
    expect(newCue.attachedTo).not.toBe('a1')
  })
})

describe('live object text styles (7.8)', () => {
  it('gives new objects the built-in default styles', () => {
    expect(newCueObject('n1', 10, 20).style).toEqual(DEFAULT_OBJECT_STYLES.cue)
    expect(newWidgetObject('w2', 'list', 0, 0).style).toEqual(DEFAULT_OBJECT_STYLES.list)
    expect(newAnnotationObject('a3', 'label', 0, 0).style).toEqual(DEFAULT_OBJECT_STYLES.label)
    expect(newAnnotationObject('a4', 'frame', 0, 0).style).toEqual(DEFAULT_OBJECT_STYLES.frame)
  })

  it('lets a page override the defaults for new objects', () => {
    const defaults = { cue: { fontSize: 20, bold: true, color: '#ff0000' } }
    const cue = newCueObject('n1', 0, 0, defaults)
    expect(cue.style).toEqual({ ...DEFAULT_OBJECT_STYLES.cue, ...defaults.cue })
    expect(newAnnotationObject('a', 'label', 0, 0, defaults).style).toEqual(DEFAULT_OBJECT_STYLES.label)
  })

  it('uses the correct size defaults for new labels and frames', () => {
    expect(newAnnotationObject('a', 'label', 0, 0)).toMatchObject({ width: 160, height: 40, text: 'New label' })
    expect(newAnnotationObject('a', 'frame', 0, 0)).toMatchObject({ width: 360, height: 200, text: 'New frame' })
  })

  it('merges a style patch into an existing object, keeping other style fields', () => {
    const page = makePage()
    const styled = setObjectStyle(page, cue('c1'), { bold: true, align: 'right' })
    expect(styled.controls[0].style).toEqual({ ...DEFAULT_OBJECT_STYLES.cue, bold: true, align: 'right' })
    expect(styled.controls[0]).toMatchObject({ name: 'One', x: 20, y: 20 })
    expect(page.controls[0].style).toBeUndefined()

    const frame = setObjectStyle(page, { type: 'annotation', id: 'a1' }, { italic: true })
    expect(frame.annotations![0].style).toEqual({ ...DEFAULT_OBJECT_STYLES.frame, italic: true })
  })
})

describe('one cuelist widget per page (Jake, 27 Nov 2026 — cuelist as a canvas widget, LightKey: a page can\'t contain more than one cuelist)', () => {
  const widgetClipboard = () => ({
    controls: [],
    widgets: [{ id: 'w2', cueListId: 'list', x: 100, y: 100 }],
    annotations: []
  })

  it('pasting a widget onto a page that already has one drops it', () => {
    const page = makePage()
    const pasted = pasteObjects(page, widgetClipboard(), () => 'new-id')
    expect(pasted.page.cueListWidgets).toHaveLength(1)
    expect(pasted.page.cueListWidgets![0].id).toBe('w1')
    expect(pasted.refs).toEqual([])
  })

  it('pasting a widget onto a page with none keeps exactly one, even from a clipboard with two', () => {
    const page = makePage()
    page.cueListWidgets = []
    const clipboard = {
      controls: [],
      widgets: [
        { id: 'w2', cueListId: 'list', x: 100, y: 100 },
        { id: 'w3', cueListId: 'list', x: 200, y: 100 }
      ],
      annotations: []
    }
    const pasted = pasteObjects(page, clipboard, () => 'new-id')
    expect(pasted.page.cueListWidgets).toHaveLength(1)
    expect(pasted.refs).toHaveLength(1)
    expect(pasted.refs[0]).toEqual({ type: 'list', id: 'new-id' })
  })

  it('duplicating a widget on its own page does not create a second one', () => {
    const page = makePage()
    const duplicated = duplicateObjects(page, [{ type: 'list', id: 'w1' }], () => 'new-id')
    expect(duplicated.page.cueListWidgets).toHaveLength(1)
    expect(duplicated.page.cueListWidgets![0].id).toBe('w1')
    expect(duplicated.refs).toEqual([])
  })

  it('pasting buttons still works when the widget is dropped', () => {
    const page = makePage()
    const clipboard = { controls: [{ id: 'c9', name: 'Nine', type: 'push', presetIds: [], x: 0, y: 0 }], widgets: [{ id: 'w2', cueListId: 'list', x: 100, y: 100 }], annotations: [] }
    const pasted = pasteObjects(page, clipboard as never, () => 'new-id')
    expect(pasted.page.controls.map((c) => c.id)).toContain('new-id')
    expect(pasted.page.cueListWidgets).toHaveLength(1)
  })
})
