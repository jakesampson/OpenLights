import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
describe('pixel fixture beam selection', () => {
  it('programs only the selected cell and maps it to its own DMX channels', () => {
    const state = () => useShowStore.getState(); state().setShow(migrateShow({ fixtures: [{ id: 'bar', name: 'Bar', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }], cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { bar: { red: 10, intensity: 255 } } }] }))
    state().activateCue('s'); state().selectFixtureBeam('bar', 'cell-3'); state().updateSelectedBeamValues({ red: 200, green: 100, blue: 50 })
    const output = computeCueChannels(state().show!.fixtures, state().cues[0])
    expect(output[1]).toBe(10); expect(output[7]).toBe(200); expect(output[8]).toBe(100); expect(output[9]).toBe(50)
    state().updateSelectedBeamValues({ red: 120 }, true); expect(state().manualOverrides.bar.red3).toBe(120); expect(state().cues[0].fixtureValues.bar.red3).toBe(200)
  })
})
