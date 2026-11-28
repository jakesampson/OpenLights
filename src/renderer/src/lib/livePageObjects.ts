import type { LiveControl, LiveDefaultStyles, LiveObjectKind, LiveObjectStyle, LivePage } from '@shared/types'
import {
  clampLiveSize, clampCuelistSize, snapCanvasValue,
  LIVE_CUE_SIZE, LIVE_FRAME_SIZE, LIVE_LABEL_SIZE, LIVE_LIST_SIZE, styleFor
} from '@shared/liveObjectDefaults'

export type PageObjectType = 'cue' | 'list' | 'annotation'
export interface PageObjectRef { type: PageObjectType; id: string }
export interface Rect { x: number; y: number; width: number; height: number }

/** Positions never go below 0; there is no ceiling — the canvas grows
 *  to fit instead of clamping (Jake, 25 Nov 2026: infinitely
 *  scrollable, expanding on demand). */
const clamp = (value: number) => Math.max(0, Math.round(value))

interface Positioned extends PageObjectRef { x: number; y: number; width: number; height: number }

/** Factory helpers: every new object receives the built-in + page default style. */
export function newCueObject(
  id: string, x: number, y: number,
  defaults?: LiveDefaultStyles,
  extra?: Partial<LiveControl>
): LiveControl {
  return { id, name: 'New cue', type: 'push', presetIds: [], x, y, style: styleFor('cue', undefined, defaults), ...extra }
}

export function newWidgetObject(
  id: string, cueListId: string, x: number, y: number, defaults?: LiveDefaultStyles
): NonNullable<LivePage['cueListWidgets']>[number] {
  return { id, cueListId, x, y, style: styleFor('list', undefined, defaults) }
}

export function newAnnotationObject(
  id: string, type: 'label' | 'frame', x: number, y: number, defaults?: LiveDefaultStyles
): NonNullable<LivePage['annotations']>[number] {
  const size = type === 'frame' ? LIVE_FRAME_SIZE : LIVE_LABEL_SIZE
  return {
    id, type, text: type === 'label' ? 'New label' : 'New frame', x, y,
    width: size.width, height: size.height, style: styleFor(type, undefined, defaults)
  }
}

/** Apply a partial style patch to one object. Immutable. */
export function setObjectStyle(page: LivePage, ref: PageObjectRef, patch: Partial<LiveObjectStyle>): LivePage {
  const apply = (style: LiveObjectStyle | undefined): LiveObjectStyle => ({ ...style, ...patch })
  const kind: LiveObjectKind = ref.type === 'annotation'
    ? (page.annotations?.find((a) => a.id === ref.id)?.type ?? 'label')
    : ref.type === 'list' ? 'list' : 'cue'
  const withDefaults = (style: LiveObjectStyle | undefined) => styleFor(kind, apply(style), page.defaultStyles)
  return {
    ...page,
    controls: page.controls.map((c) => ref.type === 'cue' && c.id === ref.id ? { ...c, style: withDefaults(c.style) } : c),
    cueListWidgets: page.cueListWidgets?.map((w) => ref.type === 'list' && w.id === ref.id ? { ...w, style: withDefaults(w.style) } : w),
    annotations: page.annotations?.map((a) => ref.type === 'annotation' && a.id === ref.id ? { ...a, style: withDefaults(a.style) } : a)
  }
}

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

/** Resize one object, clamping and snapping both dimensions. Immutable.
 *  Cuelists use the uncapped clamp (clampCuelistSize) — LightKey's
 *  cuelist fills the Live view, so it must be able to grow past the
 *  900px ceiling that keeps cue buttons and labels sane (Jake,
 *  28 Nov 2026). */
export function resizeObject(page: LivePage, ref: PageObjectRef, width: number, height: number): LivePage {
  const clamp = ref.type === 'list' ? clampCuelistSize : clampLiveSize
  const w = clamp(width), h = clamp(height)
  return {
    ...page,
    controls: page.controls.map((c) => ref.type === 'cue' && c.id === ref.id ? { ...c, width: w, height: h } : c),
    cueListWidgets: page.cueListWidgets?.map((widget) => ref.type === 'list' && widget.id === ref.id ? { ...widget, width: w, height: h } : widget),
    annotations: page.annotations?.map((a) => ref.type === 'annotation' && a.id === ref.id ? { ...a, width: w, height: h } : a)
  }
}

/**
 * Resize anchored at any corner/edge (Jake, 27 Nov 2026 — LightKey's
 * 8-handle resize): the top/left handles move the object as they
 * shrink it, so the opposite edge stays put. Positions snap to the
 * 10px grid and never go below 0, like a drag.
 */
