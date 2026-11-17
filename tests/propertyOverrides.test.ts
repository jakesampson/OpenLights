import { expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { composeOutput } from '../src/renderer/src/lib/outputModel'
import { computeSceneChannels } from '../src/renderer/src/lib/automationRuntime'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
it('releases one property, a selection or all overrides and falls back to programmed output', () => {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({ fixtures: ['a', 'b'].map((id, i) => ({ id, type: 'par', channelStart: 1 + i * 4, channels: 4 })) }))
  s().selectFixtures(['a', 'b']); s().setManualOverrides({ intensity: 220, red: 180 })
  s().releaseManualOverrides(['a'], 'intensity')
  expect(s().manualOverrides).toEqual({ a: { red: 180 }, b: { intensity: 220, red: 180 } })
  const overrides = computeSceneChannels(s().show!.fixtures, { id: '', name: '', fadeMs: 0, fixtureValues: s().manualOverrides })
  expect(composeOutput({ base: { 1: 50 }, overrides })[1]).toBe(50)
  s().releaseManualOverrides(['a']); expect(s().manualOverrides.a).toBeUndefined()
  s().releaseManualOverrides(); expect(s().manualOverrides).toEqual({})
})
