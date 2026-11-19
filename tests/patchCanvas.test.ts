import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import { instancePositions } from '../src/renderer/src/lib/previewLayout'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())

const pars = BUILTIN_PROFILES.find((profile) => profile.id === 'par-rgb') ?? BUILTIN_PROFILES[0]
const heads = BUILTIN_PROFILES.find((profile) => profile.id === 'head-8ch') ?? BUILTIN_PROFILES[0]

function freshState() {
  const state = () => useShowStore.getState()
  state().setShow(migrateShow({}))
  return state
}

describe('patched fixtures land on the Preview canvas', () => {
  it('patches onto the canvas in a row, not into storage, with the appear marker', () => {
    const state = freshState()
    state().addProfileFixtures(pars, { quantity: 4, start: 1 })
    const fixtures = state().show!.fixtures
    expect(fixtures).toHaveLength(4)
    for (const f of fixtures) expect(f.inStorage).toBe(false)
    expect(fixtures.map((f) => f.previewPosition)).toEqual([
      { x: 286, y: 170 },
      { x: 362, y: 170 },
      { x: 438, y: 170 },
      { x: 514, y: 170 }
    ])
    expect(state().newFixtureIds).toEqual(fixtures.map((f) => f.id))
    state().clearNewFixtureIds()
    expect(state().newFixtureIds).toEqual([])
  })

  it('gives each Count instance its own position on one address', () => {
    const state = freshState()
    state().addProfileFixtures(pars, { quantity: 1, start: 1, count: 3 })
    const [trio] = state().show!.fixtures
    expect(trio.count).toBe(3)
    expect(trio.channelStart).toBe(1)
    expect(trio.inStorage).toBe(false)
    expect(instancePositions(trio)).toEqual([
      { x: 324, y: 170 },
      { x: 400, y: 170 },
      { x: 476, y: 170 }
    ])
  })

  it('lands a later batch in a row above the first', () => {
    const state = freshState()
    state().addProfileFixtures(heads, { quantity: 6, start: 1 })
    state().addProfileFixtures(pars, { quantity: 4, start: 49 })
    const fixtures = state().show!.fixtures
    const headY = new Set(fixtures.slice(0, 6).map((f) => f.previewPosition!.y))
    const parY = new Set(fixtures.slice(6).map((f) => f.previewPosition!.y))
    expect(headY).toEqual(new Set([170]))
    expect(parY).toEqual(new Set([120]))
    expect(fixtures.slice(6).map((f) => f.previewPosition!.x)).toEqual([210, 286, 362, 438])
  })

  it('moves one Count instance without moving its siblings', () => {
    const state = freshState()
    state().addProfileFixtures(pars, { quantity: 1, start: 1, count: 3 })
    const [trio] = state().show!.fixtures
    state().setFixtureInstancePositions({ [`${trio.id}:1`]: { x: 500, y: 200 } })
    const after = state().show!.fixtures[0]
    expect(instancePositions(after)).toEqual([
      { x: 324, y: 170 },
      { x: 500, y: 200 },
      { x: 476, y: 170 }
    ])
    expect(after.previewPosition).toEqual({ x: 324, y: 170 })
  })

  it('placing a stored Count fixture back on the canvas keeps its instances together', () => {
    const state = freshState()
    state().addProfileFixtures(pars, { quantity: 1, start: 1, count: 3 })
    const [trio] = state().show!.fixtures
    state().updateFixture(trio.id, { inStorage: true })
    state().setFixturePosition(trio.id, { x: 100, y: 100 })
    const after = state().show!.fixtures[0]
    expect(after.inStorage).toBe(false)
    expect(instancePositions(after)).toEqual([
      { x: 100, y: 100 },
      { x: 176, y: 100 },
      { x: 252, y: 100 }
    ])
  })

  it('a duplicate of a placed fixture carries no canvas position', () => {
    const state = freshState()
    state().addProfileFixtures(pars, { quantity: 1, start: 1, count: 2 })
    const [original] = state().show!.fixtures
    state().duplicateFixture(original.id)
    const copy = state().show!.fixtures[1]
    expect(copy.inStorage).toBe(true)
    expect(copy.previewPosition).toBeUndefined()
    expect(copy.previewPositions).toBeUndefined()
  })
})
