import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
describe('fixture property copy and paste', () => {
  it('maps supported values across profiles and preserves unrelated properties', () => {
    const state = () => useShowStore.getState(); state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'RGB', type: 'par', channelStart: 1, channels: 4 }, { id: 'b', name: 'RGBW', type: 'rgbw-4ch', channelStart: 5, channels: 4 }], cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { a: { intensity: 255, red: 200, green: 200, blue: 200 } } }] }))
    state().activateCue('s'); state().selectFixtures(['a']); state().copyFixtureProperties(); state().selectFixtures(['b']); state().pasteFixtureProperties()
    // A paste defines overrides on the target (LightKey's real
    // Overrides) — the cue is untouched, and undo does not revert
    // session overrides.
    expect(state().manualOverrides.b).toEqual({ red: 0, green: 0, blue: 0, white: 200 })
    expect(state().cues[0].fixtureValues.b).toBeUndefined()
    state().undo(); expect(state().manualOverrides.b).toEqual({ red: 0, green: 0, blue: 0, white: 200 })
  })
  it('copies one selected property for the header property menu', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'Source', type: 'par', channelStart: 1, channels: 4 }, { id: 'b', name: 'Target', type: 'par', channelStart: 5, channels: 4 }], cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { a: { intensity: 255, red: 200, green: 100 }, b: { blue: 50 } } }] }))
    state().activateCue('s'); state().selectFixtures(['a']); state().copyFixtureProperties('red'); state().selectFixtures(['b']); state().pasteFixtureProperties()
    expect(state().manualOverrides.b).toEqual({ red: 200 })
    expect(state().cues[0].fixtureValues.b).toEqual({ blue: 50 })
  })
})
