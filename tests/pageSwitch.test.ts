import { describe, expect, it } from 'vitest'
import { prunePageValues, switchLivePage, type PageSwitchState } from '../src/renderer/src/lib/pageSwitch'

const initial = (): PageSwitchState => ({
  activeLivePageId: 'a',
  activeLiveValues: { c1: 200, c2: 90 },
  pageActiveValues: {}
})

describe('Live page active-state switching (7.2)', () => {
  it('remembers the outgoing page and restores the incoming page by default', () => {
    const switched = switchLivePage(initial(), 'b')
    expect(switched.activeLivePageId).toBe('b')
    expect(switched.activeLiveValues).toEqual({})
    expect(switched.pageActiveValues.a).toEqual({ c1: 200, c2: 90 })

    const returned = switchLivePage(switched, 'a')
    expect(returned.activeLiveValues).toEqual({ c1: 200, c2: 90 })
    expect(returned.pageActiveValues.b).toEqual({})
    expect(initial().activeLiveValues).toEqual({ c1: 200, c2: 90 }) // input untouched
  })

  it('restores a page that was previously left, not an empty set', () => {
    let state = switchLivePage(initial(), 'b', false)
    state = { ...state, activeLiveValues: { c3: 60 } }
    state = switchLivePage(state, 'a')
    expect(state.activeLiveValues).toEqual({ c1: 200, c2: 90 })
    state = switchLivePage(state, 'b')
    expect(state.activeLiveValues).toEqual({ c3: 60 })
  })

  it('releases and forgets levels when deactivate-on-switch is set', () => {
    const switched = switchLivePage(initial(), 'b', true)
    expect(switched.activeLiveValues).toEqual({})
    expect(switched.pageActiveValues.a).toBeUndefined()
    expect(switchLivePage(switched, 'a', true).activeLiveValues).toEqual({})
  })

  it('is a no-op when selecting the current page', () => {
    const state = initial()
    expect(switchLivePage(state, 'a')).toBe(state)
  })

  it('clears active cues when switching to no page but remembers the outgoing page', () => {
    const switched = switchLivePage(initial(), null)
    expect(switched.activeLivePageId).toBeNull()
    expect(switched.activeLiveValues).toEqual({})
    expect(switched.pageActiveValues.a).toEqual({ c1: 200, c2: 90 })
  })

  it('prunes remembered levels for deleted pages', () => {
    const values = { a: { c1: 1 }, b: { c2: 2 }, gone: { c3: 3 } }
    expect(prunePageValues(values, ['a', 'b'])).toEqual({ a: { c1: 1 }, b: { c2: 2 } })
    expect(values.gone).toEqual({ c3: 3 })
  })
})
