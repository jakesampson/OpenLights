import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShowDef } from '../src/shared/types'

const setChannels = vi.fn()

// The renderer store writes through this bridge; provide a stub in Node.
;(globalThis as any).window = { electronAPI: { setChannels } }
;(globalThis as any).requestAnimationFrame = () => 1
;(globalThis as any).cancelAnimationFrame = () => undefined

// Imported after the globals exist.
import { useShowStore } from '../src/renderer/src/stores/showStore'

const startupShow = useShowStore.getState().show

function makeShow(): ShowDef {
  return {
    id: 'show-test',
    name: 'Test Show',
    createdAt: 0,
    updatedAt: 0,
    masterIntensity: 255,
    fixtures: [
      { id: 'f1', name: 'Front', type: 'par', channelStart: 1, channels: 4 },
      { id: 'f2', name: 'Head', type: 'moving-head', channelStart: 5, channels: 8 }
    ],
    scenes: [
      {
        id: 's1',
        name: 'One',
        fadeMs: 0,
        fixtureValues: {
          f1: { intensity: 255, red: 255, green: 0, blue: 0 },
          f2: { intensity: 0, pan: 10, tilt: 20, red: 0, green: 0, blue: 0 }
        }
      },
      {
        id: 's2',
        name: 'Two',
        fadeMs: 0,
        fixtureValues: {
          f1: { intensity: 0, red: 0, green: 0, blue: 0 },
          f2: { intensity: 200, pan: 100, tilt: 110, red: 255, green: 255, blue: 255 }
        }
      }
    ],
    automations: [],
    cueLists: [
      {
        id: 'c1',
        name: 'Set',
        steps: [
          { id: 'step1', sceneId: 's1', fadeMs: 0, holdMs: 0 },
          { id: 'step2', sceneId: 's2', fadeMs: 0, holdMs: 0 }
        ],
        loop: false
      }
    ],
    midiMappings: []
  }
}

const lastPatch = () => setChannels.mock.calls[setChannels.mock.calls.length - 1]?.[0]

beforeEach(() => {
  setChannels.mockClear()
  useShowStore.getState().setShow(makeShow())
})

describe('development show template', () => {
  it('uses the ShowBuddy fixture patch as the dev startup show', () => {
    if (!import.meta.env.DEV) return

    expect(startupShow?.name).toBe('ShowBuddyActive Demo')
    expect(
      startupShow?.fixtures.map(({ id, type, channelStart, channels }) => [
        id,
        type,
        channelStart,
        channels
      ])
    ).toEqual([
      ['pan-4x1x30', 'pixel-bar-17ch', 1, 17],
      ['dimmer-1', 'dimmer', 18, 1],
      ['dimmer-2', 'dimmer', 19, 1],
      ['simger-q12bt-1', 'rgba-4ch', 20, 4],
      ['simger-q12bt-2', 'rgba-4ch', 24, 4],
      ['simger-q12bt-3', 'rgba-4ch', 28, 4],
      ['simger-q12bt-4', 'rgba-4ch', 32, 4],
      ['corepar-q120-1', 'rgbw-4ch', 36, 4],
      ['corepar-q120-2', 'rgbw-4ch', 40, 4],
      ['corepar-q120-3', 'rgbw-4ch', 44, 4],
      ['corepar-q120-4', 'rgbw-4ch', 48, 4]
    ])
  })
})

