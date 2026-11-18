import { describe, expect, it } from 'vitest'
import { searchProject } from '../src/renderer/src/lib/searchProject'
import { migrateShow } from '../src/shared/migrations'
describe('project search', () => {
  it('finds every item type with a case-insensitive partial name and target context', () => {
    const show = migrateShow({ fixtures: [{ id: 'f', name: 'Warm fixture', group: 'Warm group' }], cues: [{ id: 's', name: 'Warm look' }], presets: [{ id: 'p', name: 'Warm preset' }], sequences: [{ id: 'q', name: 'Warm sequence' }], cueLists: [{ id: 'l', name: 'Warm list', steps: [{ id: 'step', cueId: 's' }] }], livePages: [{ id: 'page', name: 'Warm page', controls: [{ id: 'cue', name: 'Warm cue' }] }] })
    expect(new Set(searchProject(show, 'WArM').map((r) => r.type))).toEqual(new Set(['fixture', 'group', 'cue', 'preset', 'sequence', 'cueList', 'page', 'cue']))
    expect(searchProject(show, 'Warm cue')[0].pageId).toBe('page')
    expect(searchProject(show, '')).toEqual([])
  })
})
