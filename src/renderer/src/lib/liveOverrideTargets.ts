// Which cues / Live buttons "Add Overrides" and "Edit Ad Hoc
// Properties" act on (Guide ch.11, pp.201–202: Control-click a button in
// the Live view or a cue in a cuelist, or select buttons/cues in Live
// edit mode). Pure, so the store and the menus share one resolution.
// The state shape is structural — this lib must not import the store.

import type { CueDef, CueListDef, LivePage, ShowDef } from '@shared/types'
import type { PageObjectRef } from './livePageObjects'

export interface OverrideTargetState {
  show: ShowDef | null
  cues: CueDef[]
  cueLists: CueListDef[]
  selectedPageObjects: PageObjectRef[]
  activeCueListId: string | null
  activeCueIndex: number
  activeCueId: string | null
}

function findControl(pages: LivePage[] | undefined, id: string) {
  for (const page of pages ?? []) {
    const control = page.controls.find((c) => c.id === id)
    if (control) return control
  }
  return undefined
}

/** A cuelist widget's list: a 'list' ref carries the widget id, and the
 * widget (on any page) carries the cueListId it displays. */
function findListWidget(pages: LivePage[] | undefined, id: string) {
  for (const page of pages ?? []) {
    const widget = page.cueListWidgets?.find((w) => w.id === id)
    if (widget) return widget
  }
  return undefined
}

function listTargetCueId(state: OverrideTargetState, listId: string): string | undefined {
  const list = state.cueLists.find((l) => l.id === listId)
  if (!list) return undefined
  const step = list.steps[state.activeCueIndex]
  if (state.activeCueListId === list.id && step) return step.cueId
  return list.steps[0]?.cueId
}

/** The cues/buttons Add Overrides merges into: the Live selection when
 * there is one, else the active cue (the native-menu / keyboard path). */
export function addOverridesTargetIds(state: OverrideTargetState): string[] {
  const ids: string[] = []
  for (const ref of state.selectedPageObjects) {
    if (ref.type === 'cue') {
      const control = findControl(state.show?.livePages, ref.id)
      // A button bound to a cue merges into the cue; a standalone button
      // merges into its own captured ad-hoc values.
      ids.push(control?.cueId ?? ref.id)
    } else if (ref.type === 'list') {
      const widget = findListWidget(state.show?.livePages, ref.id)
      const cueId = widget ? listTargetCueId(state, widget.cueListId) : undefined
      if (cueId) ids.push(cueId)
    }
  }
  if (ids.length > 0) return [...new Set(ids)]
  return state.activeCueId ? [state.activeCueId] : []
}

/** What Edit Ad Hoc Properties opens for the Live selection: the cue's
 * id for a cue button / cuelist widget, `popup: true` for a standalone
 * button (its ad-hoc values are edited in the button's inspector),
 * null when nothing is selected. */
export function editAdHocTarget(state: OverrideTargetState): { cueId: string } | { popup: true } | null {
  const ref = state.selectedPageObjects[0]
  if (!ref) return null
  if (ref.type === 'cue') {
    const control = findControl(state.show?.livePages, ref.id)
    return control?.cueId ? { cueId: control.cueId } : { popup: true }
  }
  if (ref.type === 'list') {
    const widget = findListWidget(state.show?.livePages, ref.id)
    const cueId = widget ? listTargetCueId(state, widget.cueListId) : undefined
    return cueId ? { cueId } : null
  }
  return null
}
