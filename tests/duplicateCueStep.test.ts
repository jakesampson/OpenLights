// Duplicate a cue step (Jake, 27 Nov 2026 — screenshot 7.10.50: the
// cuelist widget with 001 / 002 / 003 New Cue). Guide ch.11, p.189:
// "When you add a new cue or duplicate a cue, Lightkey automatically
// increments the new cue's number." The guide's one-cuelist-per-page
// rule (p.190) forbids duplicating the LIST; the menu's Duplicate acts
// on the selected cue step(s) inside the list.
import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { ShowDef } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

function testShow(): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures: [{ id: 'w1', name: 'W1', type: 'rgba-4ch', channelStart: 1, channels: 4, group: 'Wash' }],
    presets: [{ id: 'preset-violet', name: 'Violet', category: 'color', fixtureValues: { w1: { red: 128, green: 0, blue: 255, intensity: 255 } } }],
    sequences: [{ id: 'seq1', name: 'Rainbow', steps: [] }],
    cues: [
      { id: 'c1', name: '001 New Cue', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 500 },
      {
        id: 'c2', name: '002 New Cue', presetIds: ['preset-violet'], sequenceIds: ['seq1'],
        fixtureValues: { w1: { blue: 255, intensity: 200 } },
        fans: [{ id: 'fan1', attribute: 'pan', fixtureIds: ['w1'], mode: 'linear', order: 'selection', start: 0, end: 100 }],
        fadeMs: 500, blackout: false
      }
    ],
    livePages: [{
      id: 'page', name: 'Page', controls: [
        { id: 'b2', name: '002 button', type: 'push', cueId: 'c2', presetIds: [], x: 0, y: 100 }
      ]
    }],
    cueLists: [
      { id: 'list1', name: 'List', steps: [
        { id: 's1', cueId: 'c1', fadeMs: 500, holdMs: 0 },
        { id: 's2', cueId: 'c2', fadeMs: 500, holdMs: 2000, selectedModifiers: ['dimmer'], speedModifierOptions: ['intensity'] }
      ] }
    ],
    automations: []
  } as unknown as ShowDef
}

const s = () => useShowStore.getState()
const stepNames = () => s().cueLists[0].steps.map((step) => s().cues.find((c) => c.id === step.cueId)?.name)
const stepCue = (index: number) => s().cues.find((c) => c.id === s().cueLists[0].steps[index].cueId)!

describe('duplicateCueSteps', () => {
  it('copies the step in place with the next number and all of the cue contents', () => {
    s().setShow(testShow())
    s().duplicateCueSteps('list1', ['s2'])
    expect(stepNames()).toEqual(['001 New Cue', '002 New Cue', '003 New Cue'])
    const original = s().cues.find((c) => c.id === 'c2')!
    const copy = stepCue(2)
    expect(copy.id).not.toBe('c2')
    expect(copy.name).toBe('003 New Cue')
    expect(copy.presetIds).toEqual(['preset-violet'])
    expect(copy.sequenceIds).toEqual(['seq1'])
    expect(copy.fixtureValues).toEqual({ w1: { blue: 255, intensity: 200 } })
    expect(copy.fans).toEqual([{ id: 'fan1', attribute: 'pan', fixtureIds: ['w1'], mode: 'linear', order: 'selection', start: 0, end: 100 }])
    expect(copy.fadeMs).toBe(500)
    expect(copy.blackout).toBe(false)
    // The copy is a deep copy: editing it must not touch the original.
    copy.fixtureValues.w1.blue = 0
    expect(original.fixtureValues).toEqual({ w1: { blue: 255, intensity: 200 } })
    // The copy keeps the step's own settings.
    const copyStep = s().cueLists[0].steps[2]
    expect(copyStep.holdMs).toBe(2000)
    expect(copyStep.fadeMs).toBe(500)
    expect(copyStep.selectedModifiers).toEqual(['dimmer'])
    expect(copyStep.speedModifierOptions).toEqual(['intensity'])
    // The original step and cue are untouched.
    expect(s().cueLists[0].steps[1]).toMatchObject({ id: 's2', cueId: 'c2', holdMs: 2000 })
    expect(original.name).toBe('002 New Cue')
  })

  it('increments again on the next duplicate', () => {
    s().setShow(testShow())
    s().duplicateCueSteps('list1', ['s2'])
    const copyStepId = s().cueLists[0].steps[2].id
    s().duplicateCueSteps('list1', [copyStepId])
    expect(stepNames()).toEqual(['001 New Cue', '002 New Cue', '003 New Cue', '004 New Cue'])
  })

  it('duplicates several selected steps each in place, in list order', () => {
    s().setShow(testShow())
    s().duplicateCueSteps('list1', ['s2', 's1'])
    expect(stepNames()).toEqual(['001 New Cue', '003 New Cue', '002 New Cue', '004 New Cue'])
  })

  it('undo removes the duplicate in one step', () => {
    s().setShow(testShow())
    s().duplicateCueSteps('list1', ['s2'])
    expect(s().cueLists[0].steps).toHaveLength(3)
    expect(s().cues).toHaveLength(3)
    s().undo()
    expect(stepNames()).toEqual(['001 New Cue', '002 New Cue'])
    expect(s().cues).toHaveLength(2)
  })

  it('a cue shared with a Live button keeps the button on the original', () => {
    s().setShow(testShow())
    s().duplicateCueSteps('list1', ['s2'])
    expect(s().show!.livePages![0].controls[0].cueId).toBe('c2')
  })

  it('the playing step keeps its index when an earlier step is duplicated', () => {
    s().setShow(testShow())
    useShowStore.setState({ activeCueListId: 'list1', activeCueIndex: 1, cuePlaying: true, activeCueId: 'c2' })
    s().duplicateCueSteps('list1', ['s1'])
    expect(s().activeCueIndex).toBe(2)
    expect(s().cueLists[0].steps[s().activeCueIndex].id).toBe('s2')
  })

  it('a disabled step stays disabled in its copy', () => {
    s().setShow(testShow())
    s().updateCueStep('list1', 's2', { disabled: true })
    s().duplicateCueSteps('list1', ['s2'])
    expect(s().cueLists[0].steps[2].disabled).toBe(true)
    expect(s().cueLists[0].steps[1].disabled).toBe(true)
  })

  it('does nothing for an unknown list or no steps', () => {
    s().setShow(testShow())
    s().duplicateCueSteps('nope', ['s2'])
    s().duplicateCueSteps('list1', [])
    s().duplicateCueSteps('list1', ['nope'])
    expect(stepNames()).toEqual(['001 New Cue', '002 New Cue'])
    expect(s().cues).toHaveLength(2)
  })
})
