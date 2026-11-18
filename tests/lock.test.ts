import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { FIXTURE_PRESETS } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
describe('operator lock', () => {
  it('rejects editing before output side effects while preserving live commands', () => {
    const state = () => useShowStore.getState()
    const before = structuredClone(state().show)
    state().lockApp('1234')
    state().addFixture(FIXTURE_PRESETS[0]); state().updateProject({ name: 'Blocked' }); state().updateCue(state().cues[0].id, { name: 'Blocked' }); state().setLivePages([]); state().undo()
    expect(state().show).toEqual(before)
    state().setLiveValue('cue', 255); expect(state().activeLiveValues.cue).toBe(255)
    state().activateCue(state().cues[0].id); expect(state().activeCueId).toBe(state().cues[0].id)
    expect(state().unlockApp('wrong')).toBe(false); expect(state().locked).toBe(true)
    expect(state().unlockApp('1234')).toBe(true)
    state().updateProject({ name: 'Editable' }); expect(state().show!.name).toBe('Editable')
  })
})
