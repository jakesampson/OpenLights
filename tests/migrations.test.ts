import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { useShowStore, defaultFixtureValues } from '../src/renderer/src/stores/showStore'
import { CURRENT_SCHEMA_VERSION, migrateShow } from '../src/shared/migrations'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import { composeOutput } from '../src/renderer/src/lib/outputModel'
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
      expect(show.fixtures).toEqual([]); expect((show as unknown as Record<string, unknown>).cues).toBeUndefined(); expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
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
    // No project-wide cue store any more (schema v6, Jake 27 Nov 2026):
    // the look is inlined into each holder. The button, first holder,
    // keeps the original id; the step's copy gets a fresh one.
    expect((show as unknown as Record<string, unknown>).cues).toBeUndefined()
    expect(show.livePages[0].controls[0].cue).toMatchObject({ id: 's1', name: 'Warm Welcome', fadeMs: 1500, fixtureValues: { f1: { intensity: 200 } } })
    expect(show.cueLists[0].steps[0].cue).toMatchObject({ name: 'Warm Welcome', fadeMs: 1500, fixtureValues: { f1: { intensity: 200 } } })
    expect(show.cueLists[0].steps[0].cue.id).not.toBe('s1')
    expect(show.cueLists[0].steps[0].cueId).toBeUndefined()
    expect(show.cueLists[0].steps[0].sceneId).toBeUndefined()
    expect(show.livePages[0].controls[0].cueId).toBeUndefined()
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
    // The demo has 3 cues (not 4 — "Sunday Set" is the cuelist's name),
    // each referenced once, so each step keeps its original id — and
    // the step fade stays the step's own (1500/1000/2000) while the cue
    // fade stays the cue's own (1200/800/2000).
    expect((demo as unknown as Record<string, unknown>).cues).toBeUndefined()
    expect(demo.cueLists[0].steps.map((s: any) => s.cue.name)).toEqual(['Warm Welcome', 'Sermon Focus', 'Communion Glow'])
    expect(demo.cueLists[0].steps.map((s: any) => s.cue.id)).toEqual(['s1', 's2', 's3'])
    expect(demo.cueLists[0].steps.map((s: any) => [s.cue.fadeMs, s.fadeMs])).toEqual([[1200, 1500], [800, 1000], [2000, 2000]])
  })
})