describe('scene output', () => {
  it('sends a 1-based patch, zeroing unset channels owned by fixtures', () => {
    useShowStore.getState().goToScene('s1')
    expect(lastPatch()).toEqual({
      1: 255,
      2: 255,
      3: 0,
      4: 0,
      5: 0,
      6: 10,
      7: 20,
      8: 0,
      9: 0,
      10: 0,
      11: 0,
      12: 0
    })
  })

  it('scales dimming attributes by master but leaves pan/tilt alone', () => {
    useShowStore.getState().goToScene('s1')
    useShowStore.getState().setMaster(128)
    const patch = lastPatch()
    expect(patch[1]).toBe(128)
    expect(patch[2]).toBe(128)
    expect(patch[6]).toBe(10) // pan untouched
    expect(useShowStore.getState().show?.masterIntensity).toBe(128)
  })

  it('blackout zeros the rig explicitly and restore re-applies the active scene', () => {
    useShowStore.getState().goToScene('s1')
    useShowStore.getState().setBlackout(true)
    const patch = lastPatch()
    expect(Object.keys(patch)).toHaveLength(512)
    expect(Object.values(patch).every((v) => v === 0)).toBe(true)
    useShowStore.getState().setBlackout(false)
    expect(lastPatch()[1]).toBe(255)
  })

  it('applies a blackout scene as an explicit full zero output', () => {
    useShowStore.getState().updateScene('s1', { blackout: true })
    useShowStore.getState().goToScene('s1')
    const patch = lastPatch()
    expect(Object.keys(patch)).toHaveLength(512)
    expect(Object.values(patch).every((v) => v === 0)).toBe(true)
  })

  it('clears the universe when a show is loaded', () => {
    useShowStore.getState().goToScene('s1')
    useShowStore.getState().setShow(makeShow())
    const patch = lastPatch()
    expect(Object.keys(patch)).toHaveLength(512)
    expect(Object.values(patch).every((v) => v === 0)).toBe(true)
    expect(useShowStore.getState().activeSceneId).toBeNull()
  })

  it('duplicates a scene directly after the original', () => {
    useShowStore.getState().duplicateScene('s1')
    const scenes = useShowStore.getState().scenes
    expect(scenes).toHaveLength(3)
    expect(scenes[1].name).toBe('One Copy')
    expect(scenes[1].id).not.toBe('s1')
    expect(scenes[1].fixtureValues).toEqual(scenes[0].fixtureValues)
  })

  it('flashes a scene and restores the previous look on release', () => {
    useShowStore.getState().goToScene('s1')
    useShowStore.getState().flashScene('s2')
    expect(lastPatch()[5]).toBe(200)
    expect(useShowStore.getState().activeSceneId).toBe('s2')
    useShowStore.getState().endFlash()
    expect(lastPatch()[1]).toBe(255)
    expect(useShowStore.getState().activeSceneId).toBe('s1')
  })

  it('ignores flash during blackout', () => {
    useShowStore.getState().setBlackout(true)
    setChannels.mockClear()
    useShowStore.getState().flashScene('s1')
    expect(setChannels).not.toHaveBeenCalled()
    expect(useShowStore.getState().activeSceneId).not.toBe('s1')
  })
})

describe('fixture selection and design controls', () => {
  it('saves trusses and groups selected fixtures without sending DMX', () => {
    useShowStore.getState().selectFixtures(['f1', 'f2'])
    setChannels.mockClear()
    useShowStore.getState().groupSelectedFixtures('Stage U')
    useShowStore.getState().setPreviewTrusses([{ id: 'u', name: 'Stage U', shape: 'u', x: 400, y: 100, width: 500, height: 120, rotation: 0 }])
    const show = useShowStore.getState().show!
    expect(show.fixtures.map((fixture) => fixture.group)).toEqual(['Stage U', 'Stage U'])
    expect(show.previewTrusses?.[0].shape).toBe('u')
    expect(setChannels).not.toHaveBeenCalled()
  })

  it('saves a preview position without changing live DMX output', () => {
    setChannels.mockClear()
    useShowStore.getState().setFixturePosition('f1', { x: 300, y: 120 })
    expect(useShowStore.getState().show?.fixtures[0].previewPosition).toEqual({ x: 300, y: 120 })
    expect(setChannels).not.toHaveBeenCalled()
  })

  it('stores a dimmer preview colour without sending extra DMX channels', () => {
    const show = makeShow()
    show.fixtures = [{ id: 'd', name: 'Dimmer', type: 'dimmer', channelStart: 20, channels: 1 }]
    show.scenes[0].fixtureValues = { d: { intensity: 255 } }
    useShowStore.getState().setShow(show)
    useShowStore.getState().goToScene('s1')
    useShowStore.getState().selectFixture('d')
    useShowStore.getState().updateSelectedFixtures({ red: 200, green: 50, blue: 10 })
    expect(useShowStore.getState().scenes[0].fixtureValues.d).toEqual({ intensity: 255, red: 200, green: 50, blue: 10 })
    expect(lastPatch()[20]).toBe(255)
    expect(lastPatch()[21]).toBeUndefined()
  })

  it('replaces selection on click and adds unique fixtures on additive selection', () => {
    const store = useShowStore.getState()
    store.selectFixture('f1')
    store.selectFixture('f2', true)
    store.selectFixture('f2', true)

    expect(useShowStore.getState().selectedFixtureIds).toEqual(['f1', 'f2'])

    useShowStore.getState().selectFixture('f2')
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['f2'])
  })

  it('clears a fixture from selection when it is removed from the patch', () => {
    const store = useShowStore.getState()
    store.selectFixture('f1')
    store.removeFixture('f1')

    expect(useShowStore.getState().selectedFixtureIds).toEqual([])
  })

  it('updates only selected fixtures in the active scene and live output', () => {
    const store = useShowStore.getState()
    store.goToScene('s1')
    store.selectFixture('f2')
    store.updateSelectedFixtures({ intensity: 300, pan: 255 })

    const activeScene = useShowStore.getState().scenes.find((scene) => scene.id === 's1')
    expect(activeScene?.fixtureValues.f1?.intensity).toBe(255)
    expect(activeScene?.fixtureValues.f2?.intensity).toBe(255)
    expect(activeScene?.fixtureValues.f2?.pan).toBe(255)
    expect(lastPatch()[5]).toBe(255)
  })

  it('creates and activates a scene when editing without an active scene', () => {
    const store = useShowStore.getState()
    store.selectFixture('f1')
    store.updateSelectedFixtures({ intensity: 100 })

    const state = useShowStore.getState()
    const created = state.scenes.find((scene) => scene.id === state.activeSceneId)
    expect(created?.fixtureValues.f1?.intensity).toBe(100)
    expect(state.scenes).toHaveLength(3)
    expect(lastPatch()[1]).toBe(100)
  })
})

