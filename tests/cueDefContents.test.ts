// Cue-definition contents (Jake, 27 Nov 2026 — LightKey cue editing,
// Video 2): a button's Get Info list edits the CUE's ingredients — its
// preset / sequence references and its own ad-hoc fixtureValues — so the
// same commands that edit a button's own lists need a CueDef parallel.
import { describe, it, expect } from 'vitest'
import { applyCueDefContents } from '../src/renderer/src/lib/cueContents'
import type { CueDef } from '../src/shared/types'

const CUE: CueDef = {
  id: 'cue1', name: 'Song 1', presetIds: ['p1'], sequenceIds: ['s1'],
  fixtureValues: { d1: { intensity: 200, red: 255 } }, fadeMs: 500
}

describe('applyCueDefContents', () => {
  it('adds and removes preset references without touching the others', () => {
    const added = applyCueDefContents(CUE, { type: 'add-preset', id: 'p2' })
    expect(added.presetIds).toEqual(['p1', 'p2'])
    expect(added.sequenceIds).toEqual(['s1'])
    const addedAgain = applyCueDefContents(added, { type: 'add-preset', id: 'p2' })
    expect(addedAgain.presetIds).toEqual(['p1', 'p2'])
    const removed = applyCueDefContents(added, { type: 'remove-preset', id: 'p1' })
    expect(removed.presetIds).toEqual(['p2'])
    expect(removed.fixtureValues).toEqual(CUE.fixtureValues)
  })

  it('adds and removes sequence references', () => {
    const added = applyCueDefContents(CUE, { type: 'add-sequence', id: 's2' })
    expect(added.sequenceIds).toEqual(['s1', 's2'])
    expect(applyCueDefContents(added, { type: 'remove-sequence', id: 's1' }).sequenceIds).toEqual(['s2'])
  })

  it('edits and clears the cue ad-hoc values', () => {
    const set = applyCueDefContents(CUE, { type: 'set-ad-hoc', fixtureId: 'd1', property: 'green', value: 128 })
    expect(set.fixtureValues.d1).toEqual({ intensity: 200, red: 255, green: 128 })
    const clamped = applyCueDefContents(CUE, { type: 'set-ad-hoc', fixtureId: 'd2', property: 'intensity', value: 300 })
    expect(clamped.fixtureValues.d2).toEqual({ intensity: 255 })
    const removed = applyCueDefContents(set, { type: 'remove-ad-hoc', fixtureId: 'd1', property: 'green' })
    expect(removed.fixtureValues.d1).toEqual({ intensity: 200, red: 255 })
    const cleared = applyCueDefContents(set, { type: 'remove-ad-hoc', fixtureId: 'd1' })
    expect(cleared.fixtureValues).toEqual({})
    expect(applyCueDefContents(set, { type: 'clear-ad-hoc' }).fixtureValues).toEqual({})
  })
})
