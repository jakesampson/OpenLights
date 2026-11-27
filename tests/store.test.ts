import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShowDef } from '../src/shared/types'

const setChannels = vi.fn()

// The renderer store writes through this bridge; provide a stub in Node.
;(globalThis as any).window = { electronAPI: { setChannels } }
;(globalThis as any).requestAnimationFrame = () => 1
;(globalThis as any).cancelAnimationFrame = () => undefined

// Imported after the globals exist.
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { LiveDropPayload } from '../src/renderer/src/lib/liveDrops'
import { frameForCue } from '../src/renderer/src/lib/liveFrames'

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
    cues: [
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
          { id: 'step1', cueId: 's1', fadeMs: 0, holdMs: 0 },
          { id: 'step2', cueId: 's2', fadeMs: 0, holdMs: 0 }
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

describe('effect editing', () => {
  const effect = {
    id: 'fx1', name: 'Pulse', fixtureIds: ['f1'], attribute: 'intensity', waveform: 'square' as const,
    speed: 1, syncToBpm: false, size: 100, offset: 100, phaseSpread: 0, enabled: true
  }

  it('stops a chooser preview when the editor opens, the chooser closes, or another show loads', () => {
    // Jake, 25 Nov 2026: a template preview is session-only — it never
    // lands on a fixture, so loading another show must not leave it
    // running on the old show's fixture ids.
    const store = useShowStore.getState()
    const preview = {
      id: 'preview-1', name: 'Triangle Small', fixtureIds: ['f2'], attribute: 'position',
      waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 128, phaseSpread: 0,
      enabled: true, kind: 'movement', timingMode: 'fixed', movementPathId: 'builtin-triangle-small', durationMs: 2000
    } as const
    store.setPreviewEffect(preview, 'builtin-position-triangle-small')
    expect(useShowStore.getState().previewEffect?.name).toBe('Triangle Small')
    expect(useShowStore.getState().previewEffectTemplateId).toBe('builtin-position-triangle-small')
    // Opening the editor stops it.
    store.setEditingEffectId('e-1')
    expect(useShowStore.getState().previewEffect).toBeNull()
    store.setPreviewEffect(preview, 'builtin-position-triangle-small')
    // Closing the chooser stops it.
    store.setEffectChooserAttribute(null)
    expect(useShowStore.getState().previewEffect).toBeNull()
    store.setPreviewEffect(preview, 'builtin-position-triangle-small')
    // Loading another show stops it.
    useShowStore.getState().setShow(makeShow())
    expect(useShowStore.getState().previewEffect).toBeNull()
    expect(useShowStore.getState().previewEffectTemplateId).toBeNull()
    // And the preview is never in the show's stored effects.
    expect(useShowStore.getState().effects).toHaveLength(0)
  })

  it('copies, pastes and deletes effects with independent ids', () => {
    useShowStore.getState().addEffect(effect)
    useShowStore.getState().copyEffect('fx1')
    const pasted = useShowStore.getState().pasteEffect()
    expect(pasted).not.toBe('fx1')
    expect(useShowStore.getState().effects).toHaveLength(2)
    useShowStore.getState().removeEffect('fx1')
    expect(useShowStore.getState().effects.map((item) => item.id)).toEqual([pasted])
  })

  it('saves and reapplies an effect template', () => {
    useShowStore.getState().addEffect(effect)
    useShowStore.getState().saveEffectTemplate('fx1')
    const template = useShowStore.getState().show?.effectTemplates?.[0]
    expect(template?.name).toBe('Pulse')
    const applied = useShowStore.getState().applyEffectTemplate(template!.id)
    expect(applied).toBeTruthy()
    expect(useShowStore.getState().effects).toHaveLength(2)
  })
})

describe('saved preferences', () => {
  it('persists timing, appearance and USB DMX defaults and applies the default cue fade', () => {
    useShowStore.getState().updatePreferences({ defaultFadeMs: 2300, pageFadeMs: 700, theme: 'system', dmxProtocol: 'enttec-usb-pro' })
    useShowStore.getState().setPageSwitchMode(true)
    expect(useShowStore.getState().show?.preferences).toEqual({ defaultFadeMs: 2300, pageFadeMs: 700, theme: 'system', dmxProtocol: 'enttec-usb-pro' })
    expect(useShowStore.getState().show?.deactivateOnPageSwitch).toBe(true)
    useShowStore.getState().addCue()
    expect(useShowStore.getState().cues.at(-1)?.fadeMs).toBe(2300)
  })
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

describe('cue output', () => {
  it('sends a 1-based patch, zeroing unset channels owned by fixtures', () => {
    useShowStore.getState().activateCue('s1')
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
    useShowStore.getState().activateCue('s1')
    useShowStore.getState().setMaster(128)
    const patch = lastPatch()
    expect(patch[1]).toBe(128)
    expect(patch[2]).toBe(128)
    expect(patch[6]).toBe(10) // pan untouched
    expect(useShowStore.getState().show?.masterIntensity).toBe(128)
  })

  it('blackout zeros the rig explicitly and restore re-applies the active cue', () => {
    useShowStore.getState().activateCue('s1')
    useShowStore.getState().setBlackout(true)
    const patch = lastPatch()
    expect(Object.keys(patch)).toHaveLength(512)
    expect(Object.values(patch).every((v) => v === 0)).toBe(true)
    useShowStore.getState().setBlackout(false)
    expect(lastPatch()[1]).toBe(255)
  })

  it('applies a blackout cue as an explicit full zero output', () => {
    useShowStore.getState().updateCue('s1', { blackout: true })
    useShowStore.getState().activateCue('s1')
    const patch = lastPatch()
    expect(Object.keys(patch)).toHaveLength(512)
    expect(Object.values(patch).every((v) => v === 0)).toBe(true)
  })

  it('clears the universe when a show is loaded', () => {
    useShowStore.getState().activateCue('s1')
    useShowStore.getState().setShow(makeShow())
    const patch = lastPatch()
    // The rig returns to the fixtures' defaults, not to the previous
    // cue's look (Jake, 20 Nov 2026): the dimmers are closed, so no
    // light — but pan/tilt sit centred (128) and the colour default is
    // blue, gated by the dimmer. A stale cue's red (255) or pan (10)
    // must not survive the load.
    expect(useShowStore.getState().activeCueId).toBeNull()
    expect(patch[1]).toBe(0) // f1 dimmer closed — no light
    expect(patch[2]).toBe(0) // f1 red: the stale cue's 255 is gone
    expect(patch[4]).toBe(255) // f1 blue: the default colour, gated by the dimmer
    expect(patch[5]).toBe(0) // f2 dimmer closed — no light
    expect(patch[6]).toBe(128) // f2 pan: centred default, not the stale 10
    expect(patch[7]).toBe(128) // f2 tilt: centred default, not the stale 20
    expect(patch[8]).toBe(0) // f2 red: the stale cue's 0 stays 0
  })

  it('duplicates a cue directly after the original', () => {
    useShowStore.getState().duplicateCue('s1')
    const cues = useShowStore.getState().cues
    expect(cues).toHaveLength(3)
    expect(cues[1].name).toBe('One Copy')
    expect(cues[1].id).not.toBe('s1')
    expect(cues[1].fixtureValues).toEqual(cues[0].fixtureValues)
  })

  it('flashes a cue and restores the previous look on release', () => {
    useShowStore.getState().activateCue('s1')
    useShowStore.getState().flashCue('s2')
    expect(lastPatch()[5]).toBe(200)
    expect(useShowStore.getState().activeCueId).toBe('s2')
    useShowStore.getState().endFlash()
    expect(lastPatch()[1]).toBe(255)
    expect(useShowStore.getState().activeCueId).toBe('s1')
  })

  it('ignores flash during blackout', () => {
    useShowStore.getState().setBlackout(true)
    setChannels.mockClear()
    useShowStore.getState().flashCue('s1')
    expect(setChannels).not.toHaveBeenCalled()
    expect(useShowStore.getState().activeCueId).not.toBe('s1')
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
    show.cues[0].fixtureValues = { d: { intensity: 255 } }
    useShowStore.getState().setShow(show)
    useShowStore.getState().activateCue('s1')
    useShowStore.getState().selectFixture('d')
    useShowStore.getState().updateSelectedFixtures({ red: 200, green: 50, blue: 10 })
    expect(useShowStore.getState().cues[0].fixtureValues.d).toEqual({ intensity: 255, red: 200, green: 50, blue: 10 })
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

  it('updates only selected fixtures in the active cue and live output', () => {
    const store = useShowStore.getState()
    store.activateCue('s1')
    store.selectFixture('f2')
    store.updateSelectedFixtures({ intensity: 300, pan: 255 })

    const activeCue = useShowStore.getState().cues.find((cue) => cue.id === 's1')
    expect(activeCue?.fixtureValues.f1?.intensity).toBe(255)
    expect(activeCue?.fixtureValues.f2?.intensity).toBe(255)
    expect(activeCue?.fixtureValues.f2?.pan).toBe(255)
    expect(lastPatch()[5]).toBe(255)
  })

  it('creates and activates a cue when editing without an active cue', () => {
    const store = useShowStore.getState()
    store.selectFixture('f1')
    store.updateSelectedFixtures({ intensity: 100 })

    const state = useShowStore.getState()
    const created = state.cues.find((cue) => cue.id === state.activeCueId)
    expect(created?.fixtureValues.f1?.intensity).toBe(100)
    expect(state.cues).toHaveLength(3)
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

  it('drops cues when their cue is deleted', () => {
    useShowStore.getState().deleteCue('s1')
    const list = useShowStore.getState().cueLists.find((l) => l.id === 'c1')
    expect(list?.steps.map((s) => s.cueId)).toEqual(['s2'])
  })
})

describe('patch and persistence sync', () => {
  it('adds a fixture at the next free address and seeds cue values', () => {
    useShowStore.getState().addFixture(
      { id: 'dimmer-1ch', name: 'Single Dimmer', type: 'dimmer', channels: 1 },
      'Floor',
      'Floor'
    )
    const state = useShowStore.getState()
    const added = state.show?.fixtures.find((f) => f.name === 'Floor')
    expect(added?.channelStart).toBe(13)
    expect(state.cues.every((s) => s.fixtureValues[added!.id])).toBe(true)
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
    useShowStore.getState().activateCue('s2')
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

  it('keeps cues, automations, cue lists and MIDI mappings on the saved show', () => {
    const store = useShowStore.getState()
    store.addCue()
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
      targetType: 'cue',
      targetId: 's1',
      midiType: 'noteon',
      channel: 1,
      number: 60
    })

    const show = useShowStore.getState().show!
    expect(show.cues).toHaveLength(3)
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

describe('convert cues to presets (6.14)', () => {
  it('appends equivalent presets, keeps the originals and is idempotent', () => {
    useShowStore.getState().setShow(makeShow())
    const before = useShowStore.getState().cues
    const added = useShowStore.getState().convertCuesToPresets()
    expect(added).toBe(2)
    const state = useShowStore.getState()
    expect(state.presets).toHaveLength(2)
    expect(state.presets[0].fixtureValues).toEqual(before[0].fixtureValues)
    expect(state.cues).toEqual(before)
    expect(useShowStore.getState().convertCuesToPresets()).toBe(0)
    expect(useShowStore.getState().presets).toHaveLength(2)
  })
})

describe('Live page active-state behaviour (7.2)', () => {
  const pagesShow = () => ({
    ...makeShow(),
    livePages: [
      { id: 'a', name: 'A', controls: [{ id: 'c1', name: 'One', type: 'push' as const, presetIds: [], x: 0, y: 0 }], fadeMs: 500 },
      { id: 'b', name: 'B', controls: [{ id: 'c2', name: 'Two', type: 'push' as const, presetIds: [], x: 0, y: 0 }], fadeMs: 500 }
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
        { id: 'c1', name: 'One', type: 'push' as const, presetIds: [], x: 20, y: 20 },
        { id: 'c2', name: 'Two', type: 'push', behavior: 'flash' as const, presetIds: [], x: 220, y: 20 }
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
    // One cuelist widget per page (Jake, 27 Nov 2026): the page already
    // has w1, so the pasted widget is dropped — only the button lands.
    expect(pasted).toHaveLength(1)
    expect(pasted.map((r) => r.id)).not.toContain('c1')
    expect(page().controls).toHaveLength(3)
    expect(page().controls[2]).toMatchObject({ name: 'One', x: 30, y: 30 })
    expect(page().cueListWidgets).toHaveLength(1)
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
    expect(page().controls[0]).toMatchObject({ width: 120, height: 40 }) // LIVE_CUE_SIZE, filled in by the migration for a sizeless control
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
        { id: 'c1', name: 'On frame', type: 'push' as const, presetIds: [], x: 50, y: 250, attachedTo: 'frame' },
        { id: 'c2', name: 'On c1', type: 'push', behavior: 'flash' as const, presetIds: [], x: 70, y: 260, attachedTo: 'c1' },
        { id: 'c3', name: 'Free', type: 'push' as const, presetIds: [], x: 600, y: 20 }
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
        { id: 'in1', name: 'In one', type: 'push' as const, presetIds: [], x: 100, y: 100 },
        { id: 'in2', name: 'In two', type: 'push' as const, presetIds: [], x: 120, y: 200 },
        { id: 'out', name: 'Outside', type: 'push' as const, presetIds: [], x: 400, y: 100 }
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

describe('dropping presets and sequences on live pages (7.10)', () => {
  const dropShow = () => ({
    ...makeShow(),
    livePages: [{
      id: 'p',
      name: 'Page',
      controls: [{ id: 'c1', name: 'Cue', type: 'push' as const, presetIds: ['old'], x: 600, y: 20 }],
      annotations: [{ id: 'frame', type: 'frame' as const, text: 'Frame', x: 200, y: 200, width: 300, height: 200 }]
    }]
  })
  const page = () => useShowStore.getState().show!.livePages![0]
  const payload = (overrides: Partial<LiveDropPayload> = {}): LiveDropPayload => ({
    presetIds: ['p1', 'p2'],
    sequenceIds: ['s1'],
    effectIds: [],
    presetNames: { p1: 'Blue', p2: 'Red' },
    sequenceNames: { s1: 'Chase' },
    ...overrides
  })

  it('creates a cue on the page with all dragged ids, undoable', () => {
    useShowStore.getState().setShow(dropShow())
    useShowStore.getState().dropOnLivePage(payload(), { kind: 'page', x: 100, y: 100 })
    expect(page().controls).toHaveLength(2)
    const cue = page().controls[1]
    expect(cue).toMatchObject({ name: '2 presets + 1 sequence', presetIds: ['p1', 'p2'], sequenceIds: ['s1'] })
    expect(useShowStore.getState().selectedPageObjects).toEqual([{ type: 'cue', id: cue.id }])
    useShowStore.getState().undo()
    expect(page().controls).toHaveLength(1)
  })

  it('creates a cue inside a dropped-on frame', () => {
    useShowStore.getState().setShow(dropShow())
    useShowStore.getState().dropOnLivePage(payload(), { kind: 'frame', frameId: 'frame', x: 250, y: 250 })
    expect(page().controls).toHaveLength(2)
    expect(frameForCue(page(), page().controls[1].id)).toBe('frame')
  })

  it('merges presets and sequences into a dropped-on cue, undoable', () => {
    useShowStore.getState().setShow(dropShow())
    useShowStore.getState().dropOnLivePage(payload({ presetIds: ['p1', 'old'] }), { kind: 'cue', cueId: 'c1' })
    expect(page().controls).toHaveLength(1)
    expect(page().controls[0]).toMatchObject({ presetIds: ['old', 'p1'], sequenceIds: ['s1'] })
    expect(useShowStore.getState().selectedPageObjects).toEqual([{ type: 'cue', id: 'c1' }])
    useShowStore.getState().undo()
    expect(page().controls[0].presetIds).toEqual(['old'])
    expect(page().controls[0].sequenceIds).toEqual([])
  })

  it('does nothing when the app is locked', () => {
    useShowStore.getState().setShow(dropShow())
    useShowStore.getState().lockApp()
    useShowStore.getState().dropOnLivePage(payload(), { kind: 'page', x: 100, y: 100 })
    expect(page().controls).toHaveLength(1)
    useShowStore.getState().unlockApp()
  })
})

describe('editing cue contents (8.2)', () => {
  const cueShow = () => ({ ...makeShow(), livePages: [{ id: 'p', name: 'Page', controls: [{ id: 'c', name: 'Cue', type: 'push' as const, presetIds: ['p1'], sequenceIds: ['s1'], adHocValues: { f1: { intensity: 100 } } }] }] })
  const cue = () => useShowStore.getState().show!.livePages![0].controls[0]

  it('edits presets, sequences and ad-hoc values through undoable store commands', () => {
    useShowStore.getState().setShow(cueShow())
    useShowStore.getState().editCueContents('c', { type: 'add-preset', id: 'p2' })
    useShowStore.getState().editCueContents('c', { type: 'remove-sequence', id: 's1' })
    useShowStore.getState().editCueContents('c', { type: 'set-ad-hoc', fixtureId: 'f1', property: 'intensity', value: 200 })
    expect(cue()).toMatchObject({ presetIds: ['p1', 'p2'], sequenceIds: [], adHocValues: { f1: { intensity: 200 } } })
    useShowStore.getState().undo()
    expect(cue().adHocValues?.f1.intensity).toBe(100)
  })

  it('rejects cue content edits while locked', () => {
    useShowStore.getState().setShow(cueShow())
    useShowStore.getState().lockApp()
    useShowStore.getState().editCueContents('c', { type: 'remove-preset', id: 'p1' })
    expect(cue().presetIds).toEqual(['p1'])
    useShowStore.getState().unlockApp()
  })
})

describe('cue timing (8.3)', () => {
  it('stores cue timing through history and rejects edits while locked', () => {
    const show = { ...makeShow(), livePages: [{ id: 'p', name: 'Page', controls: [{ id: 'c', name: 'Cue', type: 'push' as const, presetIds: [] }] }] }
    useShowStore.getState().setShow(show)
    useShowStore.getState().configureCueTiming('c', { delayMs: 100, fadeInMs: 500, fadeOutMs: 250, curve: 'ease-in-out' })
    const cue = () => useShowStore.getState().show!.livePages![0].controls[0]
    expect(cue().timing).toEqual({ delayMs: 100, fadeInMs: 500, fadeOutMs: 250, curve: 'ease-in-out' })
    useShowStore.getState().undo()
    expect(cue().timing).toEqual({ delayMs: 0, fadeInMs: 0, fadeOutMs: 0, curve: 'linear' })
    useShowStore.getState().lockApp()
    useShowStore.getState().configureCueTiming('c', { fadeInMs: 999 })
    expect(cue().timing?.fadeInMs).toBe(0)
    useShowStore.getState().unlockApp()
  })
})

describe('cue appearance and behaviour (8.4)', () => {
  it('stores appearance and releases other cues when requested', () => {
    const show = { ...makeShow(), livePages: [{ id: 'p', name: 'Page', controls: [{ id: 'a', name: 'A', type: 'push' as const, presetIds: [] }, { id: 'b', name: 'B', type: 'push' as const, presetIds: [] }] }] }
    useShowStore.getState().setShow(show)
    useShowStore.getState().configureCueAppearance('b', { color: '#123456', releaseOthers: true })
    expect(useShowStore.getState().show!.livePages![0].controls[1].appearance).toEqual({ color: '#123456', releaseOthers: true })
    useShowStore.getState().setLiveValue('a', 255)
    useShowStore.getState().setLiveValue('b', 255)
    expect(useShowStore.getState().activeLiveValues).toEqual({ b: 255 })
  })
})

describe('cue modifiers (8.5)', () => {
  it('stores clamped live modifiers and scales output intensity', () => {
    const show = { ...makeShow(), livePages: [{ id: 'p', name: 'Page', controls: [{ id: 'c', name: 'Cue', type: 'push' as const, presetIds: [] }] }] }
    useShowStore.getState().setShow(show)
    useShowStore.getState().configureCueModifiers('c', { intensity: 50, speed: 300, size: -10 })
    expect(useShowStore.getState().show!.livePages![0].controls[0].modifiers).toEqual({ intensity: 50, speed: 200, size: 0 })
    useShowStore.getState().setLiveValue('c', 200)
    expect(useShowStore.getState().getLiveOutputLevels().c).toBe(100)
  })
})

describe('cue priority (8.6)', () => {
  it('records activation order and stores explicit priority', () => {
    const show = { ...makeShow(), livePages: [{ id: 'p', name: 'Page', controls: [{ id: 'a', name: 'A', type: 'push' as const, presetIds: [] }, { id: 'b', name: 'B', type: 'push' as const, presetIds: [] }] }] }
    useShowStore.getState().setShow(show)
    useShowStore.getState().setLiveValue('b', 255)
    useShowStore.getState().setLiveValue('a', 255)
    expect(useShowStore.getState().liveActivationOrder.a).toBeGreaterThan(useShowStore.getState().liveActivationOrder.b)
    useShowStore.getState().configureCuePriority('b', 20)
    expect(useShowStore.getState().show!.livePages![0].controls[1].priority).toBe(20)
  })
})

describe('cuelist editing (8.7)', () => {
  it('runs cuelist editing commands through history', () => {
    useShowStore.getState().setShow(makeShow())
    const list = useShowStore.getState().cueLists[0]
    const before = list.steps.length
    useShowStore.getState().editCueListCommand(list.id, { type: 'add', step: { id: 'new', cueId: useShowStore.getState().cues[0].id, fadeMs: 100, holdMs: 200 } })
    expect(useShowStore.getState().cueLists[0].steps).toHaveLength(before + 1)
    useShowStore.getState().undo()
    expect(useShowStore.getState().cueLists[0].steps).toHaveLength(before)
  })
})

describe('cuelist manual crossfade (8.8)', () => {
  it('clamps the operator fader without adding undo history', () => {
    useShowStore.getState().setManualCrossfade(0.5)
    expect(useShowStore.getState().manualCrossfade).toBe(0.5)
    useShowStore.getState().setManualCrossfade(2)
    expect(useShowStore.getState().manualCrossfade).toBe(1)
  })

  it('blends live output between the current and next cue at 50 percent (8.8a)', () => {
    useShowStore.getState().goToCue('c1', 0)
    expect(lastPatch()[1]).toBe(255)
    useShowStore.getState().setManualCrossfade(0.5)
    expect(useShowStore.getState().manualCrossfade).toBe(0.5)
    // Halfway between cue One (ch1 255, ch5 0, ch6 pan 10) and cue Two
    // (ch1 0, ch5 200, ch6 pan 100) — the 50% blend the pure
    // manualCrossfade() blender produces, sent as live output.
    expect(lastPatch()).toEqual({ 1: 128, 2: 128, 3: 0, 4: 0, 5: 100, 6: 55, 7: 65, 8: 128, 9: 128, 10: 128, 11: 0, 12: 0 })
    // The fader only blends; it does not advance until it reaches the end.
    expect(useShowStore.getState().activeCueIndex).toBe(0)
  })

  it('completes the crossfade at the opposite end, then fades back the other way (8.8a)', () => {
    useShowStore.getState().updateCueList('c1', { loop: true })
    useShowStore.getState().goToCue('c1', 0)
    // Drag from the resting end (1) to the opposite end (0).
    useShowStore.getState().setManualCrossfade(0)
    const afterFirst = useShowStore.getState()
    expect(afterFirst.activeCueIndex).toBe(1)
    expect(afterFirst.activeCueId).toBe('s2')
    expect(lastPatch()[5]).toBe(200)
    // The slider now rests at 0: dragging back toward 1 blends Two into One.
    useShowStore.getState().setManualCrossfade(0.5)
    expect(lastPatch()[1]).toBe(128)
    expect(lastPatch()[5]).toBe(100)
    useShowStore.getState().setManualCrossfade(1)
    const afterSecond = useShowStore.getState()
    expect(afterSecond.activeCueIndex).toBe(0)
    expect(afterSecond.activeCueId).toBe('s1')
    expect(lastPatch()[1]).toBe(255)
  })

  it('sends nothing before playback starts or past the last cue (8.8a)', () => {
    const calls = setChannels.mock.calls.length
    useShowStore.getState().setManualCrossfade(0.5)
    expect(useShowStore.getState().manualCrossfade).toBe(0.5)
    expect(setChannels.mock.calls.length).toBe(calls)
    useShowStore.getState().goToCue('c1', 1)
    const afterGo = setChannels.mock.calls.length
    useShowStore.getState().setManualCrossfade(0)
    // Last step of a non-looping list: no next cue, so no blend is sent.
    expect(setChannels.mock.calls.length).toBe(afterGo)
    expect(useShowStore.getState().activeCueIndex).toBe(1)
  })
})

describe('frame stepping and effect continuity (8.10)', () => {
  it('steps frame cues while global effects continue across cuelist cues', () => {
    const show = { ...makeShow(), livePages: [{ id: 'p', name: 'P', controls: [{ id: 'a', name: 'A', type: 'push' as const, presetIds: [], x: 20, y: 20 }, { id: 'b', name: 'B', type: 'push' as const, presetIds: [], x: 200, y: 20 }], annotations: [{ id: 'f', type: 'frame' as const, text: 'F', x: 0, y: 0, width: 400, height: 200 }] }] }
    useShowStore.getState().setShow(show)
    useShowStore.getState().setLiveValue('a', 255)
    useShowStore.getState().stepLiveFrame('f', 1)
    expect(useShowStore.getState().activeLiveValues).toEqual({ b: 255 })
    const effects = useShowStore.getState().effects
    const list = useShowStore.getState().cueLists[0]
    if (list?.steps.length > 1) { useShowStore.getState().goToCue(list.id, 0); useShowStore.getState().cueNext() }
    expect(useShowStore.getState().effects).toEqual(effects)
  })
})
