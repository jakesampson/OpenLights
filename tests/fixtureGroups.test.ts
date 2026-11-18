import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { fixtureGroupMembers } from '../src/renderer/src/lib/fixtureGroups'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn())
describe('nested fixture groups', () => {
  it('supports create, rename, reparent, reorder, select membership, delete and undo', () => {
    const state = () => useShowStore.getState(); state().setShow(migrateShow({ fixtures: [{ id: 'f', name: 'Light', type: 'dimmer', channels: 1, channelStart: 1 }] }))
    state().selectFixtures(['f']); const parent = state().createFixtureGroup('Parent'), child = state().createFixtureGroup('Child', parent), other = state().createFixtureGroup('Other')
    state().renameFixtureGroup(child, 'Renamed'); expect(state().show!.fixtureGroups!.find((g) => g.id === child)!.name).toBe('Renamed')
    expect(fixtureGroupMembers(state().show!.fixtureGroups!, parent)).toEqual(['f'])
    state().parentFixtureGroup(parent, child); expect(state().show!.fixtureGroups!.find((g) => g.id === parent)!.parentId).toBeNull()
    state().parentFixtureGroup(child, null); expect(state().show!.fixtureGroups!.find((g) => g.id === child)!.parentId).toBeNull()
    state().moveFixtureGroup(other, -1); expect(state().show!.fixtureGroups!.at(-1)!.id).toBe(child)
    const before = structuredClone(state().show); state().removeFixtureGroup(parent); expect(state().show!.fixtureGroups!.some((g) => g.id === parent)).toBe(false); state().undo(); expect(state().show).toEqual(before)
  })
})
