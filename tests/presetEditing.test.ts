import { expect, it, vi } from 'vitest'
import { migrateShow } from '../src/shared/migrations'
import { useShowStore, findInlineCue } from '../src/renderer/src/stores/showStore'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
it('updates a preset from selected current properties, removes a property/fixture and supports undo', () => {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({ fixtures: ['a', 'b'].map((id, i) => ({ id, name: id, type: 'par', channelStart: 1 + i * 4, channels: 4 })), cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { a: { intensity: 255, red: 100, blue: 50 }, b: { red: 120 } } }], livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'S', type: 'push', cueId: 's', presetIds: [] }] }], presets: [{ id: 'p', name: 'Colour', category: 'color', fixtureValues: { a: { red: 1 }, b: { red: 2 } } }] }))
  s().activateCue('s'); s().selectFixtures(['a']); s().setManualOverrides({ red: 180 }); s().updatePresetFromCurrent('p')
  expect(s().presets[0].fixtureValues).toEqual({ a: { red: 180, blue: 50 }, b: { red: 2 } })
  s().removePresetProperty('p', 'a', 'blue'); expect(s().presets[0].fixtureValues.a).toEqual({ red: 180 })
  s().undo(); expect(s().presets[0].fixtureValues.a.blue).toBe(50)
  s().removePresetProperty('p', 'b'); expect(s().presets[0].fixtureValues.b).toBeUndefined()
  expect(findInlineCue(s().show, s().cueLists, 's')!.cue.fixtureValues.a.red).toBe(100)
})
