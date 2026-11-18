import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import {
  applyPageCommand,
  duplicateLivePage,
  pageManagerVisible,
  uniquePageName,
  viewSwitchSegments,
  type PageSelection
} from '../src/renderer/src/lib/viewSwitch'

const page = (id: string, name: string): LivePage => ({ id, name, controls: [] })

describe('view switch and Live page manager (2.4a)', () => {
  it('highlights the Design segment only in Design view, and Live otherwise', () => {
    expect(viewSwitchSegments('Design')).toEqual({ design: true, live: false })
    expect(viewSwitchSegments('Live')).toEqual({ design: false, live: true })
    expect(viewSwitchSegments('Edit')).toEqual({ design: false, live: true })
  })

  it('exposes the page dropdown only while Live is active and it is open', () => {
    expect(pageManagerVisible('Live', true)).toBe(true)
    expect(pageManagerVisible('Live', false)).toBe(false)
    expect(pageManagerVisible('Design', true)).toBe(false)
    expect(pageManagerVisible('Edit', true)).toBe(false)
  })

  describe('applyPageCommand', () => {
    const pages = [page('a', 'Alpha'), page('b', 'Beta'), page('c', 'Gamma')]
    const state: PageSelection = { pages, activeId: 'a' }

    it('selects an existing page without touching the page list', () => {
      const next = applyPageCommand(state, { type: 'select', id: 'b' })
      expect(next.activeId).toBe('b')
      expect(next.pages).toBe(pages)
      expect(state.activeId).toBe('a')
    })

    it('ignores a selection for a page that does not exist', () => {
      expect(applyPageCommand(state, { type: 'select', id: 'missing' })).toBe(state)
    })

    it('adds a page and makes it active without mutating the input', () => {
      const next = applyPageCommand(state, { type: 'add', id: 'd', name: ' Delta ' })
      expect(next.pages.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
      expect(next.pages[3].name).toBe('Delta')
      expect(next.activeId).toBe('d')
      expect(pages).toHaveLength(3)
    })

    it('uses a fallback name for a blank new page and rejects duplicate ids', () => {
      expect(applyPageCommand(state, { type: 'add', id: 'd', name: '   ' }).pages[3].name).toBe('Untitled page')
      expect(applyPageCommand(state, { type: 'add', id: 'a', name: 'Dup' })).toBe(state)
    })

    it('renames a page immutably and ignores unknown ids', () => {
      const next = applyPageCommand(state, { type: 'rename', id: 'b', name: 'Beta 2' })
      expect(next.pages.map((p) => p.name)).toEqual(['Alpha', 'Beta 2', 'Gamma'])
      expect(next.pages[1]).not.toBe(pages[1])
      expect(pages[1].name).toBe('Beta')
      expect(next.activeId).toBe('a')
      expect(applyPageCommand(state, { type: 'rename', id: 'missing', name: 'x' })).toBe(state)
    })

    it('reorders pages in both directions and keeps the active id', () => {
      const down = applyPageCommand(state, { type: 'move', id: 'a', direction: 1 })
      expect(down.pages.map((p) => p.id)).toEqual(['b', 'a', 'c'])
      expect(down.activeId).toBe('a')
      const up = applyPageCommand(state, { type: 'move', id: 'c', direction: -1 })
      expect(up.pages.map((p) => p.id)).toEqual(['a', 'c', 'b'])
      expect(pages.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    })

    it('does not move a page past either end of the list', () => {
      expect(applyPageCommand(state, { type: 'move', id: 'a', direction: -1 })).toBe(state)
      expect(applyPageCommand(state, { type: 'move', id: 'c', direction: 1 })).toBe(state)
      expect(applyPageCommand(state, { type: 'move', id: 'missing', direction: 1 })).toBe(state)
    })

    it('moves a page to an arbitrary index, clamped, and ignores no-ops', () => {
      const next = applyPageCommand(state, { type: 'moveTo', id: 'a', index: 2 })
      expect(next.pages.map((p) => p.id)).toEqual(['b', 'c', 'a'])
      expect(next.activeId).toBe('a')
      expect(applyPageCommand(state, { type: 'moveTo', id: 'a', index: 99 }).pages.map((p) => p.id)).toEqual(['b', 'c', 'a'])
      expect(applyPageCommand(state, { type: 'moveTo', id: 'a', index: -5 }).pages.map((p) => p.id)).toEqual(['a', 'b', 'c'])
      expect(applyPageCommand(state, { type: 'moveTo', id: 'a', index: 0 })).toBe(state)
      expect(applyPageCommand(state, { type: 'moveTo', id: 'missing', index: 1 })).toBe(state)
    })

    it('deletes a page and moves the active id to the first remaining page', () => {
      const next = applyPageCommand(state, { type: 'delete', id: 'a' })
      expect(next.pages.map((p) => p.id)).toEqual(['b', 'c'])
      expect(next.activeId).toBe('b')
      const other = applyPageCommand(state, { type: 'delete', id: 'c' })
      expect(other.pages.map((p) => p.id)).toEqual(['a', 'b'])
      expect(other.activeId).toBe('a')
      expect(applyPageCommand(state, { type: 'delete', id: 'missing' })).toBe(state)
    })

    it('deleting the last page leaves an empty list with no active page', () => {
      const only: PageSelection = { pages: [page('a', 'Alpha')], activeId: 'a' }
      const next = applyPageCommand(only, { type: 'delete', id: 'a' })
      expect(next.pages).toEqual([])
      expect(next.activeId).toBeNull()
    })

    it('duplicates a page with fresh ids and remapped attachments, after the source', () => {
      const rich: LivePage = {
        id: 'a',
        name: 'Alpha',
        controls: [
          { id: 'c1', name: 'One', type: 'toggle', presetIds: [], x: 0, y: 0 },
          { id: 'c2', name: 'Two', type: 'toggle', presetIds: [], x: 160, y: 0, attachedTo: 'c1' }
        ],
        cueListWidgets: [{ id: 'w1', cueListId: 'list', x: 0, y: 100, attachedTo: 'c1' }],
        annotations: [{ id: 'f1', type: 'frame', text: 'Frame', x: 0, y: 0, width: 320, height: 90 }]
      }
      const copy = duplicateLivePage(rich, 'a-copy', 'Alpha copy')
      expect(copy.id).toBe('a-copy')
      expect(copy.name).toBe('Alpha copy')
      expect(copy.controls.map((c) => c.id)).not.toContain('c1')
      expect(copy.controls).toHaveLength(2)
      expect(copy.controls[1].attachedTo).toBe(copy.controls[0].id)
      expect(copy.cueListWidgets![0].attachedTo).toBe(copy.controls[0].id)
      expect(copy.cueListWidgets![0].cueListId).toBe('list')
      expect(rich.controls[1].attachedTo).toBe('c1')

      const next = applyPageCommand({ pages: [rich, page('b', 'Beta')], activeId: 'b' }, { type: 'duplicate', id: 'a', newId: 'a-copy', name: 'Alpha copy' })
      expect(next.pages.map((p) => p.id)).toEqual(['a', 'a-copy', 'b'])
      expect(next.activeId).toBe('a-copy')
      expect(applyPageCommand(state, { type: 'duplicate', id: 'missing', newId: 'x', name: 'x' })).toBe(state)
      expect(applyPageCommand(state, { type: 'duplicate', id: 'a', newId: 'b', name: 'x' })).toBe(state)
    })

    it('sets a page fade time, clamped at zero, and ignores unknown ids', () => {
      const next = applyPageCommand(state, { type: 'setFade', id: 'b', fadeMs: 300 })
      expect(next.pages[1].fadeMs).toBe(300)
      expect(pages[1].fadeMs).toBeUndefined()
      expect(applyPageCommand(state, { type: 'setFade', id: 'b', fadeMs: -50 }).pages[1].fadeMs).toBe(0)
      expect(applyPageCommand(state, { type: 'setFade', id: 'missing', fadeMs: 300 })).toBe(state)
    })

    it('adds a cuelist page with a cue-list widget, and a plain page without one', () => {
      const next = applyPageCommand(state, { type: 'add', id: 'd', name: 'Cuelist', kind: 'cuelist', fadeMs: 300, cueListId: 'list', widgetId: 'w' })
      expect(next.pages[3].kind).toBe('cuelist')
      expect(next.pages[3].fadeMs).toBe(300)
      expect(next.pages[3].cueListWidgets).toEqual([{ id: 'w', cueListId: 'list', x: 20, y: 20 }])
      expect(next.activeId).toBe('d')
      const plain = applyPageCommand(state, { type: 'add', id: 'd', name: 'New Page', kind: 'page' })
      expect(plain.pages[3].kind).toBe('page')
      expect(plain.pages[3].cueListWidgets).toBeUndefined()
      const noList = applyPageCommand(state, { type: 'add', id: 'd', name: 'Cuelist', kind: 'cuelist' })
      expect(noList.pages[3].cueListWidgets).toBeUndefined()
    })

    it('picks a non-colliding page name', () => {
      expect(uniquePageName(pages, 'New Page')).toBe('New Page')
      expect(uniquePageName(pages, 'Alpha')).toBe('Alpha 2')
      expect(uniquePageName([...pages, page('d', 'Alpha 2')], 'Alpha')).toBe('Alpha 3')
    })
  })
})