export function resizeObjectTo(page: LivePage, ref: PageObjectRef, x: number, y: number, width: number, height: number): LivePage {
  const clamp = ref.type === 'list' ? clampCuelistSize : clampLiveSize
  const w = clamp(width), h = clamp(height)
  const left = Math.max(0, snapCanvasValue(x)), top = Math.max(0, snapCanvasValue(y))
  return {
    ...page,
    controls: page.controls.map((c) => ref.type === 'cue' && c.id === ref.id ? { ...c, x: left, y: top, width: w, height: h } : c),
    cueListWidgets: page.cueListWidgets?.map((widget) => ref.type === 'list' && widget.id === ref.id ? { ...widget, x: left, y: top, width: w, height: h } : widget),
    annotations: page.annotations?.map((a) => ref.type === 'annotation' && a.id === ref.id ? { ...a, x: left, y: top, width: w, height: h } : a)
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

export const refKey = (ref: PageObjectRef): string => `${ref.type}:${ref.id}`

/** Find an object on the page by id, across all collections. */
export function findObject(page: LivePage, id: string): PageObjectRef | null {
  if (page.controls.some((c) => c.id === id)) return { type: 'cue', id }
  if ((page.cueListWidgets ?? []).some((w) => w.id === id)) return { type: 'list', id }
  if ((page.annotations ?? []).some((a) => a.id === id)) return { type: 'annotation', id }
  return null
}

export function objectLabel(page: LivePage, ref: PageObjectRef): string {
  if (ref.type === 'cue') return page.controls.find((c) => c.id === ref.id)?.name ?? 'Cue'
  if (ref.type === 'list') {
    const widget = page.cueListWidgets?.find((w) => w.id === ref.id)
    return `Cue list ${widget?.id.slice(0, 4) ?? ''}`.trim()
  }
  const annotation = page.annotations?.find((a) => a.id === ref.id)
  return annotation ? annotation.text || (annotation.type === 'frame' ? 'Frame' : 'Label') : 'Object'
}

/** Objects directly attached to the given object. */
function directAttached(page: LivePage, parent: PageObjectRef): PageObjectRef[] {
  return [
    ...page.controls.filter((c) => c.attachedTo === parent.id).map((c): PageObjectRef => ({ type: 'cue', id: c.id })),
    ...(page.cueListWidgets ?? []).filter((w) => w.attachedTo === parent.id).map((w): PageObjectRef => ({ type: 'list', id: w.id })),
    ...(page.annotations ?? []).filter((a) => a.attachedTo === parent.id).map((a): PageObjectRef => ({ type: 'annotation', id: a.id }))
  ]
}

/** A set of refs plus every object transitively attached to them (cycle-safe). */
export function withAttached(page: LivePage, refs: PageObjectRef[]): PageObjectRef[] {
  const seen = new Set(refs.map(refKey))
  const queue = [...refs]
  while (queue.length) {
    const current = queue.shift()!
    for (const child of directAttached(page, current)) {
      const key = refKey(child)
      if (!seen.has(key)) { seen.add(key); queue.push(child) }
    }
  }
  return [
    ...page.controls.filter((c) => seen.has(refKey({ type: 'cue', id: c.id }))).map((c): PageObjectRef => ({ type: 'cue', id: c.id })),
    ...(page.cueListWidgets ?? []).filter((w) => seen.has(refKey({ type: 'list', id: w.id }))).map((w): PageObjectRef => ({ type: 'list', id: w.id })),
    ...(page.annotations ?? []).filter((a) => seen.has(refKey({ type: 'annotation', id: a.id }))).map((a): PageObjectRef => ({ type: 'annotation', id: a.id }))
  ]
}

/** Attach an object to another object (or pass null to detach). Immutable; rejects self/cycles. */
export function setAttachment(page: LivePage, ref: PageObjectRef, targetId: string | null): LivePage {
  if (!findObject(page, ref.id)) return page
  const apply = (attachedTo: string | undefined) => ({
    ...page,
    controls: page.controls.map((c) => ref.type === 'cue' && c.id === ref.id ? { ...c, attachedTo } : c),
    cueListWidgets: page.cueListWidgets?.map((w) => ref.type === 'list' && w.id === ref.id ? { ...w, attachedTo } : w),
    annotations: page.annotations?.map((a) => ref.type === 'annotation' && a.id === ref.id ? { ...a, attachedTo } : a)
  })
  if (targetId === null) return apply(undefined)
  if (targetId === ref.id || !findObject(page, targetId)) return page
  // If the target is already a descendant, attaching to it would form a cycle.
  if (withAttached(page, [ref]).some((item) => item.id === targetId)) return page
  return apply(targetId)
}

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

/** Move selected objects (and anything attached to them) by a delta, clamped to the page. Immutable. */
export function moveObjects(page: LivePage, refs: PageObjectRef[], dx: number, dy: number): LivePage {
  const ids = indexRefs(withAttached(page, refs))
  const moved = (x: number, y: number) => ({ x: clamp(x + dx), y: clamp(y + dy) })
  return {
    ...page,
    controls: page.controls.map((c) => ids.cue.has(c.id) ? { ...c, ...moved(c.x ?? 0, c.y ?? 0) } : c),
    cueListWidgets: page.cueListWidgets?.map((w) => ids.list.has(w.id) ? { ...w, ...moved(w.x, w.y) } : w),
    annotations: page.annotations?.map((a) => ids.annotation.has(a.id) ? { ...a, ...moved(a.x, a.y) } : a)
  }
}

/** Remove selected objects from the page. Immutable; survivors lose links to deleted objects. */
export function deleteObjects(page: LivePage, refs: PageObjectRef[]): LivePage {
  const ids = indexRefs(refs)
  const deleted = new Set(refs.map((ref) => ref.id))
  const clear = (attachedTo: string | undefined) => attachedTo && deleted.has(attachedTo) ? undefined : attachedTo
  return {
    ...page,
    controls: page.controls.filter((c) => !ids.cue.has(c.id)).map((c) => ({ ...c, attachedTo: clear(c.attachedTo) })),
    cueListWidgets: page.cueListWidgets?.filter((w) => !ids.list.has(w.id)).map((w) => ({ ...w, attachedTo: clear(w.attachedTo) })),
    annotations: page.annotations?.filter((a) => !ids.annotation.has(a.id)).map((a) => ({ ...a, attachedTo: clear(a.attachedTo) }))
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
  // Allocate all new ids first so attachment links can be remapped among the copies.
  const idMap = new Map<string, string>()
  const controls = clipboard.controls.map((c) => {
    const id = makeId(); idMap.set(c.id, id); refs.push({ type: 'cue', id })
    // A copied button carries a COPY of its cue, never the original's
    // id (Jake, 27 Nov 2026 — inline cues: two holders must never
    // share one cue id, or an edit to one would be ambiguous). The
    // copy keeps the cue's contents exactly; only the id is fresh.
    return c.cue ? { ...c, id, cue: { ...structuredClone(c.cue), id: makeId() } } : { ...c, id }
  })
  const widgets = clipboard.widgets.map((w) => {
    const id = makeId(); idMap.set(w.id, id); refs.push({ type: 'list', id })
    return { ...w, id }
  })
  const annotations = clipboard.annotations.map((a) => {
    const id = makeId(); idMap.set(a.id, id); refs.push({ type: 'annotation', id })
    return { ...a, id }
  })
  const remap = (attachedTo: string | undefined): string | undefined =>
    attachedTo === undefined ? undefined : idMap.get(attachedTo) ?? attachedTo
  return {
    controls: controls.map((c) => ({ ...c, attachedTo: remap(c.attachedTo), x: clamp((c.x ?? 0) + dx), y: clamp((c.y ?? 0) + dy) })),
    widgets: widgets.map((w) => ({ ...w, attachedTo: remap(w.attachedTo), x: clamp(w.x + dx), y: clamp(w.y + dy) })),
    annotations: annotations.map((a) => ({ ...a, attachedTo: remap(a.attachedTo), x: clamp(a.x + dx), y: clamp(a.y + dy) })),
    refs
  }
}

/** Paste clipboard objects onto a page with fresh ids and a small offset. */
export function pasteObjects(page: LivePage, clipboard: PageClipboard, makeId: () => string, dx = 20, dy = 20): Pasted {
  const pasted = withNewIds(clipboard, makeId, dx, dy)
  // One cuelist widget per page (LightKey: a page can't contain more than
  // one cuelist — Jake, 27 Nov 2026, cuelist as a canvas widget): pasting
  // or duplicating onto a page that already has one drops the extra
  // widgets; when the page has none, the first pasted widget wins.
  // withNewIds pushes refs in clipboard order — controls, then widgets,
  // then annotations — so the dropped widgets' refs are the widget refs
  // past the kept ones (keyed by position, not id: makeId need not be
  // unique in tests).
  const existing = page.cueListWidgets ?? []
  const widgets = existing.length ? [] : pasted.widgets.slice(0, 1)
  const refs = [
    ...pasted.refs.slice(0, pasted.controls.length),
    ...pasted.refs.slice(pasted.controls.length, pasted.controls.length + widgets.length),
    ...pasted.refs.slice(pasted.controls.length + pasted.widgets.length)
  ]
  return {
    page: {
      ...page,
      controls: [...page.controls, ...pasted.controls],
      cueListWidgets: [...existing, ...widgets],
      annotations: [...(page.annotations ?? []), ...pasted.annotations]
    },
    refs
  }
}

/** Duplicate selected objects in place with fresh ids; returns the new refs. */
export function duplicateObjects(page: LivePage, refs: PageObjectRef[], makeId: () => string): Pasted {
  return pasteObjects(page, copyObjects(page, refs), makeId)
}

export const emptyClipboard = (): PageClipboard => ({ controls: [], widgets: [], annotations: [] })
export const isClipboardEmpty = (clipboard: PageClipboard | null): boolean =>
  !clipboard || !(clipboard.controls.length || clipboard.widgets.length || clipboard.annotations.length)
