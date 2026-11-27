// Inline cue lifecycle (Jake, 27 Nov 2026 — the project-wide cue store
// is gone): a cue lives only inside the button or cuelist step that
// holds it. Deleting the holder deletes its cue with it; a cue copied
// into another holder is a SEPARATE copy and survives. There is no
// garbage collection any more — the lifecycle is the holder's
// lifecycle — so this file pins that instead: delete button → cue gone
// from the file; remove step → cue gone; delete widget → list + cues
// gone; cut + paste-back keeps the cue; undo restores button + cue.
import { describe, expect, it, vi } from 'vitest'
import { collectInlineCues, activeCueId, useShowStore } from '../src/renderer/src/stores/showStore'
import type { CueDef, ShowDef } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

function cue(id: string, name: string): CueDef {
  return { id, name, presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }
}

function testShow(): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures: [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }],
    presets: [],
    livePages: [{
      id: 'page', name: 'Page',
      controls: [
        { id: 'b2', name: 'Cue 1', type: 'push', cue: cue('c1-btn', 'Cue 1'), presetIds: [], x: 0, y: 100 },
        { id: 'b3', name: 'Cue 2', type: 'push', cue: cue('c2-btn', 'Cue 2'), presetIds: [], x: 0, y: 200 },
        { id: 'b4', name: 'Cue 3', type: 'push', cue: cue('c3-btn', 'Cue 3'), presetIds: [], x: 0, y: 300 },
        { id: 'b5', name: 'Cue 1 again', type: 'push', cue: cue('c1-btn2', 'Cue 1'), presetIds: [], x: 0, y: 400 }
      ],
      cueListWidgets: [{ id: 'w1', cueListId: 'list1', x: 0, y: 500 }]
    }],
    cueLists: [
      { id: 'list1', name: 'List', steps: [
        { id: 'ls1', cue: cue('c1-step', 'Cue 1'), fadeMs: 0, holdMs: 0 },
        { id: 'ls2', cue: cue('c2-step', 'Cue 2'), fadeMs: 0, holdMs: 0 },
        { id: 'ls5', cue: cue('c5-step', 'List Only'), fadeMs: 0, holdMs: 0 }
      ] },
      { id: 'list2', name: 'Solo', steps: [{ id: 'ls6', cue: cue('c6-step', 'Playing'), fadeMs: 0, holdMs: 0 }] }
    ],
    automations: []
  }
}

const s = () => useShowStore.getState()
const cueIds = () => collectInlineCues(s().show, s().cueLists).map((c) => c.id)
const cueNames = () => collectInlineCues(s().show, s().cueLists).map((c) => c.name)
const deleteButton = (id: string) => {
  useShowStore.setState({ selectedPageObjects: [{ type: 'cue', id }] })
  s().deleteSelectedPageObjects()
}

