import { useEffect, useState } from 'react'
import type { LivePage } from '@shared/types'
import { useShowStore } from '../stores/showStore'
import {
  applyPageCommand,
  pageManagerVisible,
  viewSwitchSegments,
  type PageCommand,
  type WorkspaceView
} from '../lib/viewSwitch'

interface Props {
  view: WorkspaceView
  onView: (view: WorkspaceView) => void
}

export function ViewSwitch({ view, onView }: Props) {
  const { show, activeLivePageId, setLivePages, selectLivePage, locked } = useShowStore()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const pages = show?.livePages ?? []
  const segments = viewSwitchSegments(view)
  const managerVisible = pageManagerVisible(view, open)

  useEffect(() => {
    if (view !== 'Live') setOpen(false)
  }, [view])

  const dispatch = (command: PageCommand) => {
    const result = applyPageCommand({ pages, activeId: activeLivePageId }, command)
    if (result.pages !== pages) setLivePages(result.pages)
    if (result.activeId !== activeLivePageId) selectLivePage(result.activeId)
  }

  const addPage = () => {
    if (!newName.trim()) return
    dispatch({ type: 'add', id: crypto.randomUUID(), name: newName })
    setNewName('')
  }

  return (
    <div className="view-switch" data-view={view}>
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
        aria-expanded={managerVisible}
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
        {view === 'Live' && <span className="view-switch-caret" aria-hidden="true">▾</span>}
      </button>

      {managerVisible && (
        <div className="view-switch-pages" role="dialog" aria-label="Live page manager">
          <div className="view-switch-pages-title">Live pages</div>
          <div className="view-switch-pages-list">
            {pages.map((page: LivePage, index) => (
              <div key={page.id} className="view-switch-page-row">
                <button
                  type="button"
                  className={`view-switch-page-name ${page.id === activeLivePageId ? 'on' : ''}`}
                  onClick={() => {
                    dispatch({ type: 'select', id: page.id })
                    setOpen(false)
                  }}
                >
                  {page.name}
                </button>
                <input
                  aria-label={`Rename ${page.name}`}
                  defaultValue={page.name}
                  disabled={locked}
                  onBlur={(event) => dispatch({ type: 'rename', id: page.id, name: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      dispatch({ type: 'rename', id: page.id, name: event.currentTarget.value })
                      event.currentTarget.blur()
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label={`Move ${page.name} up`}
                  disabled={locked || index === 0}
                  onClick={() => dispatch({ type: 'move', id: page.id, direction: -1 })}
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${page.name} down`}
                  disabled={locked || index === pages.length - 1}
                  onClick={() => dispatch({ type: 'move', id: page.id, direction: 1 })}
                >
                  ▼
                </button>
              </div>
            ))}
            {!pages.length && <div className="view-switch-pages-empty">No pages yet</div>}
          </div>
          {!locked && (
            <div className="view-switch-page-add">
              <input
                aria-label="New Live page name"
                placeholder="New page name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addPage()
                }}
              />
              <button type="button" disabled={!newName.trim()} onClick={addPage}>
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
