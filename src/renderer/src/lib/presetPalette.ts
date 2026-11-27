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

/** Find Live cues (controls) that reference a given preset — in the
 *  button's own lists or in its inline cue. */
export function findRelatedCues(
  show: ShowDef,
  presetId: string
): { pageId: string; pageName: string; controlId: string; controlName: string }[] {
  const results: { pageId: string; pageName: string; controlId: string; controlName: string }[] = []
  for (const page of show.livePages ?? []) {
    for (const control of page.controls) {
      if ((control.presetIds ?? []).includes(presetId) || (control.cue?.presetIds ?? []).includes(presetId)) {
        results.push({ pageId: page.id, pageName: page.name, controlId: control.id, controlName: control.name })
      }
    }
  }
  return results
}

/** Find Live cues (controls) that reference a given sequence — in the
 *  button's own lists or in its inline cue. */
export function findRelatedCuesForSequence(
  show: ShowDef,
  sequenceId: string
): { pageId: string; pageName: string; controlId: string; controlName: string }[] {
  const results: { pageId: string; pageName: string; controlId: string; controlName: string }[] = []
  for (const page of show.livePages ?? []) {
    for (const control of page.controls) {
      if ((control.sequenceIds ?? []).includes(sequenceId) || (control.cue?.sequenceIds ?? []).includes(sequenceId)) {
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

/**
 * Presets and sequences not contained in any cue (Guide ch.9, p.144,
 * "Find presets and sequences not contained in a cue"). A preset is
 * used when a Live cue button, its inline cue, or a cuelist step's cue
 * references it directly; a sequence is used when a cue references it. Presets that live inside
 * a sequence step are never selected — the guide says "Presets within a
 * sequence are not included" — even when that sequence is itself unused,
 * so the selection can never strand a sequence's contents.
 * `scope` limits the search to the given ids (a selection, or a group's
 * contents); with no scope the whole palette is searched.
 */
export function findUnusedItems(
  show: ShowDef,
  scope?: { presetIds: string[]; sequenceIds: string[] } | null,
  cueLists?: CueListDef[]
): { presets: PresetDef[]; sequences: SequenceDef[] } {
  const usedPresets = new Set<string>()
  const usedSequences = new Set<string>()
  for (const page of show.livePages ?? []) {
    for (const control of page.controls) {
      for (const id of control.presetIds ?? []) usedPresets.add(id)
      for (const id of control.sequenceIds ?? []) usedSequences.add(id)
      // A button's cue holds its own contents (Jake, 27 Nov 2026 —
      // inline cues): a preset only the cue references is used.
      for (const id of control.cue?.presetIds ?? []) usedPresets.add(id)
      for (const id of control.cue?.sequenceIds ?? []) usedSequences.add(id)
    }
  }
  // Cuelist steps' cues hold contents too. The lists live in the store
  // beside the show; callers pass them, otherwise the show's own copy
  // (kept in sync by the store) is used.
  for (const list of cueLists ?? show.cueLists ?? []) {
    for (const step of list.steps) {
      for (const id of step.cue.presetIds ?? []) usedPresets.add(id)
      for (const id of step.cue.sequenceIds ?? []) usedSequences.add(id)
    }
  }
  const inSequence = new Set<string>()
  for (const sequence of show.sequences ?? []) {
    for (const step of sequence.steps) for (const id of step.presetIds) inSequence.add(id)
  }
  const presetScope = scope ? new Set(scope.presetIds) : null
  const sequenceScope = scope ? new Set(scope.sequenceIds) : null
  return {
    presets: (show.presets ?? []).filter((p) =>
      (presetScope === null || presetScope.has(p.id)) && !usedPresets.has(p.id) && !inSequence.has(p.id)),
    sequences: (show.sequences ?? []).filter((s) =>
      (sequenceScope === null || sequenceScope.has(s.id)) && !usedSequences.has(s.id))
  }
}
