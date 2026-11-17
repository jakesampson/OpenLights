import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { CURRENT_SCHEMA_VERSION, migrateShow } from '../src/shared/migrations'
import { DEFAULT_OBJECT_STYLES, LIVE_CUE_SIZE, LIVE_LIST_SIZE } from '../src/shared/liveObjectDefaults'
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

describe('live object style migration (7.8)', () => {
  const styleShow = () => ({
    ...useShowStore.getState().show!,
    livePages: [{
      id: 'p',
      name: 'Page',
      defaultStyles: { label: { fontSize: 30 } },
      controls: [{ id: 'c1', name: 'Cue', type: 'toggle', presetIds: [], x: 20, y: 20 }],
      annotations: [
        { id: 'l1', type: 'label', text: 'Old', x: 20, y: 100, width: 160, height: 40 },
        { id: 'f1', type: 'frame', text: 'Old frame', x: 20, y: 200, width: 200, height: 100, style: { italic: true } }
      ]
    }]
  })

  it('fills built-in and page-default styles while keeping existing style fields', () => {
    const show: any = migrateShow(styleShow())
    const page = show.livePages[0]
    expect(page.controls[0].style).toEqual(DEFAULT_OBJECT_STYLES.cue)
    expect(page.annotations[0].style).toEqual({ ...DEFAULT_OBJECT_STYLES.label, ...page.defaultStyles.label })
    expect(page.annotations[1].style).toEqual({ ...DEFAULT_OBJECT_STYLES.frame, italic: true })
  })

  it('is idempotent and does not bump schemaVersion', () => {
    const once: any = migrateShow(styleShow())
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})

describe('frame configuration migration (7.9)', () => {
  const frameShow = () => ({
    ...useShowStore.getState().show!,
    livePages: [{
      id: 'p',
      name: 'Page',
      controls: [{ id: 'c1', name: 'Cue', type: 'toggle', presetIds: [], x: 20, y: 20 }],
      annotations: [
        { id: 'f1', type: 'frame', text: 'Frame', x: 20, y: 100, width: 200, height: 100 },
        { id: 'f2', type: 'frame', text: 'Configured', x: 20, y: 250, width: 200, height: 100, frame: { exclusive: true, intensity: 42 } }
      ]
    }]
  })

  it('fills frame defaults while keeping existing configuration', () => {
    const show: any = migrateShow(frameShow())
    const annotations = show.livePages[0].annotations
    expect(annotations[0].frame).toEqual({ exclusive: false, intensity: 100, speed: 100 })
    expect(annotations[1].frame).toEqual({ exclusive: true, intensity: 42, speed: 100 })
    expect(show.livePages[0].controls[0].frame).toBeUndefined()
  })

  it('is idempotent and does not bump schemaVersion', () => {
    const once: any = migrateShow(frameShow())
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})

describe('live cue sequence migration (7.10)', () => {
  const sequenceShow = () => ({
    ...useShowStore.getState().show!,
    livePages: [{
      id: 'p',
      name: 'Page',
      controls: [
        { id: 'c1', name: 'Legacy cue', type: 'toggle', presetIds: [], x: 20, y: 20 },
        { id: 'c2', name: 'Cue with sequences', type: 'toggle', presetIds: [], x: 100, y: 20, sequenceIds: ['s1', 's1'] }
      ],
      annotations: [{ id: 'f1', type: 'frame', text: 'Frame', x: 20, y: 100, width: 200, height: 100 }]
    }]
  })

  it('fills empty sequence lists on cues while keeping existing ids', () => {
    const show: any = migrateShow(sequenceShow())
    const controls = show.livePages[0].controls
    expect(controls[0].sequenceIds).toEqual([])
    expect(controls[0].timing).toEqual({ fadeInMs: 0, fadeOutMs: 0, delayMs: 0, curve: 'linear' })
    expect(controls[0].appearance).toEqual({ color: '#47235a', releaseOthers: false })
    expect(controls[0].modifiers).toEqual({ intensity: 100, speed: 100, size: 100 })
    expect(controls[0].priority).toBe(0)
    expect(controls[1].sequenceIds).toEqual(['s1', 's1']) // migration preserves, drops normalise
    expect(show.livePages[0].annotations[0].sequenceIds).toBeUndefined()
  })

  it('is idempotent and does not bump schemaVersion', () => {
    const once: any = migrateShow(sequenceShow())
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})
