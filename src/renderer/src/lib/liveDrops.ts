import type { LiveControl, LiveDefaultStyles, LivePage } from '@shared/types'
import { LIVE_CUE_SIZE } from '@shared/liveObjectDefaults'
import { newCueObject, type PageObjectRef } from './livePageObjects'

/** Clipboard/DRAG format shared by the palette and all three drop targets. */
export const LIVE_DROP_MIME = 'application/x-openlights-live-drop'
/** Legacy single-preset type still written for interoperability. */
export const LEGACY_PRESET_MIME = 'application/x-openlights-preset'

const MAX_X = 740
const MAX_Y = 440
const snap = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value / 10) * 10))

/** What is being dragged: any mix of presets and sequences. */
export interface LiveDropPayload {
  presetIds: string[]
  sequenceIds: string[]
  /** Names used only to derive a sensible cue label. */
  presetNames?: Record<string, string>
  sequenceNames?: Record<string, string>
}

export type LiveDropTarget =
  | { kind: 'page'; x: number; y: number }
  | { kind: 'frame'; frameId: string; x: number; y: number }
  | { kind: 'cue'; cueId: string }

export interface LiveDropResult { page: LivePage; refs: PageObjectRef[] }

export const emptyDropPayload = (): LiveDropPayload => ({ presetIds: [], sequenceIds: [] })

const uniqueIds = (ids: string[] | undefined): string[] =>
  [...new Set((ids ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0))]

/** Drop payloads are normalised once so every target sees deduplicated ids. */
export function normalizeDropPayload(payload: LiveDropPayload): LiveDropPayload {
  return { ...payload, presetIds: uniqueIds(payload.presetIds), sequenceIds: uniqueIds(payload.sequenceIds) }
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
    const names = (field: unknown): Record<string, string> | undefined => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return undefined
      return Object.fromEntries(Object.entries(field as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      ))
    }
    return normalizeDropPayload({
      presetIds: value.presetIds as string[],
      sequenceIds: value.sequenceIds as string[],
      presetNames: names(value.presetNames),
      sequenceNames: names(value.sequenceNames)
    })
  } catch {
    return null
  }
}

/** A readable label for a new cue built from the dragged items. */
export function dropLabel(payload: LiveDropPayload): string {
  const { presetIds, sequenceIds, presetNames, sequenceNames } = normalizeDropPayload(payload)
  const total = presetIds.length + sequenceIds.length
  if (!total) return 'New cue'
  if (total === 1) {
    if (presetIds.length) return presetNames?.[presetIds[0]] || 'Preset'
    return sequenceNames?.[sequenceIds[0]] || 'Sequence'
  }
  const parts: string[] = []
  if (presetIds.length) parts.push(`${presetIds.length} preset${presetIds.length === 1 ? '' : 's'}`)
  if (sequenceIds.length) parts.push(`${sequenceIds.length} sequence${sequenceIds.length === 1 ? '' : 's'}`)
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
  let px = snap(x, MAX_X), py = snap(y, MAX_Y)
  if (frame) {
    const margin = 10
    const cx = Math.max(frame.x + margin, Math.min(frame.x + frame.width - margin, px + width / 2))
    const cy = Math.max(frame.y + margin, Math.min(frame.y + frame.height - margin, py + height / 2))
    px = Math.max(0, Math.min(MAX_X, Math.round(cx - width / 2)))
    py = Math.max(0, Math.min(MAX_Y, Math.round(cy - height / 2)))
  }
  return { x: px, y: py }
}

/** Sequence ids started by active cues, deduplicated across all pages. */
export function activeCueSequenceIds(
  pages: LivePage[] | undefined,
  active: Record<string, number>
): string[] {
  const ids = new Set<string>()
  for (const page of pages ?? []) for (const cue of page.controls) {
    if ((active[cue.id] ?? 0) <= 0) continue
    for (const id of cue.sequenceIds ?? []) ids.add(id)
  }
  return [...ids]
}

/**
 * Pure drop logic for presets/sequences onto a Live page. The three targets
 * either create a new cue (page/frame) or extend an existing one (cue button).
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
  if (!clean.presetIds.length && !clean.sequenceIds.length) return { page, refs: [] }

  if (target.kind === 'cue') {
    const cue = page.controls.find((item) => item.id === target.cueId)
    if (!cue) return { page, refs: [] }
    const updated = {
      ...cue,
      presetIds: uniqueIds([...cue.presetIds, ...clean.presetIds]),
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
  const units: LiveDropPayload[] = split
    ? [
        ...clean.presetIds.map((id): LiveDropPayload => ({ presetIds: [id], sequenceIds: [], presetNames: clean.presetNames })),
        ...clean.sequenceIds.map((id): LiveDropPayload => ({ presetIds: [], sequenceIds: [id], sequenceNames: clean.sequenceNames }))
      ]
    : [clean]
  const controls: LiveControl[] = []
  const refs: PageObjectRef[] = []
  units.forEach((unit, index) => {
    const step = split ? index : 0
    const at = dropPosition(
      target.x + (step % 4) * 170,
      target.y + Math.floor(step / 4) * 100,
      frame, LIVE_CUE_SIZE.width, LIVE_CUE_SIZE.height
    )
    const control = newCueObject(makeId(), at.x, at.y, defaults, {
      name: dropLabel(unit),
      presetIds: unit.presetIds,
      sequenceIds: unit.sequenceIds
    })
    controls.push(control)
    refs.push({ type: 'cue' as const, id: control.id })
  })
  return {
    page: { ...page, controls: [...page.controls, ...controls] },
    refs
  }
}
