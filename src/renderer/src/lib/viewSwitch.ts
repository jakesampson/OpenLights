import type { LivePage } from '@shared/types'

export type WorkspaceView = 'Design' | 'Live' | 'Edit'

/** Which side of the two-segment switch is highlighted for a view. */
export function viewSwitchSegments(view: WorkspaceView): { design: boolean; live: boolean } {
  return { design: view === 'Design', live: view !== 'Design' }
}

/** The Live side only exposes the page menu while the Live view is active. */
export function pageManagerVisible(view: WorkspaceView, open: boolean): boolean {
  return view === 'Live' && open
}

/** LightKey Live page kinds (Guide ch.11, p.176): a plain button page, or a page built around a cuelist. */
export type PageKind = 'page' | 'cuelist'

export type PageCommand =
  | { type: 'select'; id: string }
  | { type: 'add'; id: string; name: string; kind?: PageKind; fadeMs?: number; cueListId?: string; widgetId?: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'move'; id: string; direction: -1 | 1 }
  | { type: 'moveTo'; id: string; index: number }
  | { type: 'delete'; id: string }
  | { type: 'duplicate'; id: string; newId: string; name: string }
  | { type: 'setFade'; id: string; fadeMs: number }

export interface PageSelection {
  pages: LivePage[]
  activeId: string | null
}

const cleanName = (name: string) => name.trim() || 'Untitled page'

/**
 * A name that does not collide with an existing page ("New Page", "New Page 2", …).
 * LightKey's Manage Live Pages dialog names a fresh page "New Page"; a second
 * one needs a suffix so the menu can tell them apart.
 */
export function uniquePageName(pages: LivePage[], base: string): string {
  const taken = new Set(pages.map((page) => page.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

/**
 * Deep-clone a page under a new id, giving every control, cuelist widget and
 * annotation a fresh id and remapping `attachedTo` links to the clones, so a
 * duplicated page is fully independent of its source.
 */
export function duplicateLivePage(page: LivePage, newId: string, name: string): LivePage {
  const idMap = new Map<string, string>()
  const nextId = (old: string): string => {
    const existing = idMap.get(old)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    idMap.set(old, fresh)
    return fresh
  }
  for (const control of page.controls) nextId(control.id)
  for (const widget of page.cueListWidgets ?? []) nextId(widget.id)
  for (const annotation of page.annotations ?? []) nextId(annotation.id)
  const remap = (attachedTo: string | undefined): string | undefined =>
    attachedTo === undefined ? undefined : (idMap.get(attachedTo) ?? attachedTo)
  return {
    ...page,
    id: newId,
    name: cleanName(name),
    controls: page.controls.map((control) => ({ ...control, id: nextId(control.id), attachedTo: remap(control.attachedTo) })),
    cueListWidgets: page.cueListWidgets?.map((widget) => ({ ...widget, id: nextId(widget.id), attachedTo: remap(widget.attachedTo) })),
    annotations: page.annotations?.map((annotation) => ({ ...annotation, id: nextId(annotation.id), attachedTo: remap(annotation.attachedTo) }))
  }
}

/**
 * Apply a page-manager command without mutating the input. All operations are
 * pure so they can be unit-tested and routed through project history by the UI.
 */
export function applyPageCommand(state: PageSelection, command: PageCommand): PageSelection {
  const { pages, activeId } = state
  switch (command.type) {
    case 'select':
      return pages.some((p) => p.id === command.id) ? { pages, activeId: command.id } : state
    case 'add': {
      if (pages.some((p) => p.id === command.id)) return state
      const page: LivePage = {
        id: command.id,
        name: cleanName(command.name),
        kind: command.kind ?? 'page',
        controls: [],
        ...(command.fadeMs !== undefined ? { fadeMs: Math.max(0, Math.round(command.fadeMs)) } : {}),
        ...(command.kind === 'cuelist' && command.cueListId
          ? { cueListWidgets: [{ id: command.widgetId ?? crypto.randomUUID(), cueListId: command.cueListId, x: 20, y: 20 }] }
          : {})
      }
      return { pages: [...pages, page], activeId: page.id }
    }
    case 'rename': {
      const index = pages.findIndex((p) => p.id === command.id)
      if (index < 0) return state
      const next = [...pages]
      next[index] = { ...next[index], name: cleanName(command.name) }
      return { pages: next, activeId }
    }
    case 'move': {
      const index = pages.findIndex((p) => p.id === command.id)
      const target = index + command.direction
      if (index < 0 || target < 0 || target >= pages.length) return state
      const next = [...pages]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { pages: next, activeId }
    }
    case 'moveTo': {
      const index = pages.findIndex((p) => p.id === command.id)
      if (index < 0) return state
      const target = Math.max(0, Math.min(pages.length - 1, command.index))
      if (target === index) return state
      const next = [...pages]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return { pages: next, activeId }
    }
    case 'delete': {
      if (!pages.some((p) => p.id === command.id)) return state
      const next = pages.filter((p) => p.id !== command.id)
      return { pages: next, activeId: activeId === command.id ? (next[0]?.id ?? null) : activeId }
    }
    case 'duplicate': {
      const source = pages.find((p) => p.id === command.id)
      if (!source || pages.some((p) => p.id === command.newId)) return state
      const copy = duplicateLivePage(source, command.newId, command.name)
      const index = pages.indexOf(source)
      const next = [...pages]
      next.splice(index + 1, 0, copy)
      return { pages: next, activeId: copy.id }
    }
    case 'setFade': {
      const index = pages.findIndex((p) => p.id === command.id)
      if (index < 0) return state
      const next = [...pages]
      next[index] = { ...next[index], fadeMs: Math.max(0, Math.round(command.fadeMs)) }
      return { pages: next, activeId }
    }
  }
}
