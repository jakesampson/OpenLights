import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { FIXTURE_PRESETS } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())
describe('fixture storage', () => {
  it('places new fixtures in storage and moving onto the stage assigns a position', () => {
    const state = () => useShowStore.getState(); state().setShow(migrateShow({}))
    state().addFixture(FIXTURE_PRESETS[0], 'Stored')
    const fixture = state().show!.fixtures[0]
    expect(fixture.inStorage).toBe(true)
    state().setFixturePosition(fixture.id, { x: 100, y: 90 })
    expect(state().show!.fixtures[0]).toMatchObject({ inStorage: false, previewPosition: { x: 100, y: 90 } })
    state().updateFixture(fixture.id, { inStorage: true }); state().undo(); expect(state().show!.fixtures[0].inStorage).toBe(false)
    expect(migrateShow({ fixtures: [{ id: 'legacy' }] }).fixtures[0].inStorage).toBe(false)
  })
})