describe('cue lists', () => {  it('runs from go to next and stops at the end', () => {
    const store = useShowStore.getState()
    store.goToCue('c1', 0)
    expect(useShowStore.getState().activeCueIndex).toBe(0)
    expect(useShowStore.getState().cuePlaying).toBe(true)
    expect(lastPatch()[1]).toBe(255)

    useShowStore.getState().cueNext()
    expect(useShowStore.getState().activeCueIndex).toBe(1)
    expect(lastPatch()[5]).toBe(200)

    useShowStore.getState().cueNext()
    expect(useShowStore.getState().cuePlaying).toBe(false)
    expect(useShowStore.getState().activeCueIndex).toBe(1)
  })

  it('loops back to the first step when loop is enabled', () => {
    useShowStore.getState().updateCueList('c1', { loop: true })
    useShowStore.getState().goToCue('c1', 1)
    useShowStore.getState().cueNext()
    expect(useShowStore.getState().activeCueIndex).toBe(0)
    expect(lastPatch()[1]).toBe(255)
  })

  it('drops cues when their scene is deleted', () => {
    useShowStore.getState().deleteScene('s1')
    const list = useShowStore.getState().cueLists.find((l) => l.id === 'c1')
    expect(list?.steps.map((s) => s.sceneId)).toEqual(['s2'])
  })
})

