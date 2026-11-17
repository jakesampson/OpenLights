import { expect, it, vi } from 'vitest'
import { migrateShow } from '../src/shared/migrations'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { composeOutput } from '../src/renderer/src/lib/outputModel'
import { computeSceneChannels } from '../src/renderer/src/lib/automationRuntime'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
it('activating preserves overrides; Apply replaces only defined properties; Add overrides merges and undoes', () => {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({ fixtures: ['a', 'b'].map((id, i) => ({ id, name: id, type: 'par', channelStart: 1 + i * 4, channels: 4 })), presets: [{ id: 'p', name: 'P', category: 'color', fixtureValues: { a: { red: 100 }, b: { red: 120 } } }] }))
  s().selectFixtures(['a']); s().setManualOverrides({ red: 200, green: 60 }); s().togglePreset('p')
  const patch = (values: Record<string, Record<string, number>>) => computeSceneChannels(s().show!.fixtures, { id: '', name: '', fadeMs: 0, fixtureValues: values })
  expect(composeOutput({ presets: patch(s().presets[0].fixtureValues), overrides: patch(s().manualOverrides) })[2]).toBe(200)
  s().releaseManualOverrides(['a'], 'red'); expect(composeOutput({ presets: patch(s().presets[0].fixtureValues), overrides: patch(s().manualOverrides) })[2]).toBe(100)
  s().applyPresetsToOverrides(['p'], true); expect(s().manualOverrides).toEqual({ a: { red: 100, green: 60 } })
  s().setManualOverrides({ red: 180 }); s().addOverridesToPresets(['p'], true)
  expect(s().presets[0].fixtureValues).toEqual({ a: { red: 180, green: 60 }, b: { red: 120 } })
  s().undo(); expect(s().presets[0].fixtureValues.a).toEqual({ red: 100 })
})
