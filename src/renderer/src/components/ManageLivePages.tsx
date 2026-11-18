import { useState } from 'react'
import type { CueListDef, LivePage } from '@shared/types'
import { formatTimingMs, parseTimingMs } from '../lib/liveTiming'
import { uniquePageName, type PageCommand } from '../lib/viewSwitch'

interface Props {
  pages: LivePage[]
  activeId: string | null
  cueLists: CueListDef[]
  defaultFadeMs: number
  locked: boolean
  onSelect: (id: string | null) => void
  onCommand: (command: PageCommand) => void
  onClose: () => void
}

/** Menu icon for a page, the LightKey way: a grid for a button page, a list for a cuelist page. */
export const pageKindIcon = (page: LivePage): string => (page.kind === 'cuelist' ? '☰' : '▦')

/**
 * Manage Live Pages (Guide ch.11, p.176; Jake's 18 Nov screenshot 8.56.01):
 * a modal with "Live Pages" and "Fade Time" columns, one row per page with
 * its icon, name and fade time (mm:ss.t) with up/down steppers, the current
 * page highlighted blue, "+" to add an Empty Page or a Cuelist, "−" to delete
 * the selected page, "···" for Rename / Duplicate (the two actions the guide
 * puts on that menu), and a blue Done button. Rows drag to reorder (the
 * guide: "To reorder the pages: Drag the rows in the list up or down").
 * Clicking a row selects it in the dialog and switches to that page, so the
 * highlighted row is always the current page. Rename is inline: click the
 * name, type, press Return. Deleting asks first, as LightKey does.
 */
