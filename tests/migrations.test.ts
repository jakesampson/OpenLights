import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { CURRENT_SCHEMA_VERSION, migrateShow } from '../src/shared/migrations'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())

describe('show schema version', () => {
  it('loads legacy show data without losing any existing content', () => {
    const original = structuredClone(useShowStore.getState().show!)
    delete original.schemaVersion
    useShowStore.getState().setShow(original)
    expect(useShowStore.getState().show).toEqual(migrateShow({ ...original, schemaVersion: CURRENT_SCHEMA_VERSION }))
  })
})

 describe('migration chain', () => {
  it('round trips and retains unknown content', () => {
    const raw = { ...useShowStore.getState().show!, extra: { untouched: [1, 2, 3] } }; delete raw.schemaVersion
    const once = migrateShow(raw)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
    expect((once as any).extra).toEqual(raw.extra)
  })
  it('fills absent arrays and invalid root values', () => {
    for (const raw of [null, undefined, 8, {}, { fixtures: 'invalid' }]) {
      const show = migrateShow(raw)
      expect(show.fixtures).toEqual([]); expect(show.scenes).toEqual([]); expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    }
  })
  it('warns without downgrading future files', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(migrateShow({ schemaVersion: 99, future: true }).schemaVersion).toBe(99)
    expect(warning).toHaveBeenCalled(); warning.mockRestore()
  })
})