describe('inline cue migration (schema v6, Jake 27 Nov 2026)', () => {
  // An old-format show: one cue shared by a button and a list step, one
  // orphan, a MIDI cue target and a startup restore pointing at the cue.
  const oldShow = () => ({
    schemaVersion: 5,
    id: 'old', name: 'Old show', createdAt: 0, updatedAt: 0,
    fixtures: [{ id: 'f1', name: 'Wash', type: 'par', channelStart: 1, channels: 3 }],
    cues: [
      { id: 's1', name: 'Warm Welcome', fadeMs: 1500, fixtureValues: { f1: { intensity: 200 } } },
      { id: 'orphan', name: 'Orphan', fadeMs: 0, fixtureValues: {} }
    ],
    cueLists: [{ id: 'l1', name: 'List', steps: [{ id: 'step1', cueId: 's1', fadeMs: 1500, holdMs: 0 }] }],
    livePages: [{ id: 'p1', name: 'Page', controls: [{ id: 'b1', name: 'Warm', type: 'toggle', cueId: 's1', presetIds: [], x: 0, y: 0 }] }],
    midiMappings: [{ id: 'm1', targetType: 'cue', targetId: 's1', midiType: 'noteon', channel: 1, number: 60 }],
    startup: { mode: 'restore', presetIds: [], liveValues: { b1: 255 }, pageId: 'p1', cueId: 's1' },
    automations: []
  })

  it('copies a shared cue into each holder as separate cues', () => {
    const show: any = migrateShow(oldShow())
    expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(show.cues).toBeUndefined()
    const buttonCue = show.livePages[0].controls[0].cue
    const stepCue = show.cueLists[0].steps[0].cue
    expect(buttonCue.id).toBe('s1')
    expect(stepCue.id).not.toBe('s1')
    expect(stepCue).toMatchObject({ name: 'Warm Welcome', fadeMs: 1500, fixtureValues: { f1: { intensity: 200 } } })
    // Separate copies: the step fade stays the step's own.
    expect(stepCue.fadeMs).toBe(1500)
    expect(show.cueLists[0].steps[0].fadeMs).toBe(1500)
  })

  it('drops an unreferenced cue', () => {
    const show: any = migrateShow(oldShow())
    expect(JSON.stringify(show)).not.toContain('Orphan')
    expect(JSON.stringify(show)).not.toContain('orphan')
  })

  it('remaps the startup cue and the MIDI cue target to the button copy', () => {
    const show: any = migrateShow(oldShow())
    expect(show.startup.cueId).toBe('s1')
    expect(show.midiMappings[0].targetId).toBe('s1')
    expect(show.midiMappings[0].targetType).toBe('cue')
  })

  it('writes no cues key after save', () => {
    const store = useShowStore.getState()
    store.setShow(migrateShow(oldShow()) as unknown as Parameters<typeof store.setShow>[0])
    const saved = store.showForSave() as unknown as Record<string, unknown>
    expect(saved).toBeTruthy()
    expect('cues' in saved!).toBe(false)
  })

  it('is idempotent and does not bump schemaVersion', () => {
    const once: any = migrateShow(oldShow())
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
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
    expect(controls[0].priority).toBe(5)
    expect(controls[1].sequenceIds).toEqual(['s1', 's1']) // migration preserves, drops normalise
    expect(show.livePages[0].annotations[0].sequenceIds).toBeUndefined()
  })

  it('is idempotent and does not bump schemaVersion', () => {
    const once: any = migrateShow(sequenceShow())
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})

describe('live button type / behaviour migration (schema v5, Jake 27 Nov 2026)', () => {
  // LightKey separates Type from Behaviour (guide ch.11, p.204): the
  // old single `type` field splits into `type` (push / faderHorizontal
  // / faderVertical) + `behavior` (toggle / flash). A v4 show keeps
  // exactly the behaviour it had.
  const v4Show = () => ({
    schemaVersion: 4,
    id: 'old', name: 'Old show', createdAt: 0, updatedAt: 0,
    fixtures: [], cues: [],
    livePages: [{
      id: 'p', name: 'Page',
      controls: [
        { id: 'c1', name: 'Latch', type: 'toggle', presetIds: [], x: 20, y: 20 },
        { id: 'c2', name: 'Momentary', type: 'flash', presetIds: [], x: 140, y: 20 },
        { id: 'c3', name: 'Level', type: 'fader', presetIds: [], x: 260, y: 20 },
      ]
    }]
  })

  it('splits the old collapsed type into type + behavior, losing nothing', () => {
    const show: any = migrateShow(v4Show())
    expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(show.livePages[0].controls).toEqual([
      expect.objectContaining({ id: 'c1', type: 'push', behavior: 'toggle' }),
      expect.objectContaining({ id: 'c2', type: 'push', behavior: 'flash' }),
      expect.objectContaining({ id: 'c3', type: 'faderHorizontal' }),
    ])
    expect(show.livePages[0].controls[2].behavior).toBeUndefined()
  })

  it('is idempotent and does not bump schemaVersion', () => {
    const once: any = migrateShow(v4Show())
    expect(once.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})

describe('stale built-in profile defaults (Piece 11, Jake 20 Nov 2026)', () => {
  // A fixture patched before Piece 11 (19 Nov 2026) carries an inline
  // profile snapshot whose colour defaults are the old ones — blue at 0,
  // not 255 — because allocateFixtures stores a structuredClone of the
  // profile at patch time and fixtureProfile() prefers that snapshot
  // over the current library profile. The old project then shows no
  // colour on the wheel and the Dimmer brings up black, until the wheel
  // is touched and real values are written. A fixture patched after
  // Piece 11 auto-goes blue. Loading must heal the snapshot: built-in
  // profiles are immutable library data (saveFixtureProfile refuses a
  // same-id edit), so any inline deviation from the library is
  // staleness, never a user edit — custom / OFL profiles are untouched.
  const staleBarProfile = () => {
    const profile = structuredClone(BUILTIN_PROFILES.find((p) => p.id === 'pan-4x1x30-17ch')!)
    // Pre-Piece-11 formula: pan/tilt centred, everything else 0.
    for (const channel of profile.modes[0].channels) {
      channel.defaultValue = channel.attribute === 'pan' || channel.attribute === 'tilt' ? 128 : 0
    }
    return profile
  }
  const staleBar = () => ({
    id: 'bar', name: 'PB1', shortName: 'PB1', type: 'pixel-bar-17ch',
    profileId: 'pan-4x1x30-17ch', modeId: 'default',
    channelStart: 1, channels: 17, profile: staleBarProfile()
  })

  it('backfills the blue default from the current built-in profile', () => {
    const show = migrateShow({ fixtures: [staleBar()], cues: [] })
    const fixture = show.fixtures[0]
    const defaults = defaultFixtureValues(fixture)
    expect(defaults.blue).toBe(255)
    expect(defaults.blue2).toBe(255)
    expect(defaults.blue3).toBe(255)
    expect(defaults.blue4).toBe(255)
    expect(defaults.red).toBe(0)
    expect(defaults.intensity).toBe(0)
    // The defaults layer of the output carries the blue too, so the
    // Dimmer brings up blue on the old fixture without touching the wheel.
    const channels = computeCueChannels([fixture], { id: 'defaults', name: 'Defaults', fadeMs: 0, fixtureValues: {} }, 255, true)
    expect(channels[3]).toBe(255)
    expect(channels[6]).toBe(255)
    expect(channels[9]).toBe(255)
    expect(channels[12]).toBe(255)
    expect(channels[13]).toBe(0)
  })

  it('leaves a custom (non-built-in) profile exactly as stored', () => {
    const custom = staleBarProfile()
    custom.id = 'custom-bar'
    custom.name = 'My edited bar'
    const fixture = { ...staleBar(), profileId: 'custom-bar', profile: custom }
    const show = migrateShow({ fixtures: [fixture], cues: [] })
    expect(defaultFixtureValues(show.fixtures[0]).blue).toBe(0)
    expect(show.fixtures[0].profile.name).toBe('My edited bar')
  })

  it('refreshes a custom profile from the library copy when the library copy was edited', () => {
    // Customs are global and editable (Jake, 20 Nov 2026): the library
    // copy is the definition, so a fixture patched from the old version
    // picks up a rename and a changed default when the show loads or
    // the library lands — the snapshot is refreshed wholesale, not just
    // its defaults. A custom in no library is still left as stored
    // (the test above): the library copy has to exist to refresh from.
    const edited = staleBarProfile()
    edited.id = 'custom-bar'
    edited.custom = true
    edited.name = 'My edited bar v2'
    for (const channel of edited.modes[0].channels) {
      if (channel.attribute === 'blue') channel.defaultValue = 255
    }
    const stored = staleBarProfile()
    stored.id = 'custom-bar'
    stored.custom = true
    stored.name = 'My edited bar'
    const fixture = { ...staleBar(), profileId: 'custom-bar', profile: stored }
    const show = migrateShow({ fixtures: [fixture], cues: [] }, [edited])
    expect(show.fixtures[0].profile.name).toBe('My edited bar v2')
    expect(defaultFixtureValues(show.fixtures[0]).blue).toBe(255)
    // The same refresh runs from the show's own stored profiles: a
    // copy edited in the show is the library copy for that show.
    const showWithStored = migrateShow({ fixtures: [fixture], fixtureProfiles: [edited], cues: [] })
    expect(showWithStored.fixtures[0].profile.name).toBe('My edited bar v2')
    expect(defaultFixtureValues(showWithStored.fixtures[0]).blue).toBe(255)
  })

  it('keeps an explicit per-fixture default ahead of the library one', () => {
    const fixture = { ...staleBar(), defaultValues: { blue: 40 } }
    const show = migrateShow({ fixtures: [fixture], cues: [] })
    expect(defaultFixtureValues(show.fixtures[0]).blue).toBe(40)
    expect(defaultFixtureValues(show.fixtures[0]).blue2).toBe(255)
  })

  it('is idempotent', () => {
    const once: any = migrateShow({ fixtures: [staleBar()], cues: [] })
    expect(migrateShow(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})

describe('stale OFL / library profile defaults (Jake 20 Nov 2026, image-18)', () => {
  // The built-in-only backfill above does not cover the fixtures Jake
  // actually owns in "PRBC Default": the Rogue R3 Spots (and the EP4 bar)
  // come from the OFL library — their profileIds are
  // 'ofl:<manufacturer>:<fixture>' — so the migration skipped them and a
  // Dimmer-only override still brought up black (blue default 0 in the
  // stale inline snapshot). The wheel shows blue while the output is
  // black because the wheel displays the preserved hue/saturation/
  // brightness for a black fixture, not a real colour value — the output
  // side is the wrong one, and healing the snapshot fixes it. The OFL
  // library lives in the main process, so migrateShow takes it as a
  // second argument; the renderer passes its cached copy (see
  // oflMigrationStore.test.ts). The show's own fixtureProfiles and the
  // legacyType fallback cover fixtures whose inline snapshot outlived
  // their profileId.
  const EP4_ATTRIBUTES = ['red', 'green', 'blue', 'red 2', 'green 2', 'blue 2', 'red 3', 'green 3', 'blue 3', 'red 4', 'green 4', 'blue 4', 'intensity', 'strobe', 'programs', 'program speed', 'curve select']
  const oflEp4Profile = (blueDefault: number) => ({
    id: 'ofl:event-lighting:ep4',
    name: 'EP4',
    manufacturer: 'Event Lighting',
    legacyType: 'pixel-bar-17ch' as const,
    modes: [{
      id: '17ch',
      name: '17ch',
      channels: EP4_ATTRIBUTES.map((attribute, number) => ({
        number, attribute,
        propertyType: attribute === 'intensity' ? 'intensity' as const : /^(red|green|blue)/.test(attribute) ? 'color' as const : 'other' as const,
        min: 0, max: 255,
        defaultValue: /^blue/.test(attribute) ? blueDefault : 0,
        highlightValue: /^(intensity|red|green|blue)/.test(attribute) ? 255 : 0
      })),
      beams: [1, 2, 3, 4].map((cell) => ({ id: `cell-${cell}`, name: `Cell ${cell}`, properties: { red: cell === 1 ? 'red' : `red ${cell}`, green: cell === 1 ? 'green' : `green ${cell}`, blue: cell === 1 ? 'blue' : `blue ${cell}` } }))
    }]
  })
  const staleOflBar = () => ({
    id: 'bar', name: 'PB1', shortName: 'PB1', type: 'pixel-bar-17ch',
    profileId: 'ofl:event-lighting:ep4', modeId: '17ch',
    channelStart: 1, channels: 17, profile: oflEp4Profile(0)
  })

  it('heals a stale OFL snapshot from the OFL library profiles', () => {
    const show = migrateShow({ fixtures: [staleOflBar()], cues: [] }, [oflEp4Profile(255)])
    const fixture = show.fixtures[0]
    const defaults = defaultFixtureValues(fixture)
    expect(defaults.blue).toBe(255)
    expect(defaults['blue 2']).toBe(255)
    expect(defaults['blue 3']).toBe(255)
    expect(defaults['blue 4']).toBe(255)
    expect(defaults.red).toBe(0)
    expect(defaults.intensity).toBe(0)
  })

  it('brings up blue on a Dimmer-only override once healed', () => {
    const show = migrateShow({ fixtures: [staleOflBar()], cues: [] }, [oflEp4Profile(255)])
    const fixture = show.fixtures[0]
    const frame = composeOutput({
      defaults: computeCueChannels([fixture], { id: 'defaults', name: 'Defaults', fadeMs: 0, fixtureValues: {} }, 255, true),
      overrides: computeCueChannels([fixture], { id: 'overrides', name: 'Overrides', fadeMs: 0, fixtureValues: { bar: { intensity: 255 } } }, 255, false)
    })
    // The four blue channels (Ch3/6/9/12) and the Dimmer (Ch13) are up;
    // red and green stay at 0 — the fixture lights blue, not white.
    for (const channel of [3, 6, 9, 12, 13]) expect(frame[channel]).toBe(255)
    for (const channel of [1, 2, 4, 5, 7, 8, 10, 11, 14]) expect(frame[channel]).toBe(0)
  })

  it('heals a snapshot whose profileId is gone, via its legacy type', () => {
    const profile = structuredClone(BUILTIN_PROFILES.find((p) => p.id === 'pan-4x1x30-17ch')!)
    for (const channel of profile.modes[0].channels) {
      channel.defaultValue = channel.attribute === 'pan' || channel.attribute === 'tilt' ? 128 : 0
    }
    const fixture = { id: 'bar', name: 'PB1', shortName: 'PB1', type: 'pixel-bar-17ch', channelStart: 1, channels: 17, profile }
    const show = migrateShow({ fixtures: [fixture], cues: [] })
    expect(defaultFixtureValues(show.fixtures[0]).blue).toBe(255)
  })

  it('heals from the show’s own stored fixtureProfiles', () => {
    const custom = oflEp4Profile(255)
    custom.id = 'custom-bar'
    custom.name = 'My edited bar'
    const fixture = { ...staleOflBar(), profileId: 'custom-bar', profile: oflEp4Profile(0) }
    fixture.profile.id = 'custom-bar'
    const show = migrateShow({ fixtures: [fixture], cues: [], fixtureProfiles: [custom] })
    expect(defaultFixtureValues(show.fixtures[0]).blue).toBe(255)
  })

  it('still leaves a custom profile in no library exactly as stored', () => {
    const fixture = { ...staleOflBar(), profileId: 'custom-bar', profile: oflEp4Profile(0) }
    fixture.profile.id = 'custom-bar'
    const show = migrateShow({ fixtures: [fixture], cues: [] })
    expect(defaultFixtureValues(show.fixtures[0]).blue).toBe(0)
  })

  it('is idempotent with OFL profiles supplied', () => {
    const once: any = migrateShow({ fixtures: [staleOflBar()], cues: [] }, [oflEp4Profile(255)])
    expect(migrateShow(JSON.parse(JSON.stringify(once)), [oflEp4Profile(255)])).toEqual(once)
  })
})
