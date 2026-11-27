import type { CueDef, LiveControl, LiveDefaultStyles, LivePage } from '@shared/types'
import { LIVE_CUE_SIZE, LIVE_CUE_STEP } from '@shared/liveObjectDefaults'
import { newCueObject, type PageObjectRef } from './livePageObjects'

/** Clipboard/DRAG format shared by the palette and all three drop targets. */
export const LIVE_DROP_MIME = 'application/x-openlights-live-drop'
/** Legacy single-preset type still written for interoperability. */
export const LEGACY_PRESET_MIME = 'application/x-openlights-preset'

const snap = (value: number) => Math.max(0, Math.round(value / 10) * 10)

/** What is being dragged: any mix of presets, sequences and effects, or
 *  the NDI Ambience entry (Jake, 23 Nov 2026) — a standalone Live button
 *  with no presets or sequences attached. Effects land on the Live panel
 *  as buttons too (Jake, 26 Nov 2026 — proven in LightKey by his own
 *  test: dragging a colour effect onto the Live window creates a button
 *  that runs the effect while it is active). */
export interface LiveDropPayload {
  presetIds: string[]
  sequenceIds: string[]
  effectIds: string[]
  /** Names used only to derive a sensible cue label. */
  presetNames?: Record<string, string>
  sequenceNames?: Record<string, string>
  effectNames?: Record<string, string>
  ndiAmbience?: boolean
}

/** The button colour for an NDI Ambience Live button: the screen's own
 *  blue (#0A84FF), so the button shows its on/off state in NDI colours
 *  rather than taking on a light colour (it has no light of its own). */
export const NDI_AMBIENCE_BUTTON_COLOR = '#0A84FF'

export type LiveDropTarget =
  | { kind: 'page'; x: number; y: number }
  | { kind: 'frame'; frameId: string; x: number; y: number }
  | { kind: 'cue'; cueId: string }

export interface LiveDropResult { page: LivePage; refs: PageObjectRef[] }

export const emptyDropPayload = (): LiveDropPayload => ({ presetIds: [], sequenceIds: [], effectIds: [] })

const uniqueIds = (ids: string[] | undefined): string[] =>
  [...new Set((ids ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0))]

/** Drop payloads are normalised once so every target sees deduplicated ids. */
export function normalizeDropPayload(payload: LiveDropPayload): LiveDropPayload {
  return {
    ...payload,
    presetIds: uniqueIds(payload.presetIds),
    sequenceIds: uniqueIds(payload.sequenceIds),
    effectIds: uniqueIds(payload.effectIds),
    ndiAmbience: payload.ndiAmbience === true ? true : undefined
  }
}

export function encodeLiveDrop(payload: LiveDropPayload): string {
  return JSON.stringify(normalizeDropPayload(payload))
}

/** Parse a drag payload, returning null for anything malformed. */
export function decodeLiveDrop(text: string): LiveDropPayload | null {
  try {
    const raw: unknown = JSON.parse(text)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const value = raw as Record<string, unknown>
    if (!Array.isArray(value.presetIds) || !Array.isArray(value.sequenceIds)) return null
    // effectIds is newer than the first payloads (Jake, 26 Nov 2026):
    // absent is an old payload, present-but-not-an-array is malformed.
    if (value.effectIds !== undefined && !Array.isArray(value.effectIds)) return null
    const names = (field: unknown): Record<string, string> | undefined => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return undefined
      return Object.fromEntries(Object.entries(field as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      ))
    }
    return normalizeDropPayload({
      presetIds: value.presetIds as string[],
      sequenceIds: value.sequenceIds as string[],
      effectIds: (value.effectIds ?? []) as string[],
      presetNames: names(value.presetNames),
      sequenceNames: names(value.sequenceNames),
      effectNames: names(value.effectNames),
      ndiAmbience: value.ndiAmbience === true ? true : undefined
    })
  } catch {
    return null
  }
}

/** A readable label for a new cue built from the dragged items. */
export function dropLabel(payload: LiveDropPayload): string {
  const { presetIds, sequenceIds, effectIds, presetNames, sequenceNames, effectNames } = normalizeDropPayload(payload)
  if (payload.ndiAmbience) return 'NDI Ambience'
  const total = presetIds.length + sequenceIds.length + effectIds.length
  if (!total) return 'New cue'
  if (total === 1) {
    if (presetIds.length) return presetNames?.[presetIds[0]] || 'Preset'
    if (sequenceIds.length) return sequenceNames?.[sequenceIds[0]] || 'Sequence'
    return effectNames?.[effectIds[0]] || 'Effect'
  }
  const parts: string[] = []
  if (presetIds.length) parts.push(`${presetIds.length} preset${presetIds.length === 1 ? '' : 's'}`)
  if (sequenceIds.length) parts.push(`${sequenceIds.length} sequence${sequenceIds.length === 1 ? '' : 's'}`)
  if (effectIds.length) parts.push(`${effectIds.length} effect${effectIds.length === 1 ? '' : 's'}`)
  return parts.join(' + ')
}

