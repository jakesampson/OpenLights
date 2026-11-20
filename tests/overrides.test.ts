// LightKey's real Overrides (Guide ch.11, pp.116, 191, 201–202; Jake's
// LightKey screenshots 20 Nov 2026): Design writes define per-fixture
// manual overrides on top of the active cue — they never mint a cue.
// "Add Overrides" merges the current overrides into a cue's ad-hoc
// layer (or a Live button's captured overrides); Edit Ad Hoc Properties
// edits a cue's ad-hoc layer directly, like preset editing.
import { expect, it, vi, beforeEach } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import { overridePropertyGroups } from '../src/renderer/src/lib/overrideLabels'
import { addOverridesTargetIds, editAdHocTarget } from '../src/renderer/src/lib/liveOverrideTargets'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

function setUp() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: ['a', 'b'].map((id, i) => ({ id, type: 'par', channelStart: 1 + i * 4, channels: 4 })),
    cues: [{ id: 'c1', name: 'Cue 1', presetIds: [], sequenceIds: [], fadeMs: 0,
      fixtureValues: { a: { intensity: 100, red: 10 }, b: { intensity: 100, red: 10 } } }],
    cueLists: [{ id: 'list1', name: 'List 1', steps: [{ id: 'st1', cueId: 'c1', fadeMs: 0, holdMs: 0 }], loop: false }],
    livePages: [{ id: 'pg', name: 'Page 1', cueListWidgets: [{ id: 'w1', cueListId: 'list1', x: 0, y: 0 }], controls: [
      { id: 'btn', name: 'Btn', type: 'toggle', presetIds: [], adHocValues: { a: { intensity: 50 } } },
      { id: 'btn-cue', name: 'Cue btn', type: 'toggle', presetIds: [], cueId: 'c1' }
    ] }]
  }))
  s().selectFixtures(['a'])
  s().activateCue('c1')
  return s
}

beforeEach(() => { useShowStore.getState().setShow(null) })

it('Design writes define overrides and never mint a cue', () => {
  const s = setUp()
  s().updateSelectedFixtures({ intensity: 200 }, true)
  expect(s().manualOverrides).toEqual({ a: { intensity: 200 } })
  expect(s().cues).toHaveLength(1)
  expect(s().cues[0].fixtureValues.a).toEqual({ intensity: 100, red: 10 })
  // The override wins over the cue at output (manual layer on top):
  // fixture 'a' is a par at channel 1, intensity on offset 0.
  const overrides = computeCueChannels(s().show!.fixtures, { id: '', name: '', fadeMs: 0, fixtureValues: s().manualOverrides })
  expect(overrides[1]).toBe(200)
  // A colour write does the same, and a second property accumulates.
  s().setSelectedColor({ red: 255, green: 0, blue: 0 }, true)
  expect(s().manualOverrides.a).toMatchObject({ intensity: 200, red: 255, green: 0, blue: 0 })
  expect(s().cues).toHaveLength(1)
})

it('a new cue captures the current overrides (Guide p.191)', () => {
  const s = setUp()
  s().updateSelectedFixtures({ intensity: 200, red: 255 }, true)
  const cue = s().addCue()
  expect(cue.fixtureValues.a).toMatchObject({ intensity: 200, red: 255 })
  // The defaults still fill the rest, and the overrides stay defined.
  expect(cue.fixtureValues.b).toMatchObject({ intensity: 0, red: 0 })
  expect(s().manualOverrides.a).toMatchObject({ intensity: 200, red: 255 })
})

it('Add Overrides merges into the cue ad-hoc layer and is undoable', () => {
  const s = setUp()
  s().updateSelectedFixtures({ intensity: 200, red: 255 }, true)
  s().selectFixtures(['a', 'b']); s().updateSelectedFixtures({ green: 77 }, true)
  s().addOverridesToCues(['c1'])
  expect(s().cues[0].fixtureValues.a).toMatchObject({ intensity: 200, red: 255, green: 77 })
  expect(s().cues[0].fixtureValues.b).toMatchObject({ intensity: 100, red: 10, green: 77 })
  s().undo()
  expect(s().cues[0].fixtureValues.a).toEqual({ intensity: 100, red: 10 })
  expect(s().cues[0].fixtureValues.b).toEqual({ intensity: 100, red: 10 })
})

it('Add Overrides for Selected Fixtures merges only the selection', () => {
  const s = setUp()
  s().selectFixtures(['a', 'b']); s().updateSelectedFixtures({ intensity: 200 }, true)
  s().selectFixtures(['a'])
  s().addOverridesToCues(['c1'], true)
  expect(s().cues[0].fixtureValues.a).toMatchObject({ intensity: 200 })
  expect(s().cues[0].fixtureValues.b).toEqual({ intensity: 100, red: 10 })
})