describe('patch and persistence sync', () => {
  it('adds a fixture at the next free address and seeds scene values', () => {
    useShowStore.getState().addFixture(
      { id: 'dimmer-1ch', name: 'Single Dimmer', type: 'dimmer', channels: 1 },
      'Floor',
      'Floor'
    )
    const state = useShowStore.getState()
    const added = state.show?.fixtures.find((f) => f.name === 'Floor')
    expect(added?.channelStart).toBe(13)
    expect(state.scenes.every((s) => s.fixtureValues[added!.id])).toBe(true)
  })

  it('removes automation lanes that reference a removed fixture', () => {
    const state = useShowStore.getState()
    state.addAutomation({
      id: 'a1',
      name: 'Lane',
      fixtureId: 'f1',
      attribute: 'intensity',
      points: [{ t: 0, v: 0 }]
    })
    state.removeFixture('f1')
    expect(useShowStore.getState().automations).toHaveLength(0)
    expect(useShowStore.getState().show?.automations).toHaveLength(0)
  })

  it('zeroes the removed fixture range instead of leaving it latched', () => {
    useShowStore.getState().goToScene('s2')
    expect(lastPatch()[5]).toBe(200)
    useShowStore.getState().removeFixture('f2')
    const patch = lastPatch()
    for (let channel = 5; channel <= 12; channel++) expect(patch[channel]).toBe(0)
  })

  it('persists bpm and audio path on the show', () => {
    useShowStore.getState().setBpm(96.4)
    useShowStore.getState().setAudioPath('/music/set.mp3')
    expect(useShowStore.getState().bpm).toBe(96)
    expect(useShowStore.getState().show?.bpm).toBe(96)
    expect(useShowStore.getState().show?.audioPath).toBe('/music/set.mp3')

    const saved = { ...useShowStore.getState().show! }
    useShowStore.getState().setShow(saved)
    expect(useShowStore.getState().bpm).toBe(96)
    expect(useShowStore.getState().show?.audioPath).toBe('/music/set.mp3')
  })

  it('keeps scenes, automations, cue lists and MIDI mappings on the saved show', () => {
    const store = useShowStore.getState()
    store.addScene()
    store.addAutomation({
      id: 'a1',
      name: 'Lane',
      fixtureId: 'f1',
      attribute: 'intensity',
      points: [{ t: 0, v: 0 }]
    })
    store.addCueList('Second')
    store.addMidiMapping({
      id: 'm1',
      targetType: 'scene',
      targetId: 's1',
      midiType: 'noteon',
      channel: 1,
      number: 60
    })

    const show = useShowStore.getState().show!
    expect(show.scenes).toHaveLength(3)
    expect(show.automations).toHaveLength(1)
    expect(show.cueLists).toHaveLength(2)
    expect(show.midiMappings).toHaveLength(1)
  })

  it('loads a show without cue lists or master safely', () => {
    const legacy = makeShow() as any
    delete legacy.cueLists
    delete legacy.masterIntensity
    delete legacy.midiMappings
    legacy.automations = undefined
    useShowStore.getState().setShow(legacy)
    const state = useShowStore.getState()
    expect(state.cueLists).toEqual([])
    expect(state.midiMappings).toEqual([])
    expect(state.automations).toEqual([])
    expect(state.master).toBe(255)
  })
})

describe('convert scenes to presets (6.14)', () => {
  it('appends equivalent presets, keeps the originals and is idempotent', () => {
    useShowStore.getState().setShow(makeShow())
    const before = useShowStore.getState().scenes
    const added = useShowStore.getState().convertScenesToPresets()
    expect(added).toBe(2)
    const state = useShowStore.getState()
    expect(state.presets).toHaveLength(2)
    expect(state.presets[0].fixtureValues).toEqual(before[0].fixtureValues)
    expect(state.scenes).toEqual(before)
    expect(useShowStore.getState().convertScenesToPresets()).toBe(0)
    expect(useShowStore.getState().presets).toHaveLength(2)
  })
})

describe('Live page active-state behaviour (7.2)', () => {
  const pagesShow = () => ({
    ...makeShow(),
    livePages: [
      { id: 'a', name: 'A', controls: [{ id: 'c1', name: 'One', type: 'toggle' as const, presetIds: [], x: 0, y: 0 }], fadeMs: 500 },
      { id: 'b', name: 'B', controls: [{ id: 'c2', name: 'Two', type: 'toggle' as const, presetIds: [], x: 0, y: 0 }], fadeMs: 500 }
    ]
  })

  it('restores each page\'s active cues by default', () => {
    useShowStore.getState().setShow(pagesShow())
    useShowStore.getState().setLiveValue('c1', 200)
    useShowStore.getState().selectLivePage('b')
    expect(useShowStore.getState().activeLiveValues).toEqual({})
    useShowStore.getState().setLiveValue('c2', 90)
    useShowStore.getState().selectLivePage('a')
    expect(useShowStore.getState().activeLiveValues).toEqual({ c1: 200 })
    useShowStore.getState().selectLivePage('b')
    expect(useShowStore.getState().activeLiveValues).toEqual({ c2: 90 })
  })

  it('deactivates and forgets cues when the show setting is on', () => {
    useShowStore.getState().setShow(pagesShow())
    useShowStore.getState().setPageSwitchMode(true)
    useShowStore.getState().setLiveValue('c1', 200)
    useShowStore.getState().selectLivePage('b')
    expect(useShowStore.getState().activeLiveValues).toEqual({})
    expect(useShowStore.getState().pageActiveValues.a).toBeUndefined()
    useShowStore.getState().selectLivePage('a')
    expect(useShowStore.getState().activeLiveValues).toEqual({})
    expect(useShowStore.getState().show?.deactivateOnPageSwitch).toBe(true)
  })

  it('clears remembered levels on a project change', () => {
    useShowStore.getState().setShow(pagesShow())
    useShowStore.getState().setLiveValue('c1', 200)
    useShowStore.getState().selectLivePage('b')
    expect(Object.keys(useShowStore.getState().pageActiveValues)).toContain('a')
    useShowStore.getState().setShow(pagesShow())
    expect(useShowStore.getState().pageActiveValues).toEqual({})
    expect(useShowStore.getState().activeLiveValues).toEqual({})
  })
})

