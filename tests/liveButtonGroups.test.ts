// Touching-button groups (Guide ch.11, pp.183–184, "Attach buttons"):
// "Move two or more buttons together so their borders touch… If you attach
// two or more buttons they act as a group where only one button can be
// active at a time. To detach a button from the group, move it away from
// the other buttons." Grouping is derived from positions, so drag-to-attach
// and drag-to-detach need no stored flag.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LivePage, ShowDef } from '../src/shared/types'
import { controlsTouch, controlRect, touchingGroupSiblings } from '../src/renderer/src/lib/liveFrames'

vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

// Imported after the globals exist.
import { useShowStore } from '../src/renderer/src/stores/showStore'

const cue = (id: string, x: number, y: number, width = 160, height = 90) =>
  ({ id, name: id, type: 'toggle' as const, presetIds: [], x, y, width, height })

function groupPage(): LivePage {
  return {
    id: 'page',
    name: 'Page',
    controls: [
      cue('a', 0, 0),
      cue('b', 160, 0), // right edge of a meets left edge of b: attached
      cue('c', 400, 0), // separated from both: independent
      cue('d', 160, 90) // below b, sharing b's bottom edge: attached via b
    ]
  }
}

describe('touching-button geometry (11, pp.183–184)', () => {
  it('shares an edge horizontally or vertically', () => {
    const page = groupPage()
    expect(controlsTouch(controlRect(page, 'a')!, controlRect(page, 'b')!)).toBe(true)
    expect(controlsTouch(controlRect(page, 'b')!, controlRect(page, 'd')!)).toBe(true)
  })

  it('does not count a gap or a corner-only touch', () => {
    const page = groupPage()
    expect(controlsTouch(controlRect(page, 'a')!, controlRect(page, 'c')!)).toBe(false)
    // Corner-only: a's bottom-right corner meets e's top-left corner.
    const corner: LivePage = { id: 'p', name: 'P', controls: [cue('a', 0, 0), cue('e', 160, 90)] }
    expect(controlsTouch(controlRect(corner, 'a')!, controlRect(corner, 'e')!)).toBe(false)
    expect(touchingGroupSiblings(corner, 'a')).toEqual([])
  })

  it('groups transitively through a shared member', () => {
    const page = groupPage()
    expect(touchingGroupSiblings(page, 'a').sort()).toEqual(['b', 'd'])
    expect(touchingGroupSiblings(page, 'd').sort()).toEqual(['a', 'b'])
    expect(touchingGroupSiblings(page, 'c')).toEqual([])
  })

  it('detaches a button when it is moved away', () => {
    const page = groupPage()
    expect(touchingGroupSiblings(page, 'a')).toContain('b')
    const moved: LivePage = { ...page, controls: page.controls.map((c) => (c.id === 'b' ? { ...c, x: 200, y: 200 } : c)) }
    expect(touchingGroupSiblings(moved, 'a')).toEqual([])
    expect(touchingGroupSiblings(moved, 'b')).toEqual([])
  })

  it('only groups buttons in the same frame, or in no frame', () => {
    const page: LivePage = {
      id: 'page',
      name: 'Page',
      controls: [cue('a', 20, 20), cue('b', 180, 20)],
      annotations: [
        { id: 'f1', type: 'frame', text: 'One', x: 0, y: 0, width: 200, height: 200 },
        { id: 'f2', type: 'frame', text: 'Two', x: 200, y: 0, width: 200, height: 200 }
      ]
    }
    // a's centre is in f1, b's centre is in f2: touching, but different frames.
    expect(controlsTouch(controlRect(page, 'a')!, controlRect(page, 'b')!)).toBe(true)
    expect(touchingGroupSiblings(page, 'a')).toEqual([])
    expect(touchingGroupSiblings(page, 'b')).toEqual([])
    // Both inside one wide frame: attached.
    const same: LivePage = { ...page, controls: [cue('a', 20, 20), cue('b', 180, 20)], annotations: [{ id: 'f1', type: 'frame', text: 'One', x: 0, y: 0, width: 400, height: 200 }] }
    expect(touchingGroupSiblings(same, 'a')).toEqual(['b'])
  })

  it('returns no siblings for an unknown cue', () => {
    expect(touchingGroupSiblings(groupPage(), 'missing')).toEqual([])
  })
})

describe('touching-button groups in the store (setLiveValue)', () => {
  const state = () => useShowStore.getState()
  const showWith = (page: LivePage): ShowDef => ({
    id: 'show-test',
    name: 'Test Show',
    createdAt: 0,
    updatedAt: 0,
    masterIntensity: 255,
    fixtures: [],
    cues: [],
    automations: [],
    livePages: [page]
  })

  beforeEach(() => {
    state().setShow(showWith(groupPage()))
    state().selectLivePage('page')
  })

  it('touching buttons are mutually exclusive', () => {
    state().setLiveValue('a', 255)
    expect(state().activeLiveValues.a).toBe(255)
    state().setLiveValue('b', 255)
    expect(state().activeLiveValues.b).toBe(255)
    expect(state().activeLiveValues.a).toBeUndefined()
    state().setLiveValue('d', 255)
    expect(state().activeLiveValues.d).toBe(255)
    expect(state().activeLiveValues.b).toBeUndefined()
  })

  it('separated buttons stay active at the same time', () => {
    state().setLiveValue('a', 255)
    state().setLiveValue('c', 255)
    expect(state().activeLiveValues).toEqual({ a: 255, c: 255 })
  })

  it('dragging a button away detaches it, so both can be active', () => {
    state().setLiveValue('a', 255)
    state().setLiveValue('b', 255)
    expect(state().activeLiveValues.a).toBeUndefined()
    // Drag b away from a (moveSelectedPageObjects is the drag commit).
    state().setPageObjectSelection([{ type: 'cue', id: 'b' }])
    state().moveSelectedPageObjects(240, 200)
    expect(state().show!.livePages![0].controls.find((c) => c.id === 'b')!.x).toBe(400)
    state().setLiveValue('a', 255)
    state().setLiveValue('b', 255)
    expect(state().activeLiveValues).toEqual({ a: 255, b: 255 })
  })

  it('dragging a button against another attaches it', () => {
    state().setLiveValue('a', 255)
    state().setLiveValue('c', 255)
    expect(state().activeLiveValues).toEqual({ a: 255, c: 255 })
    // Drag c under a until its top edge meets a's bottom edge (400,0 -> 0,90).
    state().setPageObjectSelection([{ type: 'cue', id: 'c' }])
    state().moveSelectedPageObjects(-400, 90)
    expect(state().show!.livePages![0].controls.find((c) => c.id === 'c')!.y).toBe(90)
    state().setLiveValue('c', 255)
    expect(state().activeLiveValues.c).toBe(255)
    expect(state().activeLiveValues.a).toBeUndefined()
  })

  it('turning a cue off does not release its group', () => {
    state().setLiveValue('a', 255)
    state().setLiveValue('b', 255)
    expect(state().activeLiveValues).toEqual({ b: 255 })
    state().setLiveValue('b', 0)
    expect(state().activeLiveValues.b).toBe(0)
  })
})