/**
 * Where a dropped cue lands. On a frame the centre is kept inside the frame so
 * the geometric frame membership from lib/liveFrames still applies.
 */
function dropPosition(
  x: number, y: number,
  frame: { x: number; y: number; width: number; height: number } | undefined,
  width: number, height: number
): { x: number; y: number } {
  let px = snap(x), py = snap(y)
  if (frame) {
    const margin = 10
    const cx = Math.max(frame.x + margin, Math.min(frame.x + frame.width - margin, px + width / 2))
    const cy = Math.max(frame.y + margin, Math.min(frame.y + frame.height - margin, py + height / 2))
    px = Math.max(0, Math.round(cx - width / 2))
    py = Math.max(0, Math.round(cy - height / 2))
  }
  return { x: px, y: py }
}

/** Sequence ids started by active cues, deduplicated across all pages.
 *  A button's sequence usually lives in its inline cue, not on the
 *  button itself — without this the cue's sequence never registers with
 *  the output engine, so it never animates and never completes (found by
 *  the real-app probe, 27 Nov 2026: a run-once Rainbow cue stayed lit
 *  forever instead of auto-deactivating). `cues` is accepted for the
 *  callers that still pass the show's inline cues and ignored — the cue
 *  now comes from each control itself. */
export function activeCueSequenceIds(
  pages: LivePage[] | undefined,
  active: Record<string, number>,
  cues?: CueDef[]
): string[] {
  void cues
  const ids = new Set<string>()
  for (const page of pages ?? []) for (const cue of page.controls) {
    if ((active[cue.id] ?? 0) <= 0) continue
    for (const id of cue.sequenceIds ?? []) ids.add(id)
    for (const id of cue.cue?.sequenceIds ?? []) ids.add(id)
  }
  return [...ids]
}

/** Effect ids run by active Live buttons, deduplicated across all pages —
 *  the same derivation as activeCueSequenceIds, for effects (Jake,
 *  26 Nov 2026). A button drives its effects while its level is above
 *  zero, so pressing, flashing, releasing, clearing and page-switching
 *  all flow through the one place — no per-action flag syncing. */
export function activeLiveEffectIds(
  pages: LivePage[] | undefined,
  active: Record<string, number>
): string[] {
  const ids = new Set<string>()
  for (const page of pages ?? []) for (const cue of page.controls) {
    if ((active[cue.id] ?? 0) <= 0) continue
    for (const id of cue.effectIds ?? []) ids.add(id)
  }
  return [...ids]
}

/**
 * Pure drop logic for presets/sequences/effects onto a Live page. The
 * three targets either create a new cue (page/frame) or extend an
 * existing one (cue button).
 */
