import { describe, expect, it } from 'vitest'
import type { CueListDef } from '../src/shared/types'
import { cueListStatus, editCueList, filterCueSteps } from '../src/renderer/src/lib/cueListEditing'

const list = (): CueListDef => ({ id: 'l', name: 'List', loop: true, steps: [{ id: 'a', sceneId: 's1', fadeMs: 100, holdMs: 900 }, { id: 'b', sceneId: 's2', fadeMs: 200, holdMs: 300 }] })
describe('cuelist editing and status', () => {
  it('adds, removes, reorders, renames and pastes independent cues', () => {
    const added = editCueList(list(), { type: 'add', step: { id: 'c', sceneId: 's3', fadeMs: 0, holdMs: 0 }, index: 1 })
    expect(added.steps.map((step) => step.id)).toEqual(['a', 'c', 'b'])
    expect(editCueList(added, { type: 'move', id: 'c', direction: 1 }).steps.map((step) => step.id)).toEqual(['a', 'b', 'c'])
    expect(editCueList(added, { type: 'rename-step', id: 'c', sceneId: 'renamed' }).steps[1].sceneId).toBe('renamed')
    expect(editCueList(added, { type: 'remove', id: 'c' }).steps).toHaveLength(2)
    expect(editCueList(list(), { type: 'paste', steps: [list().steps[0]], makeId: () => 'copy' }).steps[2].id).toBe('copy')
  })
  it('filters by scene name and reports current, next and remaining time', () => {
    const scenes = [{ id: 's1', name: 'Welcome' }, { id: 's2', name: 'Sermon' }]
    expect(filterCueSteps(list(), scenes, 'ser')).toEqual([list().steps[1]])
    expect(cueListStatus(list(), 0, 250)).toMatchObject({ current: list().steps[0], next: list().steps[1], remainingMs: 750 })
    expect(cueListStatus(list(), 1, 999).next).toEqual(list().steps[0])
  })
})
