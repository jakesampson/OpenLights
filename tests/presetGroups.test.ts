import { expect, it, vi } from 'vitest'
import { migrateShow } from '../src/shared/migrations'
import { useShowStore } from '../src/renderer/src/stores/showStore'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
it('migrates categories and supports nested exclusivity, reparenting and undo without losing presets', () => {
  const s = () => useShowStore.getState(), show = migrateShow({ presets: ['a', 'b', 'c'].map((id) => ({ id, name: id, category: 'color', fixtureValues: {} })) })
  expect(show.presetGroups![0].presetIds).toEqual(['a', 'b', 'c'])
  s().setShow(show); s().createPresetGroup('Parent'); const parent = s().show!.presetGroups!.at(-1)!.id
  s().createPresetGroup('Child', parent); const child = s().show!.presetGroups!.at(-1)!.id
  s().assignPresetGroup('a', parent); s().assignPresetGroup('b', child); s().updatePresetGroup(parent, { exclusive: true })
  s().togglePreset('c'); s().togglePreset('a'); s().togglePreset('b'); expect(s().activePresetIds).toEqual(['c', 'b'])
  s().updatePresetGroup(parent, { parentId: child }); expect(s().show!.presetGroups!.find((g) => g.id === parent)!.parentId).toBeNull()
  s().deletePresetGroup(child); expect(s().show!.presetGroups!.find((g) => g.id === parent)!.presetIds).toContain('b')
  s().undo(); expect(s().show!.presetGroups!.some((g) => g.id === child)).toBe(true)
  expect(migrateShow(s().show).presets).toHaveLength(3)
})
