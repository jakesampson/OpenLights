import type { FixtureDef, LivePage, PresetDef, SequenceDef, CueListDef, ShowDef, LiveControl } from '@shared/types'

/** Filter presets by name, category and selected fixture overlap. */
export function filterPresets(
  presets: PresetDef[],
  options: { query?: string; category?: PresetDef['category']; fixtureIds?: string[] }
): PresetDef[] {
  let result = presets
  if (options.query) {
    const q = options.query.toLowerCase()
    result = result.filter((p) => p.name.toLowerCase().includes(q))
  }
  if (options.category) {
    result = result.filter((p) => p.category === options.category)
  }
  if (options.fixtureIds?.length) {
    const ids = new Set(options.fixtureIds)
    result = result.filter((p) =>
      Object.keys(p.fixtureValues).some((id) => ids.has(id))
    )
  }
  return result
}

/** Filter sequences by name or fixture overlap. */
export function filterSequences(
  sequences: SequenceDef[],
  options: { query?: string; fixtureIds?: string[] }
): SequenceDef[] {
  let result = sequences
  if (options.query) {
    const q = options.query.toLowerCase()
    result = result.filter((s) => s.name.toLowerCase().includes(q))
  }
  if (options.fixtureIds?.length) {
    const ids = new Set(options.fixtureIds)
    result = result.filter((s) =>
      s.steps.some((step) => Object.keys(step.fixtureValues).some((id) => ids.has(id)))
    )
  }
  return result
}

/** Find Live cues (controls) that reference a given preset. */
export function findRelatedCues(
  show: ShowDef,
  presetId: string
): { pageId: string; pageName: string; controlId: string; controlName: string }[] {
  const results: { pageId: string; pageName: string; controlId: string; controlName: string }[] = []
  for (const page of show.livePages ?? []) {
    for (const control of page.controls) {
      if (control.presetIds.includes(presetId)) {
        results.push({ pageId: page.id, pageName: page.name, controlId: control.id, controlName: control.name })
      }
    }
  }
  return results
}

/** Find cue lists that contain cues referencing a preset (via cue→preset mapping). */
export function findRelatedCueLists(
  show: ShowDef,
  presetId: string
): { cueListId: string; cueListName: string }[] {
  // Cue list steps reference cues, not presets directly in the current model.
  // Sequences reference presets, so check if any sequence that uses this preset
  // is associated with a cue or cuelist.
  return []
}
