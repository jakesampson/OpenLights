import { describe, expect, it } from 'vitest'
import type { CueListDef } from '../src/shared/types'
import { addCueListGroup, cueListStatus, editCueList, filterCueSteps, nextListCueName, orderedCuelistItems, renumberCueNames } from '../src/renderer/src/lib/cueListEditing'

const list = (): CueListDef => ({ id: 'l', name: 'List', loop: true, steps: [{ id: 'a', cueId: 's1', fadeMs: 100, holdMs: 900 }, { id: 'b', cueId: 's2', fadeMs: 200, holdMs: 300 }] })
describe('cuelist editing and status', () => {
  it('adds, removes, reorders, renames and pastes independent cues', () => {
    const added = editCueList(list(), { type: 'add', step: { id: 'c', cueId: 's3', fadeMs: 0, holdMs: 0 }, index: 1 })
    expect(added.steps.map((step) => step.id)).toEqual(['a', 'c', 'b'])
    expect(editCueList(added, { type: 'move', id: 'c', direction: 1 }).steps.map((step) => step.id)).toEqual(['a', 'b', 'c'])
    expect(editCueList(added, { type: 'rename-step', id: 'c', cueId: 'renamed' }).steps[1].cueId).toBe('renamed')
    expect(editCueList(added, { type: 'remove', id: 'c' }).steps).toHaveLength(2)
    expect(editCueList(list(), { type: 'paste', steps: [list().steps[0]], makeId: () => 'copy' }).steps[2].id).toBe('copy')
  })
  it('filters by cue name and reports current, next and remaining time', () => {
    const cues = [{ id: 's1', name: 'Welcome' }, { id: 's2', name: 'Sermon' }]
    expect(filterCueSteps(list(), cues, 'ser')).toEqual([list().steps[1]])
    expect(cueListStatus(list(), 0, 250)).toMatchObject({ current: list().steps[0], next: list().steps[1], remainingMs: 750 })
    expect(cueListStatus(list(), 1, 999).next).toEqual(list().steps[0])
  })
})

describe('cuelist auto-numbering (guide p.189)', () => {
  it('numbers new cues 001, 002, … from the highest leading number', () => {
    const cues = [{ id: 's1', name: '001 New Cue' }, { id: 's2', name: '002 New Cue' }, { id: 's3', name: 'My cue' }]
    const empty: CueListDef = { id: 'l', name: 'List', steps: [] }
    expect(nextListCueName(empty, cues)).toBe('001 New Cue')
    const list: CueListDef = { id: 'l', name: 'List', steps: [{ id: 'a', cueId: 's1', fadeMs: 0, holdMs: 0 }, { id: 'b', cueId: 's2', fadeMs: 0, holdMs: 0 }] }
    expect(nextListCueName(list, cues)).toBe('003 New Cue')
    const renumbered: CueListDef = { id: 'l', name: 'List', steps: [{ id: 'a', cueId: 's1', fadeMs: 0, holdMs: 0 }] }
    expect(nextListCueName({ ...renumbered, steps: [{ id: 'a', cueId: 's1', fadeMs: 0, holdMs: 0 }] }, [{ id: 's1', name: '010 My cue' }])).toBe('011 New Cue')
  })
})

describe('cuelist renumber (guide p.195)', () => {
  it('re-numbers in list order from the first cue’s leading number', () => {
    const cues = [{ id: 's1', name: '010 My cue' }, { id: 's2', name: 'My other cue' }, { id: 's3', name: '003 Third' }]
    const steps = [{ id: 'a', cueId: 's1', fadeMs: 0, holdMs: 0 }, { id: 'b', cueId: 's2', fadeMs: 0, holdMs: 0 }, { id: 'c', cueId: 's3', fadeMs: 0, holdMs: 0 }]
    expect(renumberCueNames(steps, cues)).toEqual([
      { cueId: 's1', name: '010 My cue' },
      { cueId: 's2', name: '011 My other cue' },
      { cueId: 's3', name: '012 Third' },
    ])
    expect(renumberCueNames(steps, [{ id: 's1', name: 'Alpha' }, { id: 's2', name: 'Beta' }, { id: 's3', name: 'Gamma' }])).toEqual([
      { cueId: 's1', name: '001 Alpha' },
      { cueId: 's2', name: '002 Beta' },
      { cueId: 's3', name: '003 Gamma' },
    ])
    expect(renumberCueNames([], cues)).toEqual([])
  })
})

describe('cuelist groups (guide p.192)', () => {
  it('adds an empty group below a step and renders headers before their first member', () => {
    const list: CueListDef = {
      id: 'l', name: 'List',
      steps: [{ id: 'a', cueId: 's1', fadeMs: 0, holdMs: 0 }, { id: 'b', cueId: 's2', fadeMs: 0, holdMs: 0, groupId: 'g1' }, { id: 'c', cueId: 's3', fadeMs: 0, holdMs: 0 }],
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
      steps: [{ id: 'a', cueId: 's1', fadeMs: 0, holdMs: 0, groupId: 'g2' }],
      groups: [{ id: 'g1', name: 'Set' }, { id: 'g2', name: 'Verse', parentId: 'g1' }]
    }
    const items = orderedCuelistItems(list)
    expect(items.map((item) => item.kind === 'group' ? `group:${item.group.name}:${item.depth}` : `step:${item.step.id}:${item.depth}`)).toEqual([
      'group:Set:0', 'group:Verse:1', 'step:a:2',
    ])
  })
})
