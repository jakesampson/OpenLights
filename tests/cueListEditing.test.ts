import { describe, expect, it } from 'vitest'
import type { CueListDef } from '../src/shared/types'
import { addCueListGroup, cueListStatus, editCueList, filterCueSteps, nextListCueName, orderedCuelistItems, renumberCueNames } from '../src/renderer/src/lib/cueListEditing'

const cue = (id: string, name: string) => ({ id, name, presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 })
const list = (): CueListDef => ({ id: 'l', name: 'List', loop: true, steps: [{ id: 'a', cue: cue('s1', 'Welcome'), fadeMs: 100, holdMs: 900 }, { id: 'b', cue: cue('s2', 'Sermon'), fadeMs: 200, holdMs: 300 }] })
describe('cuelist editing and status', () => {
  it('adds, removes, reorders, renames and pastes independent cues', () => {
    const added = editCueList(list(), { type: 'add', step: { id: 'c', cue: cue('s3', 'Third'), fadeMs: 0, holdMs: 0 }, index: 1 })
    expect(added.steps.map((step) => step.id)).toEqual(['a', 'c', 'b'])
    expect(editCueList(added, { type: 'move', id: 'c', direction: 1 }).steps.map((step) => step.id)).toEqual(['a', 'b', 'c'])
    // Renaming a step renames its OWN cue — there is no shared cue to
    // re-point at any more (Jake, 27 Nov 2026 — inline cues).
    expect(editCueList(added, { type: 'rename-step', id: 'c', name: 'Renamed' }).steps[1].cue.name).toBe('Renamed')
    expect(editCueList(added, { type: 'remove', id: 'c' }).steps).toHaveLength(2)
    // Pasting a step mints a fresh cue id for the copy (the copy is a
    // separate cue from the original).
    const pasted = editCueList(list(), { type: 'paste', steps: [list().steps[0]], makeId: () => 'copy' })
    expect(pasted.steps[2].id).toBe('copy')
    expect(pasted.steps[2].cue.id).toBe('copy')
    expect(pasted.steps[2].cue.name).toBe('Welcome')
    expect(pasted.steps[0].cue.id).toBe('s1')
  })
  it('filters by cue name and reports current, next and remaining time', () => {
    expect(filterCueSteps(list(), 'ser')).toEqual([list().steps[1]])
    expect(cueListStatus(list(), 0, 250)).toMatchObject({ current: list().steps[0], next: list().steps[1], remainingMs: 750 })
    expect(cueListStatus(list(), 1, 999).next).toEqual(list().steps[0])
  })
})

describe('cuelist auto-numbering (guide p.189)', () => {
  it('numbers new cues 001, 002, … from the highest leading number', () => {
    const empty: CueListDef = { id: 'l', name: 'List', steps: [] }
    expect(nextListCueName(empty)).toBe('001 New Cue')
    const numbered: CueListDef = { id: 'l', name: 'List', steps: [{ id: 'a', cue: cue('s1', '001 New Cue'), fadeMs: 0, holdMs: 0 }, { id: 'b', cue: cue('s2', '002 New Cue'), fadeMs: 0, holdMs: 0 }] }
    expect(nextListCueName(numbered)).toBe('003 New Cue')
    const tenth: CueListDef = { id: 'l', name: 'List', steps: [{ id: 'a', cue: cue('s1', '010 My cue'), fadeMs: 0, holdMs: 0 }] }
    expect(nextListCueName(tenth)).toBe('011 New Cue')
    // A name with no leading number does not move the counter.
    const plain: CueListDef = { id: 'l', name: 'List', steps: [{ id: 'a', cue: cue('s1', 'My cue'), fadeMs: 0, holdMs: 0 }] }
    expect(nextListCueName(plain)).toBe('001 New Cue')
  })
})

describe('cuelist renumber (guide p.195)', () => {
  it('re-numbers in list order from the first cue’s leading number', () => {
    const steps = [
      { id: 'a', cue: cue('s1', '010 My cue'), fadeMs: 0, holdMs: 0 },
      { id: 'b', cue: cue('s2', 'My other cue'), fadeMs: 0, holdMs: 0 },
      { id: 'c', cue: cue('s3', '003 Third'), fadeMs: 0, holdMs: 0 }
    ]
    expect(renumberCueNames(steps)).toEqual([
      { stepId: 'a', cueId: 's1', name: '010 My cue' },
      { stepId: 'b', cueId: 's2', name: '011 My other cue' },
      { stepId: 'c', cueId: 's3', name: '012 Third' },
    ])
    const plain = [
      { id: 'a', cue: cue('s1', 'Alpha'), fadeMs: 0, holdMs: 0 },
      { id: 'b', cue: cue('s2', 'Beta'), fadeMs: 0, holdMs: 0 },
      { id: 'c', cue: cue('s3', 'Gamma'), fadeMs: 0, holdMs: 0 }
    ]
    expect(renumberCueNames(plain)).toEqual([
      { stepId: 'a', cueId: 's1', name: '001 Alpha' },
      { stepId: 'b', cueId: 's2', name: '002 Beta' },
      { stepId: 'c', cueId: 's3', name: '003 Gamma' },
    ])
    expect(renumberCueNames([])).toEqual([])
  })
})

describe('cuelist groups (guide p.192)', () => {
  it('adds an empty group below a step and renders headers before their first member', () => {
    const list: CueListDef = {
      id: 'l', name: 'List',
      steps: [{ id: 'a', cue: cue('s1', 'A'), fadeMs: 0, holdMs: 0 }, { id: 'b', cue: cue('s2', 'B'), fadeMs: 0, holdMs: 0, groupId: 'g1' }, { id: 'c', cue: cue('s3', 'C'), fadeMs: 0, holdMs: 0 }],
      groups: [{ id: 'g1', name: 'Verse' }]
    }
    const { groups, group } = addCueListGroup(list, 'Chorus', () => 'g2', 'a')
    expect(group.name).toBe('Chorus')
    expect(groups).toHaveLength(2)
    const items = orderedCuelistItems({ ...list, groups })
    expect(items.map((item) => item.kind === 'group' ? `group:${item.group.name}` : `step:${item.step.id}`)).toEqual([
      'step:a', 'group:Chorus', 'group:Verse', 'step:b', 'step:c',
    ])
    // The empty group's header sits below step a (its afterStepId) and
    // before the Verse group that owns step b.
    expect(items[1]).toMatchObject({ kind: 'group', depth: 0 })
  })

  it('nests groups and indents their steps', () => {
    const list: CueListDef = {
      id: 'l', name: 'List',
      steps: [{ id: 'a', cue: cue('s1', 'A'), fadeMs: 0, holdMs: 0, groupId: 'g2' }],
      groups: [{ id: 'g1', name: 'Set' }, { id: 'g2', name: 'Verse', parentId: 'g1' }]
    }
    const items = orderedCuelistItems(list)
    expect(items.map((item) => item.kind === 'group' ? `group:${item.group.name}:${item.depth}` : `step:${item.step.id}:${item.depth}`)).toEqual([
      'group:Set:0', 'group:Verse:1', 'step:a:2',
    ])
  })
})