describe('Live page multi-select and multi-object commands (7.5)', () => {
  const pageShow = () => ({
    ...makeShow(),
    livePages: [{
      id: 'p',
      name: 'Page',
      fadeMs: 300,
      controls: [
        { id: 'c1', name: 'One', type: 'toggle' as const, presetIds: [], x: 20, y: 20 },
        { id: 'c2', name: 'Two', type: 'flash' as const, presetIds: [], x: 220, y: 20 }
      ],
      cueListWidgets: [{ id: 'w1', cueListId: 'c1', x: 20, y: 120 }],
      annotations: [{ id: 'a1', type: 'label' as const, text: 'Label', x: 300, y: 200, width: 160, height: 40 }]
    }]
  })
  const page = () => useShowStore.getState().show!.livePages![0]

  it('supports shift-click toggle, marquee selection and clearing', () => {
    useShowStore.getState().setShow(pageShow())
    useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: 'c1' }])
    useShowStore.getState().togglePageObjectSelection({ type: 'cue', id: 'c2' })
    expect(useShowStore.getState().selectedPageObjects).toEqual([
      { type: 'cue', id: 'c1' }, { type: 'cue', id: 'c2' }
    ])
    useShowStore.getState().togglePageObjectSelection({ type: 'cue', id: 'c1' })
    expect(useShowStore.getState().selectedPageObjects).toEqual([{ type: 'cue', id: 'c2' }])

    useShowStore.getState().selectPageObjectsInRect({ x: 0, y: 0, width: 200, height: 150 })
    expect(useShowStore.getState().selectedPageObjects.map((r) => r.id).sort()).toEqual(['c1', 'w1'])
    useShowStore.getState().clearPageObjectSelection()
    expect(useShowStore.getState().selectedPageObjects).toEqual([])
  })

  it('moves several selected objects together and undoes/redoes the move', () => {
    useShowStore.getState().setShow(pageShow())
    useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: 'c1' }, { type: 'list', id: 'w1' }])
    useShowStore.getState().moveSelectedPageObjects(20, 30)
    expect(page().controls[0]).toMatchObject({ x: 40, y: 50 })
    expect(page().cueListWidgets![0]).toMatchObject({ x: 40, y: 150 })
    expect(page().controls[1]).toMatchObject({ x: 220, y: 20 })
    useShowStore.getState().undo()
    expect(page().controls[0]).toMatchObject({ x: 20, y: 20 })
    expect(page().cueListWidgets![0]).toMatchObject({ x: 20, y: 120 })
    useShowStore.getState().redo()
    expect(page().controls[0]).toMatchObject({ x: 40, y: 50 })
  })

  it('deletes several objects, prunes their active levels and undoes the delete', () => {
    useShowStore.getState().setShow(pageShow())
    useShowStore.getState().setLiveValue('c1', 200)
    useShowStore.getState().setLiveValue('c2', 100)
    useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: 'c1' }, { type: 'annotation', id: 'a1' }])
    useShowStore.getState().deleteSelectedPageObjects()
    expect(page().controls.map((c) => c.id)).toEqual(['c2'])
    expect(page().annotations).toEqual([])
    expect(useShowStore.getState().activeLiveValues).toEqual({ c2: 100 })
    expect(useShowStore.getState().selectedPageObjects).toEqual([])
    useShowStore.getState().undo()
    expect(page().controls.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(page().annotations!.map((a) => a.id)).toEqual(['a1'])
  })

  it('copies then pastes several objects with fresh ids and supports undo', () => {
    useShowStore.getState().setShow(pageShow())
    useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: 'c1' }, { type: 'list', id: 'w1' }])
    useShowStore.getState().copySelectedPageObjects()
    useShowStore.getState().pastePageObjects(10, 10)
    const pasted = useShowStore.getState().selectedPageObjects
    expect(pasted).toHaveLength(2)
    expect(pasted.map((r) => r.id)).not.toContain('c1')
    expect(page().controls).toHaveLength(3)
    expect(page().controls[2]).toMatchObject({ name: 'One', x: 30, y: 30 })
    expect(page().cueListWidgets).toHaveLength(2)
    useShowStore.getState().undo()
    expect(page().controls).toHaveLength(2)
    expect(page().cueListWidgets).toHaveLength(1)
  })

  it('duplicates several objects with fresh ids and supports undo', () => {
    useShowStore.getState().setShow(pageShow())
    useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: 'c2' }])
    useShowStore.getState().duplicateSelectedPageObjects()
    expect(page().controls).toHaveLength(3)
    expect(page().controls[2].id).not.toBe('c2')
    expect(page().controls[2].name).toBe('Two')
    useShowStore.getState().undo()
    expect(page().controls).toHaveLength(2)
  })

  it('does nothing when paste is attempted with an empty clipboard or no selection', () => {
    useShowStore.getState().setShow(pageShow())
    useShowStore.getState().clearPageObjectSelection()
    useShowStore.getState().copySelectedPageObjects()
    useShowStore.getState().pastePageObjects()
    useShowStore.getState().deleteSelectedPageObjects()
    useShowStore.getState().duplicateSelectedPageObjects()
    useShowStore.getState().moveSelectedPageObjects(10, 10)
    expect(page().controls).toHaveLength(2)
    expect(page().cueListWidgets).toHaveLength(1)
    expect(page().controls[0]).toMatchObject({ x: 20, y: 20 })
  })

  it('resizes a page object with clamping and supports undo/redo', () => {
    useShowStore.getState().setShow(pageShow())
    useShowStore.getState().resizePageObject({ type: 'cue', id: 'c1' }, 213, 5000)
    expect(page().controls[0]).toMatchObject({ width: 210, height: 900 })
    useShowStore.getState().undo()
    expect(page().controls[0]).toMatchObject({ width: 160, height: 90 })
    useShowStore.getState().redo()
    expect(page().controls[0]).toMatchObject({ width: 210, height: 900 })
  })

  it('renames a cue and an annotation inline and supports undo', () => {
    useShowStore.getState().setShow(pageShow())
    useShowStore.getState().renamePageObject({ type: 'cue', id: 'c1' }, '  New name  ')
    useShowStore.getState().renamePageObject({ type: 'annotation', id: 'a1' }, 'Stage left')
    expect(page().controls[0].name).toBe('New name')
    expect(page().annotations![0].text).toBe('Stage left')
    useShowStore.getState().undo()
    expect(page().annotations![0].text).toBe('Label')
    useShowStore.getState().undo()
    expect(page().controls[0].name).toBe('One')
  })
})

