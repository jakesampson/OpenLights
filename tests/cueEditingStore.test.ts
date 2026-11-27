// Cue-editing store actions (Jake, 27 Nov 2026 — "Build all of it so it
// matches the videos", Videos 1 + 2): dropping a preset onto a button
// that carries a cue adds it to the CUE; the Get Info list edits the
// cue's contents; ad-hoc values promote to a reusable preset; a
// run-once sequence releases its button when it finishes; an
// always-active attached button keeps one of its group lit.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { configureSequences } from '../src/renderer/src/lib/output'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  onAppQuitting: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setChannels: vi.fn(),
  getChannels: () => Promise.resolve([]),
}
vi.stubGlobal('requestAnimationFrame', () => 1)
vi.stubGlobal('cancelAnimationFrame', vi.fn())

const FIXTURES = [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }]
const PRESETS = [
  { id: 'p-red', name: 'Red', category: 'color', fixtureValues: { d1: { red: 255, intensity: 255 } } },
  { id: 'p-blue', name: 'Blue', category: 'color', fixtureValues: { d1: { blue: 255, intensity: 255 } } },
]

function seedShow(overrides: Record<string, unknown> = {}) {
  useShowStore.getState().setShow(migrateShow({
    fixtures: FIXTURES,
    presets: PRESETS,
    cues: [{ id: 'cue1', name: 'Song 1', presetIds: ['p-red'], sequenceIds: [], fixtureValues: { d1: { intensity: 200 } }, fadeMs: 500 }],
    sequences: [{ id: 'seq1', name: 'Rainbow', order: 'forward', loop: false, timing: 'manual', stepsPerBeat: 1, timeScale: 0.5, steps: [{ id: 'step1', name: 'Step 1', fixtureValues: { d1: { red: 255 } }, presetIds: [], fadeMs: 0, holdMs: 5 }] }],
    livePages: [{
      id: 'page1', name: 'Page', fadeMs: 0,
      controls: [
        { id: 'btn1', name: 'Song 1', type: 'push', cueId: 'cue1', presetIds: [], x: 20, y: 20 },
        { id: 'btn2', name: 'Standalone', type: 'push', presetIds: [], x: 20, y: 80 },
      ],
      annotations: [{ id: 'frame1', type: 'frame', text: 'Service', x: 10, y: 10, width: 400, height: 200 }],
    }],
    ...overrides,
  } as unknown as ShowDef))
  useShowStore.setState({ activeLivePageId: 'page1' })
}

beforeEach(() => { seedShow() })

