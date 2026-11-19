import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('short names (schema v3, LightKey Guide p.30)', () => {
  it('derives short names for fixtures stored without one and keeps stored names', () => {
    const raw = {
      schemaVersion: 2,
      id: 'old', name: 'Old show', createdAt: 0, updatedAt: 0,
      fixtures: [
        { id: 'f1', name: 'Warm Wash Front', type: 'par', channelStart: 1, channels: 4 },
        { id: 'f2', name: 'Blue Fill Back', type: 'led-wash', channelStart: 5, channels: 7 },
        { id: 'f3', name: 'Center Moving Head', type: 'moving-head', channelStart: 12, channels: 8 },
        { id: 'f4', name: 'Custom', type: 'moving-head', channelStart: 20, channels: 8, shortName: 'SPOT' }
      ],
      cues: [], automations: []
    }
    const show = migrateShow(raw)
    expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(show.fixtures.map((f) => f.shortName)).toEqual(['P1', 'W1', 'MH1', 'SPOT'])
    // Idempotent: a second migration keeps the same names.
    expect(migrateShow(JSON.parse(JSON.stringify(show))).fixtures.map((f) => f.shortName)).toEqual(['P1', 'W1', 'MH1', 'SPOT'])
  })
})

describe('MIDI mapping migration', () => {
  it('adds trigger semantics without removing legacy mapping fields', () => {
    const raw = { ...useShowStore.getState().show!, midiMappings: [
      { id: 'master', targetType: 'master', targetId: null, midiType: 'cc', channel: 1, number: 7 },
      { id: 'cue', targetType: 'cue', targetId: 's1', midiType: 'noteon', channel: 1, number: 60 }
    ] }
    expect(migrateShow(raw).midiMappings).toEqual([
      { ...raw.midiMappings[0], trigger: 'value' },
      { ...raw.midiMappings[1], trigger: 'press' }
    ])
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
      expect(show.fixtures).toEqual([]); expect(show.cues).toEqual([]); expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    }
  })
  it('warns without downgrading future files', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(migrateShow({ schemaVersion: 99, future: true }).schemaVersion).toBe(99)
    expect(warning).toHaveBeenCalled(); warning.mockRestore()
  })
})

describe('scene to cue migration (schema v2, LightKey language)', () => {
  // A version-1 show as stored before the rename: looks under `scenes`,
  // cuelist steps and Live buttons pointing at them by sceneId, a MIDI
  // binding and a startup restore by scene, and a preset converted from a
  // scene carrying a `preset-from-scene:` id referenced from two places.
  const legacyV1Show = () => ({
    schemaVersion: 1,
    id: 'old', name: 'Old show', createdAt: 0, updatedAt: 0,
    fixtures: [{ id: 'f1', name: 'Wash', type: 'par', channelStart: 1, channels: 3 }],
    scenes: [{ id: 's1', name: 'Warm Welcome', fadeMs: 1500, fixtureValues: { f1: { intensity: 200 } } }],
    presets: [{ id: 'preset-from-scene:s1', name: 'Warm Welcome', category: 'color', fixtureValues: { f1: { intensity: 200 } } }],
    cueLists: [{ id: 'l1', name: 'List', steps: [{ id: 'step1', sceneId: 's1', fadeMs: 1500, holdMs: 0 }] }],
    livePages: [{ id: 'p1', name: 'Page', controls: [{ id: 'b1', name: 'Warm', type: 'toggle', sceneId: 's1', presetIds: ['preset-from-scene:s1'], x: 0, y: 0 }] }],
    sequences: [{ id: 'q1', name: 'Chase', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1, steps: [{ id: 'qstep1', name: 'Step 1', fixtureValues: {}, presetIds: ['preset-from-scene:s1'], fadeMs: 1000, holdMs: 0 }] }],
    midiMappings: [{ id: 'm1', targetType: 'scene', targetId: 's1', midiType: 'noteon', channel: 1, number: 60 }],
    startup: { mode: 'restore', presetIds: [], liveValues: {}, pageId: 'p1', sceneId: 's1' },
    automations: []
  })

  it('renames stored looks to cues and every reference, losing nothing', () => {
    const show: any = migrateShow(legacyV1Show())
    expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(show.scenes).toBeUndefined()
    expect(show.cues).toHaveLength(1)
    expect(show.cues[0]).toMatchObject({ id: 's1', name: 'Warm Welcome', fadeMs: 1500, fixtureValues: { f1: { intensity: 200 } } })
    expect(show.cueLists[0].steps[0].cueId).toBe('s1')
    expect(show.cueLists[0].steps[0].sceneId).toBeUndefined()
    expect(show.livePages[0].controls[0].cueId).toBe('s1')
    expect(show.livePages[0].controls[0].sceneId).toBeUndefined()
    expect(show.midiMappings[0].targetType).toBe('cue')
    expect(show.startup.cueId).toBe('s1')
    expect(show.startup.sceneId).toBeUndefined()
    // Converted-preset ids and their references move with the rename.
    expect(show.presets[0].id).toBe('preset-from-cue:s1')
    expect(show.livePages[0].controls[0].presetIds).toEqual(['preset-from-cue:s1'])
    expect(show.sequences[0].steps[0].presetIds).toEqual(['preset-from-cue:s1'])
  })

  it('is idempotent and does not bump schemaVersion', () => {
    const once: any = migrateShow(legacyV1Show())
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  it('loads the demo show file with its looks intact as cues', () => {
    const demo = migrateShow(JSON.parse(readFileSync(join(process.cwd(), 'demo-projects', 'ShowBuddyActive-Demo.json'), 'utf8')))
    expect(demo.cues.map((c: any) => c.name)).toEqual(['Warm Welcome', 'Sermon Focus', 'Communion Glow'])
    expect(demo.cueLists[0].steps.map((s: any) => s.cueId)).toEqual(['s1', 's2', 's3'])
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
