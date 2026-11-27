// Stale references (Jake, 26 Nov 2026): he deleted a "Full On" preset and
// re-captured it, and the Live button that had pointed at the old preset
// kept its name, lit up when pressed, and drove nothing — deletePreset
// removed the preset but left the id behind in the button (and in cues
// and sequence steps). Deleting a preset, sequence or cue must strip its
// id everywhere it is referenced. A button that was already broken before
// this landed keeps its stale id (migration preserves references by
// design) — it is repaired by re-assigning the current preset in the
// button's properties, or by deleting the button and dragging the preset
// onto the Live page again.
import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { ShowDef } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

function testShow(): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures: [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 20, channels: 1 }],
    presets: [
      { id: 'p1', name: 'Full On', category: 'intensity', fixtureValues: { d1: { intensity: 255 } } },
      { id: 'p2', name: '75%', category: 'intensity', fixtureValues: { d1: { intensity: 191 } } }
    ],
    cues: [
      { id: 'c1', name: 'Cue 1', presetIds: ['p1'], sequenceIds: ['s1'], fixtureValues: {}, fadeMs: 0 },
      { id: 'c2', name: 'Cue 2', presetIds: ['p2'], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }
    ],
    sequences: [
      { id: 's1', name: 'Chase', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1, steps: [{ id: 'step1', name: 'Step 1', fixtureValues: {}, presetIds: ['p1'], fadeMs: 1000, holdMs: 0 }] },
      { id: 's2', name: 'Other', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1, steps: [] }
    ],
    livePages: [{
      id: 'page', name: 'Page', controls: [
        { id: 'b1', name: 'Full On', type: 'push', presetIds: ['p1', 'p2'], sequenceIds: ['s1'], effectIds: ['e1'], x: 0, y: 0 },
        { id: 'b2', name: 'Cue 1', type: 'push', cueId: 'c1', presetIds: [], x: 0, y: 100 },
        { id: 'b3', name: 'Cue 2', type: 'push', cueId: 'c2', presetIds: [], x: 0, y: 200 }
      ]
    }],
    effects: [{ id: 'e1', name: 'K.I.T.T.', fixtureIds: ['d1'], attribute: 'intensity', waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 0, enabled: true, phaseSpread: 0 }],
    cueLists: [{ id: 'list1', name: 'List', steps: [{ id: 'ls1', cueId: 'c1', fadeMs: 0, holdMs: 0 }, { id: 'ls2', cueId: 'c2', fadeMs: 0, holdMs: 0 }] }],
    automations: []
  }
}

const s = () => useShowStore.getState()
const control = (id: string) => s().show!.livePages![0].controls.find((c) => c.id === id)!

describe('deleting a referenced preset, sequence or cue', () => {
  it('deletePreset strips the id from Live buttons, cues and sequence steps', () => {
    s().setShow(testShow())
    s().togglePreset('p1')
    expect(s().activePresetIds).toContain('p1')
    s().deletePreset('p1')
    expect(s().presets.map((p) => p.id)).toEqual(['p2'])
    expect(s().activePresetIds).not.toContain('p1')
    // The Live button keeps its other preset and its name; it just no
    // longer points at the deleted preset.
    expect(control('b1').presetIds).toEqual(['p2'])
    expect(control('b1').name).toBe('Full On')
    expect(s().cues.find((c) => c.id === 'c1')!.presetIds).toEqual([])
    expect(s().cues.find((c) => c.id === 'c2')!.presetIds).toEqual(['p2'])
    expect(s().show!.sequences!.find((q) => q.id === 's1')!.steps[0].presetIds).toEqual([])
  })

  it('deleteSequence strips the id from Live buttons and cues', () => {
    s().setShow(testShow())
    s().deleteSequence('s1')
    expect(s().show!.sequences!.map((q) => q.id)).toEqual(['s2'])
    expect(control('b1').sequenceIds).toEqual([])
    expect(s().cues.find((c) => c.id === 'c1')!.sequenceIds).toEqual([])
  })

  it('deleteCue unbinds Live buttons and drops cue-list steps', () => {
    s().setShow(testShow())
    s().deleteCue('c1')
    expect(s().cues.map((c) => c.id)).toEqual(['c2'])
    expect(control('b2').cueId).toBeUndefined()
    expect(control('b3').cueId).toBe('c2')
    expect(s().cueLists[0].steps.map((step) => step.cueId)).toEqual(['c2'])
  })

  it('removeEffect strips the id from Live buttons', () => {
    s().setShow(testShow())
    s().removeEffect('e1')
    expect(s().effects.map((e) => e.id)).toEqual([])
    // The button keeps its name and its other contents; it just no
    // longer points at the deleted effect.
    expect(control('b1').effectIds).toEqual([])
    expect(control('b1').presetIds).toEqual(['p1', 'p2'])
    expect(control('b1').name).toBe('Full On')
  })
})
