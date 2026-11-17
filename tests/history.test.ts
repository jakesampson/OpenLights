import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { FIXTURE_PRESETS } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
vi.stubGlobal('cancelAnimationFrame', vi.fn())
const initial = structuredClone(useShowStore.getState().show!)
const store = () => useShowStore.getState()
beforeEach(() => store().setShow(structuredClone(initial)))
const roundTrip = (action: () => void) => {
  const before = structuredClone(store().show)
  action()
  const after = structuredClone(store().show)
  expect(after).not.toEqual(before)
  store().undo(); expect(store().show).toEqual(before)
  store().redo(); expect(store().show).toEqual(after)
}
describe('programming history', () => {
  it('undoes fixture additions and removals', () => {
    roundTrip(() => store().addFixture(FIXTURE_PRESETS[0], 'New fixture'))
    roundTrip(() => store().removeFixture(store().show!.fixtures[0].id))
  })
  it('undoes preset capture, rename and deletion', () => {
    store().goToScene(initial.scenes[0].id); store().selectFixtures([initial.fixtures[0].id])
    roundTrip(() => store().capturePreset('Captured', 'color'))
    const id = store().presets[0].id
    roundTrip(() => store().renamePreset(id, 'Renamed'))
    roundTrip(() => store().deletePreset(id))
  })
  it('undoes cue steps and live page object edits', () => {
    const list = store().cueLists[0].id
    roundTrip(() => store().addCueStep(list))
    const step = store().cueLists[0].steps.at(-1)!.id
    roundTrip(() => store().moveCueStep(list, step, -1))
    roundTrip(() => store().removeCueStep(list, step))
    roundTrip(() => store().setLivePages([{ id: 'p', name: 'Page', controls: [] }]))
    roundTrip(() => store().setLivePages([...store().show!.livePages!, { id: 'copy', name: 'Copy', controls: [] }]))
    roundTrip(() => store().setLivePages([{ id: 'p', name: 'Page', controls: [{ id: 'c', name: 'Cue', type: 'toggle', presetIds: [], x: 20, y: 20 }] }]))
    roundTrip(() => store().setLivePages([{ ...store().show!.livePages![0], controls: [{ ...store().show!.livePages![0].controls[0], x: 90 }] }]))
    roundTrip(() => store().setLivePages([]))
  })
  it('groups continuous changes, caps history and excludes live playback', () => {
    store().beginHistoryGroup()
    for (let n = 0; n < 20; n++) store().updateFixture(initial.fixtures[0].id, { name: `Fixture ${n}` })
    store().endHistoryGroup(); expect(store().undoStack).toHaveLength(1)
    store().selectLivePage('p'); store().goToCue(store().cueLists[0].id, 0)
    expect(store().undoStack).toHaveLength(1)
    for (let n = 0; n < 210; n++) store().updateFixture(initial.fixtures[0].id, { name: `Other ${n}` })
    expect(store().undoStack).toHaveLength(200)
  })
})
