import { describe, expect, it } from 'vitest'
import type { PresetDef, SequenceDef, ShowDef } from '../src/shared/types'
import { filterPresets, filterSequences, findRelatedCues } from '../src/renderer/src/lib/presetPalette'

describe('preset palette filter and related cues (6.12)', () => {
  const presets: PresetDef[] = [
    { id: 'p1', name: 'Warm Wash', category: 'color', fixtureValues: { f1: { red: 255 }, f2: { red: 200 } } },
    { id: 'p2', name: 'Cold Wash', category: 'color', fixtureValues: { f2: { blue: 255 } } },
    { id: 'p3', name: 'Full Bright', category: 'intensity', fixtureValues: { f1: { intensity: 255 }, f3: { intensity: 255 } } },
    { id: 'p4', name: 'Stage Left', category: 'position', fixtureValues: { f1: { pan: 50 } } },
  ]

  it('filters presets by name (case-insensitive partial match)', () => {
    expect(filterPresets(presets, { query: 'wash' }).map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(filterPresets(presets, { query: 'WARM' }).map((p) => p.id)).toEqual(['p1'])
    expect(filterPresets(presets, { query: 'xyz' })).toEqual([])
  })

  it('filters presets by category', () => {
    expect(filterPresets(presets, { category: 'color' }).map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(filterPresets(presets, { category: 'intensity' }).map((p) => p.id)).toEqual(['p3'])
    expect(filterPresets(presets, { category: 'position' }).map((p) => p.id)).toEqual(['p4'])
  })

  it('filters presets by selected fixture overlap', () => {
    expect(filterPresets(presets, { fixtureIds: ['f1'] }).map((p) => p.id)).toEqual(['p1', 'p3', 'p4'])
    expect(filterPresets(presets, { fixtureIds: ['f3'] }).map((p) => p.id)).toEqual(['p3'])
    expect(filterPresets(presets, { fixtureIds: ['f99'] })).toEqual([])
  })

  it('combines filters', () => {
    expect(filterPresets(presets, { query: 'wash', category: 'color', fixtureIds: ['f1'] }).map((p) => p.id)).toEqual(['p1'])
  })

  it('filters sequences by name and fixture', () => {
    const sequences: SequenceDef[] = [
      { id: 's1', name: 'Color Chase', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1, steps: [{ id: 'st1', name: 'Step 1', fixtureValues: { f1: { red: 255 } }, presetIds: [], fadeMs: 0, holdMs: 500 }] },
      { id: 's2', name: 'Position Move', order: 'forward', loop: false, timing: 'manual', stepsPerBeat: 1, steps: [{ id: 'st2', name: 'Step 2', fixtureValues: { f2: { pan: 100 } }, presetIds: [], fadeMs: 0, holdMs: 500 }] },
    ]
    expect(filterSequences(sequences, { query: 'chase' }).map((s) => s.id)).toEqual(['s1'])
    expect(filterSequences(sequences, { fixtureIds: ['f2'] }).map((s) => s.id)).toEqual(['s2'])
  })

  it('finds related cues that reference a preset', () => {
    const show: ShowDef = {
      id: 'show1', name: 'Test', createdAt: 0, updatedAt: 0,
      fixtures: [], scenes: [], automations: [],
      livePages: [
        { id: 'page1', name: 'Main', controls: [
          { id: 'c1', name: 'Cue 1', type: 'toggle', presetIds: ['p1', 'p2'], x: 0, y: 0 },
          { id: 'c2', name: 'Cue 2', type: 'toggle', presetIds: ['p3'], x: 50, y: 0 },
        ] },
        { id: 'page2', name: 'Second', controls: [
          { id: 'c3', name: 'Cue 3', type: 'flash', presetIds: ['p1'], x: 0, y: 0 },
        ] },
      ],
    }
    const related = findRelatedCues(show, 'p1')
    expect(related).toHaveLength(2)
    expect(related[0]).toMatchObject({ pageName: 'Main', controlName: 'Cue 1' })
    expect(related[1]).toMatchObject({ pageName: 'Second', controlName: 'Cue 3' })
    expect(findRelatedCues(show, 'p99')).toHaveLength(0)
  })
})