export function applyLiveDrop(
  page: LivePage,
  payload: LiveDropPayload,
  target: LiveDropTarget,
  makeId: () => string,
  defaults?: LiveDefaultStyles,
  split = false
): LiveDropResult {
  const clean = normalizeDropPayload(payload)
  if (!clean.presetIds.length && !clean.sequenceIds.length && !clean.effectIds.length && !clean.ndiAmbience) return { page, refs: [] }

  if (target.kind === 'cue') {
    // An ambience button is standalone — it never joins a cue, and
    // dropping it onto one does nothing rather than corrupting it.
    if (clean.ndiAmbience) return { page, refs: [] }
    // Effects are the same: a cue cannot hold effects (cues still don't
    // capture running effects), so an effect drop onto a cue button does
    // nothing — drop it on the page to make a button for it.
    if (clean.effectIds.length) return { page, refs: [] }
    const cue = page.controls.find((item) => item.id === target.cueId)
    if (!cue) return { page, refs: [] }
    // A button carrying an inline cue takes the drop into the CUE
    // (Video 2: dragging a preset onto an existing button adds it to
    // that button's queue — the Get Info list shows it and it travels
    // with the cue). A standalone button takes it into its own lists,
    // as before. (The store's dropOnLivePage takes the cue branch
    // first; this keeps the pure function consistent for direct
    // callers.)
    if (cue.cue) {
      const updated: LiveControl = {
        ...cue,
        cue: {
          ...cue.cue,
          presetIds: uniqueIds([...(cue.cue.presetIds ?? []), ...clean.presetIds]),
          sequenceIds: uniqueIds([...(cue.cue.sequenceIds ?? []), ...clean.sequenceIds])
        }
      }
      return {
        page: { ...page, controls: page.controls.map((item) => item.id === cue.id ? updated : item) },
        refs: [{ type: 'cue' as const, id: cue.id }]
      }
    }
    const updated = {
      ...cue,
      presetIds: uniqueIds([...(cue.presetIds ?? []), ...clean.presetIds]),
      sequenceIds: uniqueIds([...(cue.sequenceIds ?? []), ...clean.sequenceIds])
    }
    return {
      page: { ...page, controls: page.controls.map((item) => item.id === cue.id ? updated : item) },
      refs: [{ type: 'cue' as const, id: cue.id }]
    }
  }

  const frame = target.kind === 'frame'
    ? page.annotations?.find((item) => item.id === target.frameId && item.type === 'frame')
    : undefined
  // A frame id was supplied but no such frame: ignore rather than dropping loose.
  if (target.kind === 'frame' && !frame) return { page, refs: [] }
  // By default all dragged items land in one cue. Holding Ctrl on Windows (the
  // guide's Command key) creates one cue per item, laid out in a grid.
  // An NDI Ambience drop is always one standalone button — never split.
  const units: LiveDropPayload[] = clean.ndiAmbience
    ? [clean]
    : split
      ? [
          ...clean.presetIds.map((id): LiveDropPayload => ({ presetIds: [id], sequenceIds: [], effectIds: [], presetNames: clean.presetNames })),
          ...clean.sequenceIds.map((id): LiveDropPayload => ({ presetIds: [], sequenceIds: [id], effectIds: [], sequenceNames: clean.sequenceNames })),
          ...clean.effectIds.map((id): LiveDropPayload => ({ presetIds: [], sequenceIds: [], effectIds: [id], effectNames: clean.effectNames }))
        ]
      : [clean]
  const controls: LiveControl[] = []
  const refs: PageObjectRef[] = []
  units.forEach((unit, index) => {
    const step = split ? index : 0
    const at = dropPosition(
      target.x + (step % 4) * LIVE_CUE_STEP.x,
      target.y + Math.floor(step / 4) * LIVE_CUE_STEP.y,
      frame, LIVE_CUE_SIZE.width, LIVE_CUE_SIZE.height
    )
    const control = newCueObject(makeId(), at.x, at.y, defaults, unit.ndiAmbience
      ? {
          name: 'NDI Ambience',
          type: 'push',
          presetIds: [],
          ndiAmbience: true,
          appearance: { color: NDI_AMBIENCE_BUTTON_COLOR, releaseOthers: false }
        }
      : {
          name: dropLabel(unit),
          presetIds: unit.presetIds,
          sequenceIds: unit.sequenceIds,
          effectIds: unit.effectIds,
          // A preset / sequence drop mints a cue, held inline in the
          // new button (Jake, 27 Nov 2026 — there is no project-wide
          // cue store any more): the cue carries exactly the dragged
          // items, named from them, fading over the global default
          // (1000ms — this pure function has no access to the show's
          // preferences, where the addCue factory would read it). The
          // button keeps its own lists too, as setControlCue leaves
          // them; the output reads the cue first. Effect-only drops
          // stay standalone — a cue cannot hold effects.
          ...(unit.presetIds.length || unit.sequenceIds.length
            ? { cue: { id: makeId(), name: dropLabel(unit), presetIds: unit.presetIds, sequenceIds: unit.sequenceIds, fixtureValues: {}, fadeMs: 1000 } as CueDef }
            : {}),
          // A dropped effect button carries LightKey's 0.5s fade in/out
          // (Jake, 26 Nov 2026 — his screenshot's inspector shows Fade In
          // 00:00.5 / Fade Out 00:00.5 on the dragged "Crazy Colors"
          // button). The inspector's Timing section edits it from there.
          // Note the fade itself is not yet wired to the effect layer —
          // no Live button's timing is (cueTransitionLevel is unused);
          // the press still gets the page/global base fade every other
          // toggle button gets. Parked, not faked.
          ...(unit.effectIds.length
            ? { timing: { fadeInMs: 500, fadeOutMs: 500, delayMs: 0, curve: 'linear' as const } }
            : {})
        })
    controls.push(control)
    refs.push({ type: 'cue' as const, id: control.id })
  })
  return {
    page: { ...page, controls: [...page.controls, ...controls] },
    refs
  }
}
