import { describe, expect, it } from 'vitest'
import type { PresetDef, SequenceDef, ShowDef } from '../src/shared/types'
import { filterPresets, filterSequences, findRelatedCues, findRelatedCuesForSequence, findUnusedItems } from '../src/renderer/src/lib/presetPalette'

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
      fixtures: [], automations: [],
      livePages: [
        { id: 'page1', name: 'Main', controls: [
          { id: 'c1', name: 'Cue 1', type: 'push', presetIds: ['p1', 'p2'], x: 0, y: 0 },
          { id: 'c2', name: 'Cue 2', type: 'push', presetIds: ['p3'], x: 50, y: 0 },
        ] },
        { id: 'page2', name: 'Second', controls: [
          { id: 'c3', name: 'Cue 3', type: 'push', behavior: 'flash', presetIds: ['p1'], x: 0, y: 0 },
        ] },
      ],
    }
    const related = findRelatedCues(show, 'p1')
    expect(related).toHaveLength(2)
    expect(related[0]).toMatchObject({ pageName: 'Main', controlName: 'Cue 1' })
    expect(related[1]).toMatchObject({ pageName: 'Second', controlName: 'Cue 3' })
    expect(findRelatedCues(show, 'p99')).toHaveLength(0)
  })

  it('finds a preset referenced only by a button’s inline cue', () => {
    const show: ShowDef = {
      id: 'show1', name: 'Test', createdAt: 0, updatedAt: 0,
      fixtures: [], automations: [],
      livePages: [
        { id: 'page1', name: 'Main', controls: [
          { id: 'c1', name: 'Cue 1', type: 'push', presetIds: [], x: 0, y: 0, cue: { id: 'cue1', name: 'Cue 1', fadeMs: 0, fixtureValues: {}, presetIds: ['p1'], sequenceIds: ['s1'] } },
          { id: 'c2', name: 'Cue 2', type: 'push', presetIds: [], x: 50, y: 0 },
        ] },
      ],
    }
    const related = findRelatedCues(show, 'p1')
    expect(related).toHaveLength(1)
    expect(related[0]).toMatchObject({ pageName: 'Main', controlName: 'Cue 1' })
    expect(findRelatedCuesForSequence(show, 's1')).toHaveLength(1)
    expect(findRelatedCues(show, 'p99')).toHaveLength(0)
  })

  it('finds related cues that reference a sequence', () => {
    const show: ShowDef = {
      id: 'show1', name: 'Test', createdAt: 0, updatedAt: 0,
      fixtures: [], automations: [],
      livePages: [
        { id: 'page1', name: 'Main', controls: [
          { id: 'c1', name: 'Cue 1', type: 'push', presetIds: [], sequenceIds: ['s1'], x: 0, y: 0 },
          { id: 'c2', name: 'Cue 2', type: 'push', presetIds: ['p1'], x: 50, y: 0 },
        ] },
        { id: 'page2', name: 'Second', controls: [
          { id: 'c3', name: 'Cue 3', type: 'push', behavior: 'flash', presetIds: [], sequenceIds: ['s1', 's2'], x: 0, y: 0 },
        ] },
      ],
    }
    const related = findRelatedCuesForSequence(show, 's1')
    expect(related).toHaveLength(2)
    expect(related[0]).toMatchObject({ pageName: 'Main', controlName: 'Cue 1' })
    expect(related[1]).toMatchObject({ pageName: 'Second', controlName: 'Cue 3' })
    expect(findRelatedCuesForSequence(show, 's2')).toHaveLength(1)
    expect(findRelatedCuesForSequence(show, 's99')).toHaveLength(0)
  })
})

describe('find presets and sequences not contained in a cue (Guide ch.9, p.144)', () => {
  const presets: PresetDef[] = [
    { id: 'p-used-live', name: 'Used Live', category: 'color', fixtureValues: {} },
    { id: 'p-used-cue', name: 'Used Cue', category: 'color', fixtureValues: {} },
    { id: 'p-in-sequence', name: 'In Sequence', category: 'color', fixtureValues: {} },
    { id: 'p-free', name: 'Free', category: 'color', fixtureValues: {} }
  ]
  const sequences: SequenceDef[] = [
    { id: 's-used', name: 'Used Chase', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1, steps: [{ id: 'st1', name: 'Step 1', fixtureValues: {}, presetIds: ['p-in-sequence'], fadeMs: 0, holdMs: 500 }] },
    { id: 's-free', name: 'Free Chase', order: 'forward', loop: false, timing: 'manual', stepsPerBeat: 1, steps: [{ id: 'st2', name: 'Step 1', fixtureValues: {}, presetIds: [], fadeMs: 0, holdMs: 500 }] }
  ]
  // 'p-used-cue' lives in a button's inline cue and in a cuelist
  // step's cue (Jake, 27 Nov 2026 — inline cues: there is no
  // project-wide cue store any more).
  const show: ShowDef = {
    id: 'show1', name: 'Test', createdAt: 0, updatedAt: 0,
    fixtures: [],
    automations: [],
    presets,
    sequences,
    livePages: [
      { id: 'page1', name: 'Main', controls: [
        { id: 'c1', name: 'Cue 1', type: 'push', presetIds: ['p-used-live'], sequenceIds: ['s-used'], x: 0, y: 0, cue: { id: 'cue1', name: 'Stored Cue', fadeMs: 0, fixtureValues: {}, presetIds: ['p-used-cue'] } }
      ] }
    ],
    cueLists: [
      { id: 'list1', name: 'List', steps: [{ id: 'step1', cue: { id: 'cue2', name: 'Step Cue', fadeMs: 0, fixtureValues: {}, presetIds: ['p-used-cue'] }, fadeMs: 0, holdMs: 0 }] }
    ]
  }

  it('selects only items no cue contains, across the whole palette', () => {
    const unused = findUnusedItems(show)
    expect(unused.presets.map((p) => p.id)).toEqual(['p-free'])
    expect(unused.sequences.map((s) => s.id)).toEqual(['s-free'])
  })

  it('never selects a preset that lives inside a sequence, even an unused one', () => {
    // p-in-sequence is inside s-used (which is in a cue), but the rule is
    // scope-wide: presets within a sequence are not included at all.
    expect(findUnusedItems(show).presets.map((p) => p.id)).not.toContain('p-in-sequence')
    const onlySequence = findUnusedItems(show, { presetIds: ['p-in-sequence'], sequenceIds: [] })
    expect(onlySequence.presets).toEqual([])
  })

  it('limits the search to the given scope', () => {
    const unused = findUnusedItems(show, { presetIds: ['p-used-live', 'p-free'], sequenceIds: ['s-used'] })
    expect(unused.presets.map((p) => p.id)).toEqual(['p-free'])
    expect(unused.sequences).toEqual([])
  })

  it('returns everything unused when nothing is used', () => {
    const empty: ShowDef = { ...show, livePages: [], cueLists: [] }
    const unused = findUnusedItems(empty)
    expect(unused.presets.map((p) => p.id)).toEqual(['p-used-live', 'p-used-cue', 'p-free'])
    expect(unused.sequences.map((s) => s.id)).toEqual(['s-used', 's-free'])
  })
})