describe('inline cue lifecycle', () => {
  it('deleting a button deletes its cue with it', () => {
    s().setShow(testShow())
    deleteButton('b4')
    expect(cueIds()).not.toContain('c3-btn')
    expect(cueNames()).not.toContain('Cue 3')
    expect(s().show!.livePages![0].controls.map((c) => c.id)).not.toContain('b4')
    // The saved file carries no trace of the cue either.
    expect(JSON.stringify(s().showForSave())).not.toContain('c3-btn')
  })

  it('deleting a button leaves the same-named cue in another holder untouched', () => {
    s().setShow(testShow())
    deleteButton('b2')
    expect(cueIds()).not.toContain('c1-btn')
    // b5's copy and the list step's copy are separate cues with the
    // same name — both survive, with their own ids.
    expect(cueIds()).toContain('c1-btn2')
    expect(cueIds()).toContain('c1-step')
    expect(cueNames().filter((n) => n === 'Cue 1')).toHaveLength(2)
  })

  it('deleting a button leaves the list step copy of its cue untouched', () => {
    s().setShow(testShow())
    deleteButton('b3')
    expect(cueIds()).not.toContain('c2-btn')
    expect(cueIds()).toContain('c2-step')
    // And once the step goes too, that copy is gone as well.
    s().removeCueStep('list1', 'ls2')
    expect(cueIds()).not.toContain('c2-step')
  })

  it('removing a step deletes its cue with it', () => {
    s().setShow(testShow())
    s().removeCueStep('list1', 'ls5')
    expect(cueIds()).not.toContain('c5-step')
    expect(cueNames()).not.toContain('List Only')
  })

  it('removing a step via editCueListCommand deletes its cue with it', () => {
    s().setShow(testShow())
    s().editCueListCommand('list1', { type: 'remove', id: 'ls5' })
    expect(cueIds()).not.toContain('c5-step')
  })

  it('renaming a step renames only that step’s own cue', () => {
    s().setShow(testShow())
    s().editCueListCommand('list1', { type: 'rename-step', id: 'ls5', name: 'Renamed' })
    expect(s().cueLists[0].steps.find((step) => step.id === 'ls5')!.cue.name).toBe('Renamed')
    // The button copies keep their names — they are separate cues.
    expect(s().show!.livePages![0].controls.map((c) => c.cue?.name)).toEqual(['Cue 1', 'Cue 2', 'Cue 3', 'Cue 1'])
  })

  it('unlinking a button cue drops the cue outright', () => {
    s().setShow(testShow())
    s().setControlCue('b4', undefined)
    expect(cueIds()).not.toContain('c3-btn')
    expect(s().show!.livePages![0].controls.find((c) => c.id === 'b4')!.cue).toBeUndefined()
    s().setControlCue('b2', undefined)
    expect(cueIds()).not.toContain('c1-btn')
    expect(cueIds()).toContain('c1-btn2')
  })

  it('deleting a cuelist deletes its step cues with it', () => {
    s().setShow(testShow())
    s().removeCueList('list1')
    expect(cueIds()).not.toContain('c5-step')
    expect(cueIds()).not.toContain('c1-step')
    expect(cueIds()).not.toContain('c2-step')
    expect(cueIds()).toContain('c1-btn')
    expect(cueIds()).toContain('c2-btn')
  })

  it('deleting a cuelist widget deletes the list and its step cues with it', () => {
    s().setShow(testShow())
    useShowStore.setState({ selectedPageObjects: [{ type: 'list', id: 'w1' }] })
    s().deleteSelectedPageObjects()
    expect(s().cueLists.map((l) => l.id)).not.toContain('list1')
    expect(cueIds()).not.toContain('c5-step')
    // The button copies are untouched.
    expect(cueIds()).toContain('c1-btn')
    expect(cueIds()).toContain('c2-btn')
  })

  it('deleting the active cue clears it, and undo restores both step and cue', () => {
    s().setShow(testShow())
    s().goToCue('list2', 0)
    expect(activeCueId(s())).toBe('c6-step')
    s().removeCueStep('list2', 'ls6')
    expect(cueIds()).not.toContain('c6-step')
    expect(activeCueId(s())).toBeNull()
    s().undo()
    expect(cueIds()).toContain('c6-step')
    expect(s().cueLists.find((l) => l.id === 'list2')!.steps.map((step) => step.cue.id)).toEqual(['c6-step'])
  })

  it('cut + paste-back keeps the cue (fresh id, same contents)', () => {
    s().setShow(testShow())
    useShowStore.setState({ selectedPageObjects: [{ type: 'cue', id: 'b4' }] })
    s().copySelectedPageObjects()
    s().deleteSelectedPageObjects()
    // Cut, not delete: the button is gone from the page…
    expect(s().show!.livePages![0].controls.map((c) => c.id)).not.toContain('b4')
    expect(cueIds()).not.toContain('c3-btn')
    s().pastePageObjects()
    const restored = s().show!.livePages![0].controls.find((c) => c.name === 'Cue 3')
    expect(restored).toBeTruthy()
    // …and pasting brings the cue back inside it — a fresh id (a
    // pasted copy is a separate cue), same name and values.
    expect(restored!.cue).toBeTruthy()
    expect(restored!.cue!.name).toBe('Cue 3')
    expect(restored!.cue!.id).not.toBe('c3-btn')
    expect(cueIds()).toContain(restored!.cue!.id)
  })

  it('undo restores a deleted button together with its cue', () => {
    s().setShow(testShow())
    deleteButton('b4')
    expect(cueIds()).not.toContain('c3-btn')
    s().undo()
    expect(s().show!.livePages![0].controls.map((c) => c.id)).toContain('b4')
    expect(cueIds()).toContain('c3-btn')
  })
})

describe('old-format shows migrate to inline cues on load', () => {
  // One cue shared by a button and a list step, plus an orphan no
  // holder references — the old project-wide shape.
  const oldShow = (): ShowDef => ({
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures: [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }],
    presets: [],
    cues: [
      { id: 'c1', name: 'Cue 1', presetIds: [], sequenceIds: [], fixtureValues: { d1: { intensity: 200 } }, fadeMs: 0 },
      { id: 'c4', name: 'Orphan', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }
    ],
    livePages: [{
      id: 'page', name: 'Page', controls: [
        { id: 'b2', name: 'Cue 1', type: 'push', cueId: 'c1', presetIds: [], x: 0, y: 100 }
      ]
    }],
    cueLists: [{ id: 'list1', name: 'List', steps: [{ id: 'ls1', cueId: 'c1', fadeMs: 0, holdMs: 0 }] }],
    automations: []
  } as unknown as ShowDef)

  it('a cue shared by a button and a list becomes two separate copies', () => {
    s().setShow(oldShow())
    const buttonCue = s().show!.livePages![0].controls[0].cue!
    const stepCue = s().cueLists[0].steps[0].cue
    // The first holder keeps the original id; the copy gets a fresh one.
    expect(buttonCue.id).toBe('c1')
    expect(stepCue.id).not.toBe('c1')
    // Same contents, separate objects: editing one must not touch the other.
    expect(stepCue.name).toBe('Cue 1')
    expect(stepCue.fixtureValues).toEqual({ d1: { intensity: 200 } })
    s().updateCue(stepCue.id, { name: 'Renamed in list' })
    expect(s().show!.livePages![0].controls[0].cue!.name).toBe('Cue 1')
    expect(s().cueLists[0].steps[0].cue.name).toBe('Renamed in list')
  })

  it('an unreferenced cue is dropped on load', () => {
    s().setShow(oldShow())
    expect(cueNames()).not.toContain('Orphan')
    expect(cueIds()).not.toContain('c4')
  })

  it('no cues key survives after save', () => {
    s().setShow(oldShow())
    const saved = s().showForSave() as unknown as Record<string, unknown>
    expect(saved).toBeTruthy()
    expect('cues' in saved!).toBe(false)
    expect(JSON.stringify(saved)).not.toContain('Orphan')
  })
})
