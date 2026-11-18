import { useState } from 'react'
import type { CueStepDef } from '@shared/types'
import { filterCueSteps } from '../lib/cueListEditing'
import { useShowStore } from '../stores/showStore'

export function CueListEditor({ listId }: { listId: string }) {
  const { cueLists, cues, editCueListCommand } = useShowStore()
  const [query, setQuery] = useState('')
  const [clipboard, setClipboard] = useState<CueStepDef[]>([])
  const list = cueLists.find((item) => item.id === listId)
  if (!list) return null
  return <section className="rounded border border-line bg-panel2 p-2 text-xs"><header className="flex items-center gap-2"><strong className="flex-1">Edit {list.name}</strong><input aria-label="Filter cuelist" placeholder="Filter cues" value={query} onChange={(event) => setQuery(event.target.value)} className="rounded bg-bg p-1" /><button type="button" disabled={!clipboard.length} onClick={() => editCueListCommand(list.id, { type: 'paste', steps: clipboard, makeId: () => crypto.randomUUID() })}>Paste</button></header>
    <div className="mt-2 grid gap-1">{filterCueSteps(list, cues, query).map((step) => { const index = list.steps.findIndex((item) => item.id === step.id); return <div key={step.id} className="flex items-center gap-1"><select aria-label={`Cue for cue ${index + 1}`} value={step.cueId} onChange={(event) => editCueListCommand(list.id, { type: 'rename-step', id: step.id, cueId: event.target.value })} className="min-w-0 flex-1 rounded bg-bg p-1">{cues.map((cue) => <option key={cue.id} value={cue.id}>{cue.name}</option>)}</select><button onClick={() => editCueListCommand(list.id, { type: 'move', id: step.id, direction: -1 })} disabled={index === 0}>↑</button><button onClick={() => editCueListCommand(list.id, { type: 'move', id: step.id, direction: 1 })} disabled={index === list.steps.length - 1}>↓</button><button onClick={() => setClipboard([structuredClone(step)])}>Copy</button><button onClick={() => editCueListCommand(list.id, { type: 'remove', id: step.id })}>Remove</button></div>})}</div>
    <button type="button" className="btn-theme mt-2" disabled={!cues.length} onClick={() => editCueListCommand(list.id, { type: 'add', step: { id: crypto.randomUUID(), cueId: cues[0].id, fadeMs: 1000, holdMs: 0 } })}>+ Cue</button>
  </section>
}