describe('attaching and styling page objects (7.7, 7.8)', () => {
  const frameShow = () => ({
    ...makeShow(),
    livePages: [{
      id: 'p',
      name: 'Page',
      controls: [
        { id: 'c1', name: 'On frame', type: 'toggle' as const, presetIds: [], x: 50, y: 250, attachedTo: 'frame' },
        { id: 'c2', name: 'On c1', type: 'flash' as const, presetIds: [], x: 70, y: 260, attachedTo: 'c1' },
        { id: 'c3', name: 'Free', type: 'toggle' as const, presetIds: [], x: 600, y: 20 }
      ],
      annotations: [{ id: 'frame', type: 'frame' as const, text: 'Frame', x: 300, y: 200, width: 200, height: 100 }]
    }]
  })
  const page = () => useShowStore.getState().show!.livePages![0]

  it('moves a frame together with its attached buttons', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().setPageObjectSelection([{ type: 'annotation', id: 'frame' }])
    useShowStore.getState().moveSelectedPageObjects(30, 40)
    expect(page().annotations![0]).toMatchObject({ x: 330, y: 240 })
    expect(page().controls[0]).toMatchObject({ x: 80, y: 290 })
    expect(page().controls[1]).toMatchObject({ x: 100, y: 300 })
    expect(page().controls[2]).toMatchObject({ x: 600, y: 20 })
    useShowStore.getState().undo()
    expect(page().annotations![0]).toMatchObject({ x: 300, y: 200 })
    expect(page().controls[0]).toMatchObject({ x: 50, y: 250 })
  })

  it('attaches and detaches an object through history-gated store actions', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().attachPageObject({ type: 'cue', id: 'c3' }, 'frame')
    expect(page().controls[2].attachedTo).toBe('frame')
    useShowStore.getState().undo()
    expect(page().controls[2].attachedTo).toBeUndefined()
    useShowStore.getState().redo()
    useShowStore.getState().attachPageObject({ type: 'cue', id: 'c3' }, null)
    expect(page().controls[2].attachedTo).toBeUndefined()
  })

  it('clears attachments to deleted objects', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().setPageObjectSelection([{ type: 'annotation', id: 'frame' }])
    useShowStore.getState().deleteSelectedPageObjects()
    expect(page().controls[0].attachedTo).toBeUndefined()
    expect(page().controls[1].attachedTo).toBe('c1')
  })

  it('saves a per-object style patch and supports undo', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().setPageObjectStyle({ type: 'cue', id: 'c1' }, { bold: true, fontSize: 22 })
    expect(page().controls[0].style).toMatchObject({ bold: true, fontSize: 22 })
    useShowStore.getState().undo()
    expect(page().controls[0].style).toMatchObject({ bold: false, fontSize: 12 })
  })
})

