import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { fixtureGroupMembers, fixtureGroupMenuCommands } from '../src/renderer/src/lib/fixtureGroups'
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

describe('fixtureGroupMenuCommands (Jake, 26 Nov 2026 — no Ungroup in the menu)', () => {
  const groups = [
    { id: 'group:Wash', name: 'Wash', parentId: null, fixtureIds: ['f1', 'f2'] },
    { id: 'group:Back', name: 'Back', parentId: null, fixtureIds: ['f3'] },
    { id: 'group:Ungrouped', name: 'Ungrouped', parentId: null, fixtureIds: ['f4'] }
  ]
  it('shows Group only for an empty or ungrouped selection', () => {
    expect(fixtureGroupMenuCommands(groups, [])).toEqual(['group'])
    expect(fixtureGroupMenuCommands(groups, ['f4'])).toEqual(['group'])
  })
  it('shows Ungroup only when every selected fixture is grouped', () => {
    expect(fixtureGroupMenuCommands(groups, ['f1'])).toEqual(['ungroup'])
    expect(fixtureGroupMenuCommands(groups, ['f1', 'f3'])).toEqual(['ungroup'])
  })
  it('shows both for a mixed selection', () => {
    expect(fixtureGroupMenuCommands(groups, ['f1', 'f4'])).toEqual(['group', 'ungroup'])
  })
})

describe('ungroupSelectedFixtures (Layout > Ungroup, Guide p.64)', () => {
  function twoGroupShow() {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [
      { id: 'f1', name: 'Wash 1', type: 'dimmer', channels: 1, channelStart: 1 },
      { id: 'f2', name: 'Wash 2', type: 'dimmer', channels: 1, channelStart: 2 },
      { id: 'f3', name: 'Back 1', type: 'dimmer', channels: 1, channelStart: 3 }
    ] }))
    // Groups made the canvas way (Group command), so the fixtures'
    // `group` fields are set as well as the records.
    state().selectFixtures(['f1', 'f2']); state().groupSelectedFixtures('Wash')
    state().selectFixtures(['f3']); state().groupSelectedFixtures('Back')
    const wash = state().show!.fixtureGroups!.find((g) => g.name === 'Wash')!.id
    const back = state().show!.fixtureGroups!.find((g) => g.name === 'Back')!.id
    return { state, wash, back }
  }
  it('dissolves the groups containing selected fixtures and keeps the selection', () => {
    const { state, wash, back } = twoGroupShow()
    state().selectFixtures(['f1', 'f2'])
    state().ungroupSelectedFixtures()
    expect(state().show!.fixtureGroups!.some((g) => g.id === wash)).toBe(false)
    expect(state().show!.fixtureGroups!.some((g) => g.id === back)).toBe(true)
    expect(state().show!.fixtures.find((f) => f.id === 'f1')!.group).toBe('Ungrouped')
    expect(state().show!.fixtures.find((f) => f.id === 'f3')!.group).toBe('Back')
    expect(state().selectedFixtureIds).toEqual(['f1', 'f2'])
  })
  it('is a no-op when no selected fixture is grouped', () => {
    const { state } = twoGroupShow()
    state().selectFixtures(['f3']); state().removeFixtureGroup(state().show!.fixtureGroups!.find((g) => g.name === 'Back')!.id)
    const before = structuredClone(state().show)
    state().ungroupSelectedFixtures()
    expect(state().show).toEqual(before)
  })
  it('reparents a surviving child group to the dissolved group\'s parent', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [
      { id: 'f1', name: 'A', type: 'dimmer', channels: 1, channelStart: 1 },
      { id: 'f2', name: 'B', type: 'dimmer', channels: 1, channelStart: 2 }
    ] }))
    state().selectFixtures(['f1']); const parent = state().createFixtureGroup('Parent')
    state().selectFixtures(['f2']); const child = state().createFixtureGroup('Child', parent)
    state().selectFixtures(['f1']); state().ungroupSelectedFixtures()
    expect(state().show!.fixtureGroups!.some((g) => g.id === parent)).toBe(false)
    expect(state().show!.fixtureGroups!.find((g) => g.id === child)!.parentId).toBeNull()
  })
})
