/**
 * Fade-time priority (Jake, 24 Nov 2026) — one order, used wherever a
 * transition needs a fade time:
 * 1. Live page fade — governs transitions a Live page drives (page
 *    switches, page controls, and the base re-send that follows them).
 *    It overrides the global setting.
 * 2. The transition's own explicit fade time — a cue's fadeMs, a
 *    cue-list step's fadeMs — where set. A 0 here is an explicit
 *    snap, not an unset value.
 * 3. The global Default fade (Settings → Timing,
 *    preferences.defaultFadeMs) as the fallback — including for
 *    virtual-dimmer cues, whose brightness has no hardware dimmer to
 *    carry a time of its own, and for preset-triggered changes,
 *    which carry no fade time at all.
 *
 * A level only applies where it governs the transition: a cue-list
 * recall is not a page transition, so it consults the step/cue time
 * and then the global — the page fade never reaches it (cue-list
 * Go/Back deliberately stay on the step's own fadeMs). A Live page
 * transition consults the page fade first and never reaches the
 * global. Passing a level as undefined means "does not govern".
 */
export function resolveFadeMs(args: {
  pageFadeMs?: number | null
  explicitFadeMs?: number | null
  defaultFadeMs?: number | null
}): number {
  const fallback =
    typeof args.defaultFadeMs === 'number' && Number.isFinite(args.defaultFadeMs)
      ? Math.max(0, args.defaultFadeMs)
      : 1000
  if (typeof args.pageFadeMs === 'number' && Number.isFinite(args.pageFadeMs)) return Math.max(0, args.pageFadeMs)
  if (typeof args.explicitFadeMs === 'number' && Number.isFinite(args.explicitFadeMs)) return Math.max(0, args.explicitFadeMs)
  return fallback
}

/** The active Live page's own fade time, when the page has one set
 *  (LivePage.fadeMs is optional — a page only has a fade time when
 *  Jake sets one for it in Manage Live Pages). Falls back to the
 *  first page when no page is selected, like the store's
 *  activeLivePage. Returns null when no page carries a fade time,
 *  so the caller falls through to the explicit time, then the
 *  global Default fade. */
export function activeLivePageFadeMs(
  pages: Array<{ id: string; fadeMs?: number | null }> | undefined,
  activePageId: string | null | undefined
): number | null {
  const page = pages?.find((item) => item.id === activePageId) ?? pages?.[0]
  const value = page?.fadeMs
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
