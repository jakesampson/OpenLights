// Cue creation, LightKey's way (Guide ch.11, pp.191–192 — Jake, 26 Nov
// 2026): there was no way to make a cue on purpose — addCue existed in
// the store with zero UI callers, and the cuelist "+ Cue" was a no-op
// with zero cues. New Cue captures the current look (active presets +
// sequences + overrides as ad hoc); a palette drag onto a cuelist
// mints a cue holding the dragged objects.
import { describe, expect, it, vi } from 'vitest'
import { resolveCueValues } from '../src/shared/cueResolution'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'

vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

const s = () => useShowStore.getState()

function makeShow() {
  return migrateShow({
    fixtures: [
      { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 1, channels: 4 },
      { id: 'w1', name: 'W1', type: 'led-wash', channelStart: 5, channels: 7 },
    ],
    presets: [
      { id: 'p-red', name: 'Red', category: 'color', fixtureValues: { q1: { red: 255, green: 0, blue: 0, intensity: 255 } } },
      { id: 'p-dim', name: 'Dimmer 100', category: 'intensity', fixtureValues: { q1: { intensity: 255 }, w1: { intensity: 255 } } },
    ],
    sequences: [{ id: 's1', name: 'Chase', steps: [], order: 'forward', loop: false, timing: 'manual', stepsPerBeat: 1 }],
    cueLists: [{ id: 'c1', name: 'Set', steps: [], loop: false }],
    cues: [],
  })
}

/** The active look: a preset + a sequence switched on, and a manual
 * dimmer override on Q1. */
function setActiveLook() {
  useShowStore.setState({
    activePresetIds: ['p-red'],
    activeSequenceIds: ['s1'],
    manualOverrides: { q1: { intensity: 128 } },
    selectedFixtureIds: ['q1'],
  })
}

describe('cue creation', () => {
  it('New Cue captures the active look and names it Cue N', () => {
    s().setShow(makeShow())
    setActiveLook()
    const cue = s().addCue()
    expect(cue.name).toBe('Cue 1')
    expect(cue.presetIds).toEqual(['p-red'])
    expect(cue.sequenceIds).toEqual(['s1'])
    // The override rides on the cue as an ad hoc value.
    expect(cue.fixtureValues.q1.intensity).toBe(128)
    expect(s().cues).toHaveLength(1)
  })

  it('addCue with explicit ids uses the dragged objects, not the active look', () => {
    s().setShow(makeShow())
    setActiveLook()
    const cue = s().addCue({ presetIds: ['p-dim'] })
    expect(cue.name).toBe('Cue 1')
    expect(cue.presetIds).toEqual(['p-dim'])
    expect(cue.sequenceIds).toEqual([])
    // The ad hoc layer is still the current overrides (Guide p.191).
    expect(cue.fixtureValues.q1.intensity).toBe(128)
  })

  it('addCueToList works from zero cues: cue plus step in one update', () => {
    s().setShow(makeShow())
    setActiveLook()
    const cueId = s().addCueToList('c1')
    expect(cueId).not.toBe('')
    expect(s().cues).toHaveLength(1)
    expect(s().cues[0].id).toBe(cueId)
    const list = s().cueLists.find((item) => item.id === 'c1')!
    expect(list.steps).toHaveLength(1)
    expect(list.steps[0].cueId).toBe(cueId)
    expect(list.steps[0].fadeMs).toBe(s().cues[0].fadeMs)
  })

  it('addCueToList with dragged presets mints a cue holding them', () => {
    s().setShow(makeShow())
    const cueId = s().addCueToList('c1', { presetIds: ['p-red', 'p-dim'] }, 'Red + Dimmer')
    const cue = s().cues.find((item) => item.id === cueId)!
    expect(cue.name).toBe('Red + Dimmer')
    expect(cue.presetIds).toEqual(['p-red', 'p-dim'])
    expect(s().cueLists.find((item) => item.id === 'c1')!.steps).toHaveLength(1)
    // The cue resolves to the dragged preset's values.
    const values = resolveCueValues(cue, s().presets, s().show!.fixtures)
    expect(values.q1.red).toBe(255)
    expect(values.q1.intensity).toBe(255)
  })

  it('addCueToList to a missing list creates nothing', () => {
    s().setShow(makeShow())
    expect(s().addCueToList('nope')).toBe('')
    expect(s().cues).toHaveLength(0)
  })

  it('a Design fan still mints no cue', () => {
    s().setShow(makeShow())
    const fan = { id: 'f', attribute: 'intensity', fixtureIds: ['q1', 'w1'], mode: 'linear' as const, order: 'selection' as const, start: 0, end: 200 }
    s().saveFan(fan)
    expect(s().cues).toHaveLength(0)
    expect(s().manualOverrides.q1.intensity).toBe(0)
    expect(s().manualOverrides.w1.intensity).toBe(200)
  })
})
