import { describe, expect, it, vi } from 'vitest'
import { useShowStore, collectInlineCues, activeCueId } from '../src/renderer/src/stores/showStore'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
vi.stubGlobal('cancelAnimationFrame', vi.fn())
describe('project startup state', () => {
  it('defaults to no looks, and restores a saved cue, page cues and presets only when enabled', () => {
    const state = () => useShowStore.getState()
    const show = structuredClone(state().show!)
    show.presets = [{ id: 'preset', name: 'Red', category: 'color', fixtureValues: {} }]
    // The saved cue lives inline on its button (Jake, 27 Nov 2026 —
    // inline cues): the startup cue id names that button's cue.
    const savedCue = collectInlineCues(show, show.cueLists ?? [])[0]
    const cueId = savedCue?.id ?? 'cue'
    const cue = savedCue ?? { id: cueId, name: 'Cue', presetIds: [], sequenceIds: [], fadeMs: 0, fixtureValues: {} }
    show.livePages = [{ id: 'page', name: 'Page', controls: [{ id: 'cue', name: 'Cue', type: 'push', cue, presetIds: ['preset'] }] }]
    show.startup = { mode: 'none', presetIds: ['preset'], liveValues: { cue: 255 }, cueId, pageId: 'page' }
    state().setShow(show); expect(state().activePresetIds).toEqual([]); expect(activeCueId(state())).toBeNull(); expect(state().activeLiveValues).toEqual({})
    show.startup.mode = 'restore'; state().setShow(show)
    expect(state().activePresetIds).toEqual(['preset']); expect(state().activeLiveValues).toEqual({ cue: 255 }); expect(activeCueId(state())).toBe(cueId)
    state().setLiveValue('cue', 90)
    const saved = JSON.parse(JSON.stringify(state().showForSave()))
    state().setShow(saved); expect(state().activeLiveValues).toEqual({ cue: 90 }); expect(state().cuePlaying).toBe(false)
  })

  it('restore only brings back the visible page: hidden-page buttons and orphan cues stay off (Jake, 27 Nov 2026)', () => {
    const state = () => useShowStore.getState()
    const show = structuredClone(state().show!)
    // Only the visible cue exists, inline on its button; the orphan
    // cue has no holder at all, so it cannot exist in the inline
    // model — the startup id naming it is a dangling reference that
    // must resolve to nothing.
    show.presets = [{ id: 'preset', name: 'Full On', category: 'intensity', fixtureValues: {} }]
    show.livePages = [
      { id: 'page-visible', name: 'Visible', controls: [{ id: 'btn-visible', name: 'Visible Cue', type: 'push', cue: { id: 'cue-visible', name: 'Visible Cue', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }, presetIds: [] }] },
      { id: 'page-hidden', name: 'Hidden', controls: [{ id: 'btn-fullon', name: 'Full On', type: 'push', presetIds: ['preset'] }] },
    ]
    // An orphan cue was active and the hidden page's Full On button was
    // lit at the last save — neither may come back driving the rig.
    show.startup = { mode: 'restore', presetIds: [], liveValues: { 'btn-visible': 255, 'btn-fullon': 255 }, cueId: 'cue-orphan', pageId: 'page-visible' }
    state().setShow(show)
    expect(state().activeLivePageId).toBe('page-visible')
    expect(state().activeLiveValues).toEqual({ 'btn-visible': 255 })
    expect(activeCueId(state())).toBeNull()
    // A cue pointed at by a lit button on the visible page still restores.
    show.startup = { mode: 'restore', presetIds: [], liveValues: { 'btn-visible': 255 }, cueId: 'cue-visible', pageId: 'page-visible' }
    state().setShow(show)
    expect(state().activeLiveValues).toEqual({ 'btn-visible': 255 })
    expect(activeCueId(state())).toBe('cue-visible')
    // And a lit button on the visible page does not resurrect a cue it
    // does not point at.
    show.startup = { mode: 'restore', presetIds: [], liveValues: { 'btn-visible': 255 }, cueId: 'cue-orphan', pageId: 'page-visible' }
    state().setShow(show)
    expect(activeCueId(state())).toBeNull()
  })
})
