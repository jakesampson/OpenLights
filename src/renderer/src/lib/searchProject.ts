import type { ShowDef } from '@shared/types'
export interface ProjectSearchResult { type: 'fixture' | 'group' | 'preset' | 'sequence' | 'scene' | 'cue' | 'cueList' | 'page'; id: string; name: string; pageId?: string; listId?: string }
export function searchProject(show: ShowDef, query: string): ProjectSearchResult[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const results: ProjectSearchResult[] = []
  const add = (type: ProjectSearchResult['type'], id: string, name: string, extra = {}) => { if (name.toLocaleLowerCase().includes(needle)) results.push({ type, id, name, ...extra }) }
  for (const fixture of show.fixtures) add('fixture', fixture.id, fixture.name)
  for (const group of new Set(show.fixtures.map((f) => f.group).filter((g): g is string => Boolean(g)))) add('group', group, group)
  for (const preset of show.presets ?? []) add('preset', preset.id, preset.name)
  for (const sequence of (show as ShowDef & { sequences?: { id: string; name: string }[] }).sequences ?? []) add('sequence', sequence.id, sequence.name)
  for (const scene of show.scenes) add('scene', scene.id, scene.name)
  for (const list of show.cueLists ?? []) {
    add('cueList', list.id, list.name)
    for (const step of list.steps) add('cue', step.id, show.scenes.find((s) => s.id === step.sceneId)?.name ?? 'Missing scene', { listId: list.id })
  }
  for (const page of show.livePages ?? []) { add('page', page.id, page.name); for (const cue of page.controls) add('cue', cue.id, cue.name, { pageId: page.id }) }
  return results
}
