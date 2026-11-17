import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import {
  applyPageCommand,
  pageManagerVisible,
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
  })
})