describe('cue editing store', () => {
  it('dropping a preset onto a cue button adds it to the cue, not the button', () => {
    const state = useShowStore.getState()
    state.dropOnLivePage({ presetIds: ['p-blue'], sequenceIds: [], effectIds: [] }, { kind: 'cue', cueId: 'btn1' })
    const next = useShowStore.getState()
    expect(next.cues.find((c) => c.id === 'cue1')?.presetIds).toEqual(['p-red', 'p-blue'])
    expect(next.show?.livePages?.[0].controls.find((c) => c.id === 'btn1')?.presetIds).toEqual([])
  })

  it('dropping a preset onto a standalone button adds it to the button', () => {
    useShowStore.getState().dropOnLivePage({ presetIds: ['p-blue'], sequenceIds: [], effectIds: [] }, { kind: 'cue', cueId: 'btn2' })
    const next = useShowStore.getState()
    expect(next.show?.livePages?.[0].controls.find((c) => c.id === 'btn2')?.presetIds).toEqual(['p-blue'])
    expect(next.cues.find((c) => c.id === 'cue1')?.presetIds).toEqual(['p-red'])
  })

  it('dropping a preset onto a cuelist step (cue id, no button) adds it to the cue', () => {
    // The step inspector's drop (Jake, 27 Nov 2026 — cuelist widget
    // replication): a step has no button, so the drop addresses the cue
    // definition directly by cue id. The store used to resolve only
    // control ids here, so the drop silently did nothing (found by the
    // real-app probe: the drag landed, the drop fired, the cue stayed
    // empty).
    useShowStore.getState().dropOnLivePage({ presetIds: ['p-blue'], sequenceIds: [], effectIds: [] }, { kind: 'cue', cueId: 'cue1' })
    const next = useShowStore.getState()
    expect(next.cues.find((c) => c.id === 'cue1')?.presetIds).toEqual(['p-red', 'p-blue'])
    useShowStore.getState().undo()
    expect(useShowStore.getState().cues.find((c) => c.id === 'cue1')?.presetIds).toEqual(['p-red'])
  })

  it('editCueDefContents adds and removes cue ingredients', () => {
    const state = useShowStore.getState()
    state.editCueDefContents('cue1', { type: 'add-sequence', id: 'seq1' })
    expect(useShowStore.getState().cues.find((c) => c.id === 'cue1')?.sequenceIds).toEqual(['seq1'])
    state.editCueDefContents('cue1', { type: 'remove-preset', id: 'p-red' })
    expect(useShowStore.getState().cues.find((c) => c.id === 'cue1')?.presetIds).toEqual([])
    state.editCueDefContents('cue1', { type: 'remove-ad-hoc', fixtureId: 'd1' })
    expect(useShowStore.getState().cues.find((c) => c.id === 'cue1')?.fixtureValues).toEqual({})
  })

  it('promoting a cue ad-hoc item creates a preset and keeps the look', () => {
    const created = useShowStore.getState().promoteAdHocToPreset({ cueId: 'cue1' })
    expect(created).toBeTruthy()
    const next = useShowStore.getState()
    const preset = next.presets.find((p) => p.id === created)
    expect(preset?.name).toBe('Song 1 ad hoc')
    expect(preset?.fixtureValues.d1.intensity).toBe(200)
    const cue = next.cues.find((c) => c.id === 'cue1')!
    expect(cue.presetIds).toContain(created)
    expect(cue.fixtureValues).toEqual({})
  })

  it('promoting with no ad-hoc values returns null and changes nothing', () => {
    useShowStore.getState().editCueDefContents('cue1', { type: 'remove-ad-hoc', fixtureId: 'd1' })
    expect(useShowStore.getState().promoteAdHocToPreset({ cueId: 'cue1' })).toBeNull()
    expect(useShowStore.getState().presets).toHaveLength(2)
  })

  it('always-active refuses to turn off the only lit button in its group', () => {
    const state = useShowStore.getState()
    // btn1 (20,20) and btn2 (20,80) do not touch; move btn2 beside btn1
    // so the two form an attached group (Guide ch.11 pp.183–184).
    state.setShow(migrateShow({
      fixtures: FIXTURES, presets: PRESETS,
      cues: [{ id: 'cue1', name: 'Song 1', presetIds: ['p-red'], sequenceIds: [], fixtureValues: {}, fadeMs: 500 }],
      livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
        { id: 'btn1', name: 'Song 1', type: 'push', cueId: 'cue1', presetIds: [], x: 20, y: 20, alwaysActive: true },
        { id: 'btn2', name: 'Other', type: 'push', presetIds: [], x: 140, y: 20 },
      ] }],
    } as unknown as ShowDef))
    useShowStore.setState({ activeLivePageId: 'page1' })
    const next = useShowStore.getState()
    next.setLiveValue('btn1', 255)
    expect(useShowStore.getState().activeLiveValues.btn1).toBe(255)
    // The only lit button in the group: switching it off is refused.
    next.setLiveValue('btn1', 0)
    expect(useShowStore.getState().activeLiveValues.btn1).toBe(255)
    // Lighting the neighbour first releases it through the switch — and
    // the neighbour can then go off, because btn1 is lit again.
    next.setLiveValue('btn2', 255)
    expect(useShowStore.getState().activeLiveValues.btn1 ?? 0).toBe(0)
    expect(useShowStore.getState().activeLiveValues.btn2).toBe(255)
    next.setLiveValue('btn2', 0)
    expect(useShowStore.getState().activeLiveValues.btn2 ?? 0).toBe(0)
  })

  it('frame Previous/Next creates small step buttons and removes them', () => {
    const state = useShowStore.getState()
    state.configureFramePrevNext('frame1', 'both')
    let controls = useShowStore.getState().show?.livePages?.[0].controls ?? []
    const steps = controls.filter((c) => c.frameStep)
    expect(steps).toHaveLength(2)
    expect(steps.map((c) => c.frameStep).sort()).toEqual(['next', 'previous'])
    expect(steps.every((c) => c.width === 64 && c.height === 24)).toBe(true)
    // Re-selecting does not duplicate them.
    state.configureFramePrevNext('frame1', 'both')
    controls = useShowStore.getState().show?.livePages?.[0].controls ?? []
    expect(controls.filter((c) => c.frameStep)).toHaveLength(2)
    // 'next' keeps only the Next button; 'none' removes both.
    state.configureFramePrevNext('frame1', 'next')
    controls = useShowStore.getState().show?.livePages?.[0].controls ?? []
    expect(controls.filter((c) => c.frameStep).map((c) => c.frameStep)).toEqual(['next'])
    state.configureFramePrevNext('frame1', 'none')
    controls = useShowStore.getState().show?.livePages?.[0].controls ?? []
    expect(controls.filter((c) => c.frameStep)).toHaveLength(0)
  })

  it('a run-once sequence releases its button when it finishes', async () => {
    // The button carries the 5ms sequence; press it, let the sequence
    // run out, and the poll must switch the button off.
    const state = useShowStore.getState()
    state.editCueContents('btn2', { type: 'add-sequence', id: 'seq1' })
    const sequence = state.show?.sequences?.find((s) => s.id === 'seq1')
    expect(sequence).toBeTruthy()
    configureSequences([sequence!], [])
    state.setLiveValue('btn2', 255)
    expect(useShowStore.getState().activeLiveValues.btn2).toBe(255)
    await new Promise((resolve) => setTimeout(resolve, 120))
    useShowStore.getState().deactivateCompletedSequences()
    expect(useShowStore.getState().activeLiveValues.btn2 ?? 0).toBe(0)
    configureSequences([], [])
  }, 10000)
})
