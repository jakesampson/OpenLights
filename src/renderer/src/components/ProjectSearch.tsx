import { useEffect, useRef, useState } from 'react'
import { useShowStore, resolveActiveCue } from '../stores/showStore'
import { searchProject, type ProjectSearchResult } from '../lib/searchProject'
export function ProjectSearch({ onReveal }: { onReveal: (result: ProjectSearchResult) => void }) {
  const show = useShowStore((s) => s.show)
  // During playback, the name of the active cue is shown in the center
  // of the toolbar (Guide ch.11, p.218) — here as the search field's
  // placeholder while the search is empty. When nothing is playing it
  // stays "Search Project" (this app has no "No overrides" field).
  // Inline cues (Jake, 27 Nov 2026): the active cue is resolved
  // through its holder (button or cuelist step), not a cue id looked
  // up in a project-wide store.
  const activeCueName = useShowStore((s) => (s.cuePlaying ? resolveActiveCue(s)?.name ?? null : null))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = show ? searchProject(show, query) : []
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('pointerdown', closeOutside); window.removeEventListener('keydown', closeOnEscape) }
  }, [])
  const revealSearch = () => {
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  return <div ref={rootRef} className={`project-search relative ${open ? 'open' : ''}`}>
    <button type="button" className="project-search-button" aria-label={open ? 'Close project search' : 'Search project'} aria-expanded={open} onClick={() => open ? setOpen(false) : revealSearch()}>⌕</button>
    <input ref={inputRef} type="search" aria-label="Search project input" placeholder={activeCueName ?? 'Search Project'} value={query} onChange={(e) => setQuery(e.target.value)} />
    {open && query.trim() && <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-72 overflow-auto rounded border border-line bg-panel p-2 shadow-xl">{results.length ? results.map((r) => <button key={`${r.type}-${r.pageId ?? r.listId ?? ''}-${r.id}`} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-panel2" onClick={() => { onReveal(r); setQuery(''); setOpen(false) }}>{r.name}<span className="ml-2 text-dim">{r.type}</span></button>) : <p className="text-xs text-dim">No matches</p>}</div>}
  </div>
}