describe('frame exclusivity and modifiers (7.9)', () => {
  const frameShow = () => ({
    ...makeShow(),
    livePages: [{
      id: 'p',
      name: 'Page',
      controls: [
        { id: 'in1', name: 'In one', type: 'toggle' as const, presetIds: [], x: 100, y: 100 },
        { id: 'in2', name: 'In two', type: 'toggle' as const, presetIds: [], x: 120, y: 200 },
        { id: 'out', name: 'Outside', type: 'toggle' as const, presetIds: [], x: 400, y: 100 }
      ],
      annotations: [{ id: 'frame', type: 'frame' as const, text: 'Frame', x: 100, y: 100, width: 200, height: 200 }]
    }]
  })
  const page = () => useShowStore.getState().show!.livePages![0]
  const values = () => useShowStore.getState().activeLiveValues

  it('releases sibling cues when activating a cue in an exclusive frame', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().configureFrame('frame', { exclusive: true })
    useShowStore.getState().setLiveValue('in1', 255)
    useShowStore.getState().setLiveValue('in2', 255)
    expect(values().in2).toBe(255)
    expect(values().in1).toBeUndefined()
    expect(values().out).toBeUndefined()
    // A cue outside the frame is unaffected by exclusivity.
    useShowStore.getState().setLiveValue('out', 200)
    useShowStore.getState().setLiveValue('in2', 200)
    expect(values().out).toBe(200)
    expect(values().in1).toBeUndefined()
  })

  it('does not release siblings in a non-exclusive frame', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().setLiveValue('in1', 255)
    useShowStore.getState().setLiveValue('in2', 255)
    expect(values().in1).toBe(255)
    expect(values().in2).toBe(255)
  })

  it('deactivating a cue (level 0) does not release siblings', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().configureFrame('frame', { exclusive: true })
    useShowStore.getState().setLiveValue('in1', 255)
    useShowStore.getState().setLiveValue('in1', 0)
    expect(values().in1).toBe(0)
    expect(values().in2).toBeUndefined()
  })

  it('scales output levels by a frame intensity modifier without changing raw levels', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().configureFrame('frame', { intensity: 50 })
    useShowStore.getState().setLiveValue('in1', 200)
    useShowStore.getState().setLiveValue('out', 200)
    expect(useShowStore.getState().getLiveOutputLevels()).toMatchObject({ in1: 100, out: 200 })
    expect(values().in1).toBe(200)
  })

  it('stores frame configuration through a history-gated action', () => {
    useShowStore.getState().setShow(frameShow())
    useShowStore.getState().configureFrame('frame', { exclusive: true, intensity: 60, speed: 120 })
    expect(page().annotations![0].frame).toEqual({ exclusive: true, intensity: 60, speed: 120 })
    useShowStore.getState().undo()
    expect(page().annotations![0].frame).toEqual({ exclusive: false, intensity: 100, speed: 100 })
  })
})