export function ManageLivePages({ pages, activeId, cueLists, defaultFadeMs, locked, onSelect, onCommand, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(activeId ?? pages[0]?.id ?? null)
  const [addOpen, setAddOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [fadeEditingId, setFadeEditingId] = useState<string | null>(null)
  const [fadeText, setFadeText] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const selected = pages.find((page) => page.id === selectedId) ?? null
  const effectiveFade = (page: LivePage) => page.fadeMs ?? defaultFadeMs

  const selectRow = (id: string) => {
    setSelectedId(id)
    onSelect(id)
  }

  const addPage = (kind: 'page' | 'cuelist') => {
    const base = kind === 'cuelist' ? 'Cuelist' : 'New Page'
    onCommand({
      type: 'add',
      id: crypto.randomUUID(),
      name: uniquePageName(pages, base),
      kind,
      fadeMs: defaultFadeMs,
      ...(kind === 'cuelist' && cueLists[0] ? { cueListId: cueLists[0].id, widgetId: crypto.randomUUID() } : {})
    })
    setAddOpen(false)
  }

  const deleteSelected = () => {
    if (!selected || locked) return
    if (!window.confirm(`Delete page "${selected.name}"?`)) return
    const index = pages.findIndex((page) => page.id === selected.id)
    const next = pages.filter((page) => page.id !== selected.id)
    onCommand({ type: 'delete', id: selected.id })
    const fallback = next[Math.min(index, next.length - 1)] ?? null
    setSelectedId(fallback?.id ?? null)
    if (fallback) onSelect(fallback.id)
    else onSelect(null)
  }

  const commitRename = () => {
    if (renamingId && renameText.trim()) onCommand({ type: 'rename', id: renamingId, name: renameText })
    setRenamingId(null)
  }

  const commitFade = () => {
    if (fadeEditingId) {
      const parsed = parseTimingMs(fadeText)
      if (parsed !== null) onCommand({ type: 'setFade', id: fadeEditingId, fadeMs: parsed })
    }
    setFadeEditingId(null)
  }

  const stepFade = (page: LivePage, deltaMs: number) => {
    onCommand({ type: 'setFade', id: page.id, fadeMs: Math.max(0, effectiveFade(page) + deltaMs) })
  }

  const duplicateSelected = () => {
    if (!selected || locked) return
    onCommand({
      type: 'duplicate',
      id: selected.id,
      newId: crypto.randomUUID(),
      name: uniquePageName(pages, `${selected.name} copy`)
    })
    setMoreOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={(event) => {
        if (event.key === 'Delete' && selectedId && !renamingId && !fadeEditingId) deleteSelected()
        else if (event.key === 'Escape') onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Manage Live Pages"
        className="w-full max-w-xl rounded-lg border border-line bg-panel p-4 shadow-2xl"
      >
        <div className="flex items-center border-b border-line pb-2 text-sm font-semibold">
          <span className="flex-1">Live Pages</span>
          <span className="w-32 text-right">Fade Time</span>
        </div>
        <div className="max-h-80 min-h-24 overflow-y-auto py-1" role="listbox" aria-label="Live pages">
          {pages.map((page, index) => {
            const isSelected = page.id === selectedId
            return (
              <div
                key={page.id}
                role="option"
                aria-selected={isSelected}
                draggable={!locked}
                onDragStart={() => setDragId(page.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => { if (dragId) event.preventDefault() }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragId && dragId !== page.id) onCommand({ type: 'moveTo', id: dragId, index })
                  setDragId(null)
                }}
                onClick={() => selectRow(page.id)}
                className={`live-pages-row flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm ${isSelected ? 'on' : ''} ${dragId === page.id ? 'opacity-50' : ''}`}
              >
                <span aria-hidden="true">{pageKindIcon(page)}</span>
                {renamingId === page.id ? (
                  <input
                    aria-label={`Rename ${page.name}`}
                    autoFocus
                    value={renameText}
                    onChange={(event) => setRenameText(event.target.value)}
                    onBlur={commitRename}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename()
                      else if (event.key === 'Escape') setRenamingId(null)
                      event.stopPropagation()
                    }}
                    className="min-w-0 flex-1 rounded bg-bg p-1 text-text"
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 truncate"
                    title="Click to rename"
                    onClick={(event) => {
                      if (locked) return
                      event.stopPropagation()
                      selectRow(page.id)
                      setRenamingId(page.id)
                      setRenameText(page.name)
                    }}
                  >
                    {page.name}
                  </span>
                )}
                <span className="flex w-32 items-center justify-end gap-1">
                  {fadeEditingId === page.id ? (
                    <input
                      aria-label={`Fade time for ${page.name}`}
                      autoFocus
                      value={fadeText}
                      onChange={(event) => setFadeText(event.target.value)}
                      onBlur={commitFade}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitFade()
                        else if (event.key === 'Escape') setFadeEditingId(null)
                        event.stopPropagation()
                      }}
                      className="w-20 rounded bg-bg p-1 text-right font-mono text-text"
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label={`Fade time for ${page.name}`}
                      title="Click to type a fade time (mm:ss.t)"
                      disabled={locked}
                      onClick={(event) => {
                        event.stopPropagation()
                        selectRow(page.id)
                        setFadeEditingId(page.id)
                        setFadeText(formatTimingMs(effectiveFade(page)))
                      }}
                      className="rounded px-1 font-mono disabled:opacity-40"
                    >
                      {formatTimingMs(effectiveFade(page))}
                    </button>
                  )}
                  <span className="flex flex-col">
                    <button type="button" aria-label={`Increase fade time for ${page.name}`} disabled={locked} onClick={(event) => { event.stopPropagation(); stepFade(page, 100) }} className="rounded px-1 text-[10px] leading-none disabled:opacity-40">▲</button>
                    <button type="button" aria-label={`Decrease fade time for ${page.name}`} disabled={locked} onClick={(event) => { event.stopPropagation(); stepFade(page, -100) }} className="rounded px-1 text-[10px] leading-none disabled:opacity-40">▼</button>
                  </span>
                </span>
              </div>
            )
          })}
          {!pages.length && <div className="px-2 py-4 text-sm text-dim">No Live pages yet — add one below.</div>}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              aria-label="Add Live page"
              title="Add Live page"
              aria-expanded={addOpen}
              disabled={locked}
              onClick={() => { setAddOpen((open) => !open); setMoreOpen(false) }}
              className="rounded bg-panel2 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              + ⌄
            </button>
            {addOpen && (
              <div role="menu" aria-label="Add Live page" className="absolute bottom-full left-0 z-10 mb-1 w-40 rounded border border-line bg-panel p-1 shadow-xl">
                <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-panel2" onClick={() => addPage('page')}>Empty Page</button>
                <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-panel2" onClick={() => addPage('cuelist')}>Cuelist</button>
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Delete selected Live page"
            title="Delete selected page"
            disabled={locked || !selected}
            onClick={deleteSelected}
            className="rounded bg-panel2 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            −
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="More Live page actions"
              title="More Live page actions"
              aria-expanded={moreOpen}
              disabled={locked || !selected}
              onClick={() => { setMoreOpen((open) => !open); setAddOpen(false) }}
              className="rounded bg-panel2 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              ··· ⌄
            </button>
            {moreOpen && (
              <div role="menu" aria-label="More Live page actions" className="absolute bottom-full left-0 z-10 mb-1 w-40 rounded border border-line bg-panel p-1 shadow-xl">
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-panel2"
                  onClick={() => {
                    if (!selected) return
                    setRenamingId(selected.id)
                    setRenameText(selected.name)
                    setMoreOpen(false)
                  }}
                >
                  Rename
                </button>
                <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-panel2" onClick={duplicateSelected}>Duplicate</button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white"
          >
            Done
          </button>
        </div>
      </section>
    </div>
  )
}
