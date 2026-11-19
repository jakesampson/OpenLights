import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import { migrateShow } from '../src/shared/migrations'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())
describe('fixture lifecycle', () => {
  it('duplicates values, disables output, removes preset/cue references and restores on undo', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'f', name: 'Dimmer', type: 'dimmer', channels: 1, channelStart: 1 }], cues: [{ id: 's', name: 'Cue', fadeMs: 0, fixtureValues: { f: { intensity: 200 } } }], presets: [{ id: 'p', name: 'Preset', category: 'intensity', fixtureValues: { f: { intensity: 100 } } }], livePages: [{ id: 'page', name: 'Page', controls: [{ id: 'cue', name: 'Cue', type: 'toggle', presetIds: [], adHocValues: { f: { intensity: 180 } } }] }] }))
    state().duplicateFixture('f'); expect(state().show!.fixtures).toHaveLength(2); expect(state().show!.fixtures[1].channelStart).toBe(2)
    state().updateFixture('f', { disabled: true }); expect(computeCueChannels(state().show!.fixtures, state().cues[0])[1]).toBe(0)
    state().removeFixture('f'); expect(state().presets[0].fixtureValues.f).toBeUndefined(); expect(state().show!.livePages![0].controls[0].adHocValues!.f).toBeUndefined()
    state().undo(); expect(state().presets[0].fixtureValues.f).toEqual({ intensity: 100 }); expect(state().show!.fixtures.some((f) => f.id === 'f')).toBe(true)
  })
})

it('reassigns RGB to RGBW without losing programmed colour values', () => {
 const state = () => useShowStore.getState()
 const rgb = BUILTIN_PROFILES.find((p) => p.legacyType === 'par')!, rgbw = BUILTIN_PROFILES.find((p) => p.legacyType === 'rgbw-4ch')!
 state().setShow(migrateShow({ fixtures: [{ id: 'f', name: 'Light', type: 'par', channels: 4, channelStart: 1, profile: rgb }], presets: [{ id: 'p', name: 'Colour', category: 'color', fixtureValues: { f: { intensity: 150, red: 255, green: 90, blue: 10 } } }] }))
 const original = structuredClone(state().presets[0].fixtureValues)
 state().reassignFixtureProfile('f', rgbw)
 expect(state().presets[0].fixtureValues).toEqual(original)
 // The stored intensity (150) becomes the virtual dimmer once the
 // fixture has no dimmer channel, so it scales the colour — the light
 // level the preset programmed is preserved, not lost (before the
 // virtual dimmer the intensity was dropped and the light went full).
 expect(computeCueChannels(state().show!.fixtures, { id: 's', name: 'S', fadeMs: 0, fixtureValues: original })).toEqual({ 1: 150, 2: 53, 3: 6 })
 state().undo(); expect(state().show!.fixtures[0].profile!.id).toBe(rgb.id)
})
