import type { LiveControl, LivePage } from '@shared/types'
import { clampLiveSize, LIVE_CUE_SIZE, LIVE_LIST_SIZE } from '@shared/liveObjectDefaults'

export type PageObjectType = 'cue' | 'list' | 'annotation'
export interface PageObjectRef { type: PageObjectType; id: string }
export interface Rect { x: number; y: number; width: number; height: number }

const MAX_X = 740
const MAX_Y = 440
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)))

interface Positioned extends PageObjectRef { x: number; y: number; width: number; height: number }

/** All selectable objects on a page with their current bounds. */
export function positionedObjects(page: LivePage): Positioned[] {
  return [
    ...page.controls.map((c) => ({ type: 'cue' as const, id: c.id, x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? LIVE_CUE_SIZE.width, height: c.height ?? LIVE_CUE_SIZE.height })),
    ...(page.cueListWidgets ?? []).map((w) => ({ type: 'list' as const, id: w.id, x: w.x, y: w.y, width: w.width ?? LIVE_LIST_SIZE.width, height: w.height ?? LIVE_LIST_SIZE.height })),
    ...(page.annotations ?? []).map((a) => ({ type: 'annotation' as const, id: a.id, x: a.x, y: a.y, width: a.width, height: a.height }))
  ]
}

/** Current size of one object (used to seed a resize drag). */
export function objectSize(page: LivePage, ref: PageObjectRef): { width: number; height: number } {
  const object = positionedObjects(page).find((o) => o.type === ref.type && o.id === ref.id)
  return object ? { width: object.width, height: object.height } : { ...LIVE_CUE_SIZE }
}

/** Resize one object, clamping and snapping both dimensions. Immutable. */
export function resizeObject(page: LivePage, ref: PageObjectRef, width: number, height: number): LivePage {
  const w = clampLiveSize(width), h = clampLiveSize(height)
  return {
    ...page,
    controls: page.controls.map((c) => ref.type === 'cue' && c.id === ref.id ? { ...c, width: w, height: h } : c),
    cueListWidgets: page.cueListWidgets?.map((widget) => ref.type === 'list' && widget.id === ref.id ? { ...widget, width: w, height: h } : widget),
    annotations: page.annotations?.map((a) => ref.type === 'annotation' && a.id === ref.id ? { ...a, width: w, height: h } : a)
  }
}

/** Rename a cue or label/frame inline (widgets take their name from the cue list). */
export function renameObject(page: LivePage, ref: PageObjectRef, name: string): LivePage {
  const value = name.trim()
  return {
    ...page,
    controls: page.controls.map((c) => ref.type === 'cue' && c.id === ref.id ? { ...c, name: value || 'Untitled cue' } : c),
    annotations: page.annotations?.map((a) => ref.type === 'annotation' && a.id === ref.id ? { ...a, text: value || 'Label' } : a)
  }
}

const indexRefs = (refs: PageObjectRef[]) => ({
  cue: new Set(refs.filter((r) => r.type === 'cue').map((r) => r.id)),
  list: new Set(refs.filter((r) => r.type === 'list').map((r) => r.id)),
  annotation: new Set(refs.filter((r) => r.type === 'annotation').map((r) => r.id))
})

/** Objects whose bounds intersect the marquee rectangle. */
export function objectsInRect(page: LivePage, rect: Rect): PageObjectRef[] {
  const left = Math.min(rect.x, rect.x + rect.width)
  const top = Math.min(rect.y, rect.y + rect.height)
  const right = Math.max(rect.x, rect.x + rect.width)
  const bottom = Math.max(rect.y, rect.y + rect.height)
  return positionedObjects(page)
    .filter((o) => o.x < right && o.x + o.width > left && o.y < bottom && o.y + o.height > top)
    .map(({ type, id }) => ({ type, id }))
}

