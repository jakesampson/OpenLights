// Reference-counted cue deletion (Jake, 27 Nov 2026 — "if a cue is
// deleted off the canvas... kaboooom its deleted from memory"): cues
// exist only on the canvas — a Live button or a cuelist step. Deleting a
// button, removing a step, or unlinking a button's cue deletes the cue
// from memory when nothing else references it, and never when something
// does. Existing orphans are NOT garbage-collected on load: PRBC
// Default's ~200 orphan cues stay untouched until Jake decides.
import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { ShowDef } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

function testShow(): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures: [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }],
    presets: [],
    cues: [
      { id: 'c1', name: 'Cue 1', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 },
      { id: 'c2', name: 'Cue 2', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 },
      { id: 'c3', name: 'Cue 3', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 },
      { id: 'c4', name: 'Orphan', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 },
      { id: 'c5', name: 'List Only', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 },
      { id: 'c6', name: 'Playing', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }
    ],
    livePages: [{
      id: 'page', name: 'Page', controls: [
        { id: 'b2', name: 'Cue 1', type: 'push', cueId: 'c1', presetIds: [], x: 0, y: 100 },
        { id: 'b3', name: 'Cue 2', type: 'push', cueId: 'c2', presetIds: [], x: 0, y: 200 },
        { id: 'b4', name: 'Cue 3', type: 'push', cueId: 'c3', presetIds: [], x: 0, y: 300 },
        { id: 'b5', name: 'Cue 1 again', type: 'push', cueId: 'c1', presetIds: [], x: 0, y: 400 }
      ]
    }],
    cueLists: [
      { id: 'list1', name: 'List', steps: [
        { id: 'ls1', cueId: 'c1', fadeMs: 0, holdMs: 0 },
        { id: 'ls2', cueId: 'c2', fadeMs: 0, holdMs: 0 },
        { id: 'ls5', cueId: 'c5', fadeMs: 0, holdMs: 0 }
      ] },
      { id: 'list2', name: 'Solo', steps: [{ id: 'ls6', cueId: 'c6', fadeMs: 0, holdMs: 0 }] }
    ],
    automations: []
  }
}

const s = () => useShowStore.getState()
const cueIds = () => s().cues.map((c) => c.id)
const showCueIds = () => s().show!.cues.map((c) => c.id)
const deleteButton = (id: string) => {
  useShowStore.setState({ selectedPageObjects: [{ type: 'cue', id }] })
  s().deleteSelectedPageObjects()
}

describe('reference-counted cue deletion', () => {
  it('deleting a button deletes its cue when nothing else references it', () => {
    s().setShow(testShow())
    deleteButton('b4')
    expect(cueIds()).not.toContain('c3')
    expect(showCueIds()).not.toContain('c3')
    expect(s().show!.livePages![0].controls.map((c) => c.id)).not.toContain('b4')
  })

  it('deleting a button keeps its cue when another button references it', () => {
    s().setShow(testShow())
    deleteButton('b2')
    expect(cueIds()).toContain('c1')
    expect(showCueIds()).toContain('c1')
  })

  it('deleting a button keeps its cue when a cuelist step references it', () => {
    s().setShow(testShow())
    deleteButton('b3')
    expect(cueIds()).toContain('c2')
    // And once the step goes too, the cue is gone.
    s().removeCueStep('list1', 'ls2')
    expect(cueIds()).not.toContain('c2')
  })

  it('removing a step deletes its cue when nothing else references it', () => {
    s().setShow(testShow())
    s().removeCueStep('list1', 'ls5')
    expect(cueIds()).not.toContain('c5')
    expect(showCueIds()).not.toContain('c5')
  })

  it('removing a step via editCueListCommand deletes its cue when unreferenced', () => {
    s().setShow(testShow())
    s().editCueListCommand('list1', { type: 'remove', id: 'ls5' })
    expect(cueIds()).not.toContain('c5')
  })

  it('re-pointing a step via editCueListCommand deletes the old cue when unreferenced', () => {
    s().setShow(testShow())
    s().editCueListCommand('list1', { type: 'rename-step', id: 'ls5', cueId: 'c2' })
    expect(cueIds()).not.toContain('c5')
    expect(cueIds()).toContain('c2')
    expect(s().cueLists[0].steps.find((step) => step.id === 'ls5')!.cueId).toBe('c2')
  })

  it('re-pointing a step keeps the old cue when a button still references it', () => {
    s().setShow(testShow())
    s().editCueListCommand('list1', { type: 'rename-step', id: 'ls1', cueId: 'c2' })
    expect(cueIds()).toContain('c1')
  })

  it('unlinking a button cue deletes it when unreferenced, keeps it otherwise', () => {
    s().setShow(testShow())
    s().setControlCue('b4', undefined)
    expect(cueIds()).not.toContain('c3')
    expect(s().show!.livePages![0].controls.find((c) => c.id === 'b4')!.cueId).toBeUndefined()
    s().setControlCue('b2', undefined)
    expect(cueIds()).toContain('c1')
  })

  it('deleting a cuelist deletes its unreferenced step cues with it', () => {
    s().setShow(testShow())
    s().removeCueList('list1')
    expect(cueIds()).not.toContain('c5')
    expect(cueIds()).toContain('c1')
    expect(cueIds()).toContain('c2')
    expect(showCueIds()).not.toContain('c5')
  })

  it('deleting the active cue clears it, and undo restores both button and cue', () => {
    s().setShow(testShow())
    s().goToCue('list2', 0)
    expect(s().activeCueId).toBe('c6')
    s().removeCueStep('list2', 'ls6')
    expect(cueIds()).not.toContain('c6')
    expect(s().activeCueId).toBeNull()
    s().undo()
    expect(cueIds()).toContain('c6')
    expect(s().cueLists.find((l) => l.id === 'list2')!.steps.map((step) => step.cueId)).toEqual(['c6'])
  })

  it('cut keeps the cue alive for a paste-back, and pasting restores the button', () => {
    s().setShow(testShow())
    useShowStore.setState({ selectedPageObjects: [{ type: 'cue', id: 'b4' }] })
    s().copySelectedPageObjects()
    s().deleteSelectedPageObjects()
    // Cut, not delete: the clipboard still references the cue.
    expect(cueIds()).toContain('c3')
    expect(s().show!.livePages![0].controls.map((c) => c.id)).not.toContain('b4')
    s().pastePageObjects()
    const restored = s().show!.livePages![0].controls.find((c) => c.name === 'Cue 3')
    expect(restored).toBeTruthy()
    expect(restored!.cueId).toBe('c3')
    expect(cueIds()).toContain('c3')
  })

  it('existing orphans are NOT swept on load or by unrelated deletions', () => {
    s().setShow(testShow())
    expect(cueIds()).toContain('c4')
    deleteButton('b4')
    expect(cueIds()).toContain('c4')
    expect(showCueIds()).toContain('c4')
  })
})
