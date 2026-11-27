import { describe, expect, it } from 'vitest'
import { searchProject } from '../src/renderer/src/lib/searchProject'
import { migrateShow } from '../src/shared/migrations'
describe('project search', () => {
  it('finds every item type with a case-insensitive partial name and target context', () => {
    // Inline cues (Jake, 27 Nov 2026): the "Warm look" cue lives in
    // a cuelist step and the "Warm cue" cue lives on a Live button —
    // two separate copies, each found by name with its holder, so a
    // search result navigates to where that cue lives.
    const show = migrateShow({ fixtures: [{ id: 'f', name: 'Warm fixture', group: 'Warm group' }], cues: [{ id: 's', name: 'Warm look' }, { id: 'b', name: 'Warm cue' }], presets: [{ id: 'p', name: 'Warm preset' }], sequences: [{ id: 'q', name: 'Warm sequence' }], cueLists: [{ id: 'l', name: 'Warm list', steps: [{ id: 'step', cueId: 's', fadeMs: 0, holdMs: 0 }] }], livePages: [{ id: 'page', name: 'Warm page', controls: [{ id: 'btn', name: 'Warm cue', type: 'push', cueId: 'b', presetIds: [] }] }] })
    expect(new Set(searchProject(show, 'WArM').map((r) => r.type))).toEqual(new Set(['fixture', 'group', 'cue', 'preset', 'sequence', 'cueList', 'page', 'cue']))
    expect(searchProject(show, 'Warm cue')[0].pageId).toBe('page')
    expect(searchProject(show, 'Warm cue')[0].id).toBe('btn')
    expect(searchProject(show, 'Warm look')[0].listId).toBe('l')
    expect(searchProject(show, 'Warm look')[0].id).toBe('step')
    expect(searchProject(show, '')).toEqual([])
  })

  it('a standalone Live button (no cue) is not listed as a cue', () => {
    const show = migrateShow({ fixtures: [], livePages: [{ id: 'page', name: 'Page', controls: [{ id: 'btn', name: 'Standalone', type: 'push', presetIds: [] }] }] })
    expect(searchProject(show, 'Standalone')).toEqual([])
  })
})
