import type { ShowDef } from '@shared/types'
export interface ProjectSearchResult { type: 'fixture' | 'group' | 'preset' | 'sequence' | 'cue' | 'cueList' | 'page'; id: string; name: string; pageId?: string; listId?: string }
export function searchProject(show: ShowDef, query: string): ProjectSearchResult[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const results: ProjectSearchResult[] = []
  const add = (type: ProjectSearchResult['type'], id: string, name: string, extra = {}) => { if (name.toLocaleLowerCase().includes(needle)) results.push({ type, id, name, ...extra }) }
  for (const fixture of show.fixtures) add('fixture', fixture.id, fixture.name)
  for (const group of new Set(show.fixtures.map((f) => f.group).filter((g): g is string => Boolean(g)))) add('group', group, group)
  for (const preset of show.presets ?? []) add('preset', preset.id, preset.name)
  for (const sequence of (show as ShowDef & { sequences?: { id: string; name: string }[] }).sequences ?? []) add('sequence', sequence.id, sequence.name)
  // Cues live only inside their holder (Jake, 27 Nov 2026 — no
  // project-wide cue store): a cue is found by name wherever it
  // lives, and the result names its holder so selecting it navigates
  // there. A button cue's id is the BUTTON's id (Live buttons carry
  // data-project-id=<control id>, so the reveal scroll lands on the
  // button); a step cue's id is the STEP's id. Two holders carrying
  // copies of the "same" cue are two separate results, one per holder.
  for (const list of show.cueLists ?? []) {
    add('cueList', list.id, list.name)
    for (const step of list.steps) add('cue', step.id, step.cue.name, { listId: list.id })
  }
  for (const page of show.livePages ?? []) {
    add('page', page.id, page.name)
    for (const control of page.controls) if (control.cue) add('cue', control.id, control.cue.name, { pageId: page.id })
  }
  return results
}
