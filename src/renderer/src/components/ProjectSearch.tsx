import { useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { searchProject, type ProjectSearchResult } from '../lib/searchProject'
export function ProjectSearch({ onReveal }: { onReveal: (result: ProjectSearchResult) => void }) {
  const show = useShowStore((s) => s.show)
  const [query, setQuery] = useState('')
  const results = show ? searchProject(show, query) : []
  return <div className="project-search relative"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search project" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />{query.trim() && <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-72 overflow-auto rounded border border-line bg-panel p-2 shadow-xl">{results.length ? results.map((r) => <button key={`${r.type}-${r.pageId ?? r.listId ?? ''}-${r.id}`} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-panel2" onClick={() => { onReveal(r); setQuery('') }}>{r.name}<span className="ml-2 text-dim">{r.type}</span></button>) : <p className="text-xs text-dim">No matches</p>}</div>}</div>
}
