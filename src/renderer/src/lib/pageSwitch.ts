/** Per-page memory of active cue levels, keyed by page id. */
export type PageActiveValues = Record<string, Record<string, number>>

export interface PageSwitchState {
  activeLivePageId: string | null
  activeLiveValues: Record<string, number>
  pageActiveValues: PageActiveValues
}

/**
 * Switch the active Live page.
 *
 * By default the outgoing page's active cue levels are remembered and the
 * incoming page's levels restored, so returning to a page brings its look
 * back. With `deactivateOnSwitch` the levels are released and not remembered.
 * The returned value is immutable. The crossfade itself is applied by the
 * output layer using the incoming page's fade time.
 */
export function switchLivePage(
  state: PageSwitchState,
  targetId: string | null,
  deactivateOnSwitch = false
): PageSwitchState {
  if (targetId === state.activeLivePageId) return state

  const pageActiveValues: PageActiveValues = { ...state.pageActiveValues }
  if (state.activeLivePageId) {
    if (deactivateOnSwitch) delete pageActiveValues[state.activeLivePageId]
    else pageActiveValues[state.activeLivePageId] = { ...state.activeLiveValues }
  }

  const activeLiveValues = !targetId || deactivateOnSwitch
    ? {}
    : { ...(pageActiveValues[targetId] ?? {}) }

  return { activeLivePageId: targetId, activeLiveValues, pageActiveValues }
}

/** Drop remembered levels for pages that no longer exist. */
export function prunePageValues(values: PageActiveValues, pageIds: string[]): PageActiveValues {
  const valid = new Set(pageIds)
  const next: PageActiveValues = {}
  for (const [id, levels] of Object.entries(values)) if (valid.has(id)) next[id] = levels
  return next
}
