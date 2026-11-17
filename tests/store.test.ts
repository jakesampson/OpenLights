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