/** Move selected objects by a delta, clamped to the page. Immutable. */
export function moveObjects(page: LivePage, refs: PageObjectRef[], dx: number, dy: number): LivePage {
  const ids = indexRefs(refs)
  const moved = (x: number, y: number) => ({ x: clamp(x + dx, MAX_X), y: clamp(y + dy, MAX_Y) })
  return {
    ...page,
    controls: page.controls.map((c) => ids.cue.has(c.id) ? { ...c, ...moved(c.x ?? 0, c.y ?? 0) } : c),
    cueListWidgets: page.cueListWidgets?.map((w) => ids.list.has(w.id) ? { ...w, ...moved(w.x, w.y) } : w),
    annotations: page.annotations?.map((a) => ids.annotation.has(a.id) ? { ...a, ...moved(a.x, a.y) } : a)
  }
}

/** Remove selected objects from the page. Immutable. */
export function deleteObjects(page: LivePage, refs: PageObjectRef[]): LivePage {
  const ids = indexRefs(refs)
  return {
    ...page,
    controls: page.controls.filter((c) => !ids.cue.has(c.id)),
    cueListWidgets: page.cueListWidgets?.filter((w) => !ids.list.has(w.id)),
    annotations: page.annotations?.filter((a) => !ids.annotation.has(a.id))
  }
}

export interface PageClipboard {
  controls: LiveControl[]
  widgets: NonNullable<LivePage['cueListWidgets']>
  annotations: NonNullable<LivePage['annotations']>
}

/** Deep-copy selected objects into a portable clipboard. */
export function copyObjects(page: LivePage, refs: PageObjectRef[]): PageClipboard {
  const ids = indexRefs(refs)
  return {
    controls: page.controls.filter((c) => ids.cue.has(c.id)).map((c) => structuredClone(c)),
    widgets: (page.cueListWidgets ?? []).filter((w) => ids.list.has(w.id)).map((w) => structuredClone(w)),
    annotations: (page.annotations ?? []).filter((a) => ids.annotation.has(a.id)).map((a) => structuredClone(a))
  }
}

interface Pasted { page: LivePage; refs: PageObjectRef[] }

const withNewIds = (
  clipboard: PageClipboard,
  makeId: () => string,
  dx: number,
  dy: number
): { controls: LiveControl[]; widgets: NonNullable<LivePage['cueListWidgets']>; annotations: NonNullable<LivePage['annotations']>; refs: PageObjectRef[] } => {
  const refs: PageObjectRef[] = []
  const controls = clipboard.controls.map((c) => {
    const id = makeId(); refs.push({ type: 'cue', id })
    return { ...c, id, x: clamp((c.x ?? 0) + dx, MAX_X), y: clamp((c.y ?? 0) + dy, MAX_Y) }
  })
  const widgets = clipboard.widgets.map((w) => {
    const id = makeId(); refs.push({ type: 'list', id })
    return { ...w, id, x: clamp(w.x + dx, MAX_X), y: clamp(w.y + dy, MAX_Y) }
  })
  const annotations = clipboard.annotations.map((a) => {
    const id = makeId(); refs.push({ type: 'annotation', id })
    return { ...a, id, x: clamp(a.x + dx, MAX_X), y: clamp(a.y + dy, MAX_Y) }
  })
  return { controls, widgets, annotations, refs }
}

/** Paste clipboard objects onto a page with fresh ids and a small offset. */
export function pasteObjects(page: LivePage, clipboard: PageClipboard, makeId: () => string, dx = 20, dy = 20): Pasted {
  const pasted = withNewIds(clipboard, makeId, dx, dy)
  return {
    page: {
      ...page,
      controls: [...page.controls, ...pasted.controls],
      cueListWidgets: [...(page.cueListWidgets ?? []), ...pasted.widgets],
      annotations: [...(page.annotations ?? []), ...pasted.annotations]
    },
    refs: pasted.refs
  }
}

/** Duplicate selected objects in place with fresh ids; returns the new refs. */
export function duplicateObjects(page: LivePage, refs: PageObjectRef[], makeId: () => string): Pasted {
  return pasteObjects(page, copyObjects(page, refs), makeId)
}

export const emptyClipboard = (): PageClipboard => ({ controls: [], widgets: [], annotations: [] })
export const isClipboardEmpty = (clipboard: PageClipboard | null): boolean =>
  !clipboard || !(clipboard.controls.length || clipboard.widgets.length || clipboard.annotations.length)