it('Add Overrides merges into a standalone Live button captured values', () => {
  const s = setUp()
  s().selectFixtures(['a', 'b']); s().updateSelectedFixtures({ intensity: 200 }, true)
  s().addOverridesToCues(['btn'])
  const control = s().show!.livePages![0].controls.find((c) => c.id === 'btn')!
  expect(control.adHocValues.a).toMatchObject({ intensity: 200 })
  expect(s().cues[0].fixtureValues.a).toEqual({ intensity: 100, red: 10 })
})

it('Add Overrides targets resolve from Live selection, else the active cue', () => {
  const s = setUp()
  // A cue button resolves to its cue; a standalone button to itself.
  s().setPageObjectSelection([{ type: 'cue', id: 'btn-cue' }])
  expect(addOverridesTargetIds(s())).toEqual(['c1'])
  s().setPageObjectSelection([{ type: 'cue', id: 'btn' }])
  expect(addOverridesTargetIds(s())).toEqual(['btn'])
  // A cuelist widget resolves to the current step's cue (list is active).
  s().setPageObjectSelection([{ type: 'list', id: 'w1' }])
  s().setActiveCueList('list1'); s().goToCue('list1', 0)
  expect(addOverridesTargetIds(s())).toEqual(['c1'])
  // Nothing selected: the active cue.
  s().setPageObjectSelection([])
  expect(addOverridesTargetIds(s())).toEqual(['c1'])
  // No active cue and nothing selected: no target.
  useShowStore.setState({ activeCueId: null })
  expect(addOverridesTargetIds(s())).toEqual([])
})

it('Edit Ad Hoc Properties writes to the cue and cancel restores it', () => {
  const s = setUp()
  s().startEditingCueAdHoc('c1')
  expect(s().editingCueAdHocId).toBe('c1')
  expect(s().activeCueId).toBe('c1')
  // While editing, a Design write (manual=false) lands in the cue, not overrides.
  s().updateSelectedFixtures({ intensity: 150 })
  expect(s().cues[0].fixtureValues.a).toMatchObject({ intensity: 150 })
  expect(s().manualOverrides).toEqual({})
  s().saveEditingCueAdHoc()
  expect(s().editingCueAdHocId).toBeNull()
  // A second session, cancelled, restores the cue's values.
  s().startEditingCueAdHoc('c1')
  s().updateSelectedFixtures({ intensity: 20, red: 99 })
  s().cancelEditingCueAdHoc()
  expect(s().cues[0].fixtureValues.a).toEqual({ intensity: 150, red: 10 })
  expect(s().editingCueAdHocId).toBeNull()
})

it('Edit Ad Hoc Properties targets resolve like Add Overrides', () => {
  const s = setUp()
  s().setPageObjectSelection([{ type: 'cue', id: 'btn-cue' }])
  expect(editAdHocTarget(s())).toEqual({ cueId: 'c1' })
  s().setPageObjectSelection([{ type: 'cue', id: 'btn' }])
  expect(editAdHocTarget(s())).toEqual({ popup: true })
  s().setPageObjectSelection([])
  expect(editAdHocTarget(s())).toBeNull()
})

it('releasing a property group clears only those attributes', () => {
  const s = setUp()
  s().setManualOverrides({ intensity: 200, red: 255, green: 10, blue: 5 })
  s().releaseManualOverrides(['a'], ['red', 'green', 'blue'])
  expect(s().manualOverrides.a).toEqual({ intensity: 200 })
})

it('override labels group channel attributes into LightKey property names', () => {
  const groups = overridePropertyGroups({ intensity: 200, red: 255, green: 0, blue: 0, red2: 100, shutter: 1, gobo: 3, pan: 10, uv: 5, frobnicate: 1 })
  expect(groups.map((g) => g.name)).toEqual(['Dimmer', 'Color', 'Ultraviolet', 'Pan', 'Shutter', 'Gobo Wheel', 'Frobnicate'])
  expect(groups.find((g) => g.name === 'Color')!.attributes).toEqual(['red', 'green', 'blue', 'red2'])
  expect(groups.find((g) => g.name === 'Dimmer')!.attributes).toEqual(['intensity'])
})

it('the Overrides label toggle is session state', () => {
  const s = setUp()
  expect(s().showOverrideLabels).toBe(false)
  s().toggleOverrideLabels()
  expect(s().showOverrideLabels).toBe(true)
  s().setShowOverrideLabels(false)
  expect(s().showOverrideLabels).toBe(false)
})
