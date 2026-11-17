import type { LivePage } from '@shared/types'

export type WorkspaceView = 'Design' | 'Live' | 'Edit'

/** Which side of the two-segment switch is highlighted for a view. */
export function viewSwitchSegments(view: WorkspaceView): { design: boolean; live: boolean } {
  return { design: view === 'Design', live: view !== 'Design' }
}

/** The Live side only exposes the page dropdown while the Live view is active. */
export function pageManagerVisible(view: WorkspaceView, open: boolean): boolean {
  return view === 'Live' && open
}

export type PageCommand =
  | { type: 'select'; id: string }
  | { type: 'add'; id: string; name: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'move'; id: string; direction: -1 | 1 }

export interface PageSelection {
  pages: LivePage[]
  activeId: string | null
}

const cleanName = (name: string) => name.trim() || 'Untitled page'

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
      const page: LivePage = { id: command.id, name: cleanName(command.name), controls: [] }
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
  }
}
