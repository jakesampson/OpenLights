import { describe, expect, it } from 'vitest'
import type { LiveControl } from '../src/shared/types'
import { applyCueContents } from '../src/renderer/src/lib/cueContents'

const cue = (): LiveControl => ({ id: 'cue', name: 'Cue', type: 'push', presetIds: ['p1'], sequenceIds: ['s1'], adHocValues: { f1: { intensity: 100, red: 20 } } })

describe('cue contents', () => {
  it('adds and removes preset and sequence references', () => {
    expect(applyCueContents(cue(), { type: 'add-preset', id: 'p2' }).presetIds).toEqual(['p1', 'p2'])
    expect(applyCueContents(cue(), { type: 'remove-preset', id: 'p1' }).presetIds).toEqual([])
    expect(applyCueContents(cue(), { type: 'add-sequence', id: 's2' }).sequenceIds).toEqual(['s1', 's2'])
    expect(applyCueContents(cue(), { type: 'remove-sequence', id: 's1' }).sequenceIds).toEqual([])
  })

  it('edits and removes ad-hoc properties without disturbing siblings', () => {
    const updated = applyCueContents(cue(), { type: 'set-ad-hoc', fixtureId: 'f1', property: 'intensity', value: 999 })
    expect(updated.adHocValues?.f1).toEqual({ intensity: 255, red: 20 })
    expect(applyCueContents(updated, { type: 'remove-ad-hoc', fixtureId: 'f1', property: 'red' }).adHocValues?.f1).toEqual({ intensity: 255 })
    expect(applyCueContents(updated, { type: 'remove-ad-hoc', fixtureId: 'f1' }).adHocValues).toEqual({})
  })
})
