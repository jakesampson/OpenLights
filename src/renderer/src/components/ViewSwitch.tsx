import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LivePage } from '@shared/types'
import { useShowStore } from '../stores/showStore'
import {
  applyPageCommand,
  pageManagerVisible,
  viewSwitchSegments,
  type PageCommand,
  type WorkspaceView
} from '../lib/viewSwitch'
import { ManageLivePages, pageKindIcon } from './ManageLivePages'

interface Props {
  view: WorkspaceView
  onView: (view: WorkspaceView) => void
}

/**
 * Design / Live switch, the LightKey way (Jake's 18 Nov screenshots
 * 8.54.48 / 8.57.25): "Design   Live ⌄" sits top-centre of the window — in
 * the header, centred on the whole window, not on the divider between the
 * preview and the bottom panel. Design is plain text; Live is a light pill
 * with a chevron. Clicking Live from Design switches to Live; clicking it
 * while already in Live opens the page menu: every Live page with a
 * checkmark on the current one, a separator, then "Manage Live Pages…".
 * Selecting a page switches to it. The manager itself is the separate
 * ManageLivePages modal (Guide ch.11, p.176).
 */
export function ViewSwitch({ view, onView }: Props) {
  const { show, cueLists, activeLivePageId, setLivePages, selectLivePage, locked } = useShowStore()
  const [open, setOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pages = show?.livePages ?? []
  const segments = viewSwitchSegments(view)
  const menuVisible = pageManagerVisible(view, open)

  useEffect(() => {
    if (view !== 'Live') setOpen(false)
  }, [view])

  useEffect(() => {
    if (!menuVisible) return
    const close = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuVisible])

  const dispatch = (command: PageCommand) => {
    const result = applyPageCommand({ pages, activeId: activeLivePageId }, command)
    if (result.pages !== pages) setLivePages(result.pages)
    if (result.activeId !== activeLivePageId) selectLivePage(result.activeId)
  }

  return (
    <div className="view-switch" data-view={view} ref={wrapRef}>
      <button
        type="button"
        aria-pressed={segments.design}
        className={`view-switch-segment ${segments.design ? 'on' : ''}`}
        onClick={() => onView('Design')}
      >
        Design
      </button>
      <button
        type="button"
        aria-pressed={segments.live}
        aria-expanded={menuVisible}
        aria-haspopup={view === 'Live' ? 'menu' : undefined}
        aria-label={view === 'Live' ? 'Live pages' : 'Live'}
        className={`view-switch-segment ${segments.live ? 'on' : ''}`}
        onClick={() => {
          if (view !== 'Live') {
            onView('Live')
            return
          }
          setOpen((value) => !value)
        }}
      >
        Live
        {view === 'Live' && <span className="view-switch-caret" aria-hidden="true">⌄</span>}
      </button>

      {menuVisible && (
        <div className="view-switch-menu" role="menu" aria-label="Live pages">
          {pages.map((page: LivePage) => (
            <button
              key={page.id}
              type="button"
              role="menuitem"
              className="view-switch-menu-item"
              onClick={() => {
                dispatch({ type: 'select', id: page.id })
                setOpen(false)
              }}
            >
              <span className="view-switch-menu-check" aria-hidden="true">{page.id === activeLivePageId ? '✓' : ''}</span>
              <span aria-hidden="true">{pageKindIcon(page)}</span>
              <span className="min-w-0 flex-1 truncate">{page.name}</span>
            </button>
          ))}
          {!pages.length && <div className="view-switch-pages-empty">No pages yet</div>}
          <div className="view-switch-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="view-switch-menu-item"
            onClick={() => {
              setOpen(false)
              setManagerOpen(true)
            }}
          >
            <span className="view-switch-menu-check" aria-hidden="true" />
            <span>Manage Live Pages…</span>
          </button>
        </div>
      )}

      {/* Portalled to the body: the switch itself is centred with a CSS
          transform, and a transformed ancestor would trap a fixed-position
          modal inside the pill's box instead of the viewport. */}
      {managerOpen && createPortal(
        <ManageLivePages
          pages={pages}
          activeId={activeLivePageId}
          cueLists={cueLists}
          defaultFadeMs={show?.preferences?.pageFadeMs ?? 500}
          locked={locked}
          onSelect={(id) => selectLivePage(id)}
          onCommand={dispatch}
          onClose={() => setManagerOpen(false)}
        />,
        document.body
      )}
    </div>
  )
}
