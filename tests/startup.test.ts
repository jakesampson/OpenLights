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
    show.livePages = [{ id: 'page', name: 'Page', controls: [{ id: 'cue', name: 'Cue', type: 'toggle', presetIds: ['preset'] }] }]
    show.startup = { mode: 'none', presetIds: ['preset'], liveValues: { cue: 255 }, cueId: show.cues[0].id, pageId: 'page' }
    state().setShow(show); expect(state().activePresetIds).toEqual([]); expect(state().activeCueId).toBeNull(); expect(state().activeLiveValues).toEqual({})
    show.startup.mode = 'restore'; state().setShow(show)
    expect(state().activePresetIds).toEqual(['preset']); expect(state().activeLiveValues).toEqual({ cue: 255 }); expect(state().activeCueId).toBe(show.cues[0].id)
    state().setLiveValue('cue', 90)
    const saved = JSON.parse(JSON.stringify(state().showForSave()))
    state().setShow(saved); expect(state().activeLiveValues).toEqual({ cue: 90 }); expect(state().cuePlaying).toBe(false)
  })
})
