import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
vi.stubGlobal('cancelAnimationFrame', vi.fn())
describe('project startup state', () => {
  it('defaults to no looks, and restores a saved cue, page cues and presets only when enabled', () => {
    const state = () => useShowStore.getState()
    const show = structuredClone(state().show!)
    show.presets = [{ id: 'preset', name: 'Red', category: 'color', fixtureValues: {} }]
    show.livePages = [{ id: 'page', name: 'Page', controls: [{ id: 'cue', name: 'Cue', type: 'push', cueId: show.cues[0].id, presetIds: ['preset'] }] }]
    show.startup = { mode: 'none', presetIds: ['preset'], liveValues: { cue: 255 }, cueId: show.cues[0].id, pageId: 'page' }
    state().setShow(show); expect(state().activePresetIds).toEqual([]); expect(state().activeCueId).toBeNull(); expect(state().activeLiveValues).toEqual({})
    show.startup.mode = 'restore'; state().setShow(show)
    expect(state().activePresetIds).toEqual(['preset']); expect(state().activeLiveValues).toEqual({ cue: 255 }); expect(state().activeCueId).toBe(show.cues[0].id)
    state().setLiveValue('cue', 90)
    const saved = JSON.parse(JSON.stringify(state().showForSave()))
    state().setShow(saved); expect(state().activeLiveValues).toEqual({ cue: 90 }); expect(state().cuePlaying).toBe(false)
  })

  it('restore only brings back the visible page: hidden-page buttons and orphan cues stay off (Jake, 27 Nov 2026)', () => {
    const state = () => useShowStore.getState()
    const show = structuredClone(state().show!)
    show.cues = [
      { id: 'cue-visible', name: 'Visible Cue', presetIds: [], fixtureValues: {}, fadeMs: 0 },
      { id: 'cue-orphan', name: 'Orphan', presetIds: [], fixtureValues: {}, fadeMs: 0 },
    ]
    show.presets = [{ id: 'preset', name: 'Full On', category: 'intensity', fixtureValues: {} }]
    show.livePages = [
      { id: 'page-visible', name: 'Visible', controls: [{ id: 'btn-visible', name: 'Visible Cue', type: 'push', cueId: 'cue-visible', presetIds: [] }] },
      { id: 'page-hidden', name: 'Hidden', controls: [{ id: 'btn-fullon', name: 'Full On', type: 'push', presetIds: ['preset'] }] },
    ]
    // An orphan cue was active and the hidden page's Full On button was
    // lit at the last save — neither may come back driving the rig.
    show.startup = { mode: 'restore', presetIds: [], liveValues: { 'btn-visible': 255, 'btn-fullon': 255 }, cueId: 'cue-orphan', pageId: 'page-visible' }
    state().setShow(show)
    expect(state().activeLivePageId).toBe('page-visible')
    expect(state().activeLiveValues).toEqual({ 'btn-visible': 255 })
    expect(state().activeCueId).toBeNull()
    // A cue pointed at by a lit button on the visible page still restores.
    show.startup = { mode: 'restore', presetIds: [], liveValues: { 'btn-visible': 255 }, cueId: 'cue-visible', pageId: 'page-visible' }
    state().setShow(show)
    expect(state().activeLiveValues).toEqual({ 'btn-visible': 255 })
    expect(state().activeCueId).toBe('cue-visible')
    // And a lit button on the visible page does not resurrect a cue it
    // does not point at.
    show.startup = { mode: 'restore', presetIds: [], liveValues: { 'btn-visible': 255 }, cueId: 'cue-orphan', pageId: 'page-visible' }
    state().setShow(show)
    expect(state().activeCueId).toBeNull()
  })
})
