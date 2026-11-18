import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShowDef } from '../src/shared/types'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { startCuePlaybackClock } from '../src/renderer/src/lib/cuePlaybackClock'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('requestAnimationFrame', () => 1)
vi.stubGlobal('cancelAnimationFrame', () => {})
let stop: () => void
const show: ShowDef = { id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, fixtures: [], automations: [], cues: [
  { id: 'a', name: 'A', fadeMs: 0, fixtureValues: {} },
  { id: 'b', name: 'B', fadeMs: 0, fixtureValues: {} }
], cueLists: [{ id: 'list', name: 'List', steps: [
  { id: 'one', cueId: 'a', fadeMs: 0, holdMs: 1000 },
  { id: 'two', cueId: 'b', fadeMs: 0, holdMs: 0 }
] }] }
beforeEach(() => { vi.useFakeTimers(); useShowStore.getState().setShow(show); stop = startCuePlaybackClock() })
afterEach(() => { stop(); vi.useRealTimers() })
describe('cue playback clock', () => {
  it('advances while no cue editor is mounted', () => {
    useShowStore.getState().goToCue('list', 0)
    vi.advanceTimersByTime(1000)
    expect(useShowStore.getState().activeCueIndex).toBe(1)
  })
  it('restarts the hold when the same cue is recalled', () => {
    useShowStore.getState().goToCue('list', 0)
    vi.advanceTimersByTime(600)
    useShowStore.getState().goToCue('list', 0)
    vi.advanceTimersByTime(500)
    expect(useShowStore.getState().activeCueIndex).toBe(0)
    vi.advanceTimersByTime(500)
    expect(useShowStore.getState().activeCueIndex).toBe(1)
  })
  it('cancels a pending advance when playback stops', () => {
    useShowStore.getState().goToCue('list', 0)
    useShowStore.getState().stopCue()
    vi.advanceTimersByTime(2000)
    expect(useShowStore.getState().activeCueIndex).toBe(0)
  })
  it('cancels the old follow timer when jumping while a cue is active', () => {
    useShowStore.getState().goToCue('list', 0)
    vi.advanceTimersByTime(500)
    useShowStore.getState().goToCue('list', 1)
    vi.advanceTimersByTime(1000)
    expect(useShowStore.getState().activeCueIndex).toBe(1)
  })
  it('loops from the last cue when the list loops', () => {
    useShowStore.getState().updateCueList('list', { loop: true })
    useShowStore.getState().goToCue('list', 1)
    useShowStore.getState().cueNext()
    expect(useShowStore.getState().activeCueIndex).toBe(0)
  })
})
