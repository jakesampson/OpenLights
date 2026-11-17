import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { CURRENT_SCHEMA_VERSION, migrateShow } from '../src/shared/migrations'
import { LIVE_CUE_SIZE, LIVE_LIST_SIZE } from '../src/shared/liveObjectDefaults'
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

describe('live page object size migration (7.6)', () => {
  const legacyShow = () => ({
    ...useShowStore.getState().show!,
    livePages: [{
      id: 'p',
      name: 'Page',
      controls: [
        { id: 'c1', name: 'Legacy cue', type: 'toggle', presetIds: [], x: 20, y: 20 },
        { id: 'c2', name: 'Sized cue', type: 'flash', presetIds: [], x: 100, y: 20, width: 300, height: 60 }
      ],
      cueListWidgets: [{ id: 'w1', cueListId: 'list', x: 20, y: 120 }],
      annotations: [{ id: 'a1', type: 'label', text: 'Legacy label', x: 300, y: 200, width: 200, height: 40 }]
    }]
  })

  it('fills default sizes for legacy cues and widgets, preserving existing sizes', () => {
    const show: any = migrateShow(legacyShow())
    const page = show.livePages[0]
    expect(page.controls[0]).toMatchObject(LIVE_CUE_SIZE)
    expect(page.controls[1]).toMatchObject({ width: 300, height: 60 })
    expect(page.cueListWidgets[0]).toMatchObject(LIVE_LIST_SIZE)
    expect(page.annotations[0]).toMatchObject({ width: 200, height: 40 })
  })

  it('does not bump schemaVersion and is idempotent', () => {
    const once: any = migrateShow(legacyShow())
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})
