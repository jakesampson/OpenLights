import { useState } from 'react'
import type { CueDef, FixtureDef } from '@shared/types'
import type { CueStepDef } from '@shared/types'
import { filterCueSteps } from '../lib/cueListEditing'
import { defaultFixtureValues, useShowStore } from '../stores/showStore'

/** The cue's own ad-hoc values — fixture properties the cue itself
 * sets, over and above the fixture defaults (a new cue's fixtureValues
 * carry the full default set, so the diff is what the operator
 * actually put in the cue). */
function cueAdHocEntries(cue: CueDef, fixtures: FixtureDef[]): { fixture: string; property: string; value: number }[] {
  const entries: { fixture: string; property: string; value: number }[] = []
  for (const [fixtureId, values] of Object.entries(cue.fixtureValues ?? {})) {
    const fixture = fixtures.find((f) => f.id === fixtureId)
    if (!fixture) continue
    const defaults = defaultFixtureValues(fixture)
    for (const [property, value] of Object.entries(values)) {
      if (defaults[property] !== value) entries.push({ fixture: fixture.name, property, value })
    }
  }
  return entries
}

export function CueListEditor({ listId }: { listId: string }) {
  const { cueLists, cues, presets, show, editCueListCommand, addCueToList } = useShowStore()
  const [query, setQuery] = useState('')
  const [clipboard, setClipboard] = useState<CueStepDef[]>([])
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)
  const list = cueLists.find((item) => item.id === listId)
  if (!list) return null
  const fixtures = show?.fixtures ?? []
  const sequences = show?.sequences ?? []
  return <section className="rounded border border-line bg-panel2 p-2 text-xs"><header className="flex items-center gap-2"><strong className="flex-1">Edit {list.name}</strong><input aria-label="Filter cuelist" placeholder="Filter cues" value={query} onChange={(event) => setQuery(event.target.value)} className="rounded bg-bg p-1" /><button type="button" disabled={!clipboard.length} onClick={() => editCueListCommand(list.id, { type: 'paste', steps: clipboard, makeId: () => crypto.randomUUID() })}>Paste</button></header>
    <div className="mt-2 grid gap-1">{filterCueSteps(list, cues, query).map((step) => { const index = list.steps.findIndex((item) => item.id === step.id); const cue = cues.find((item) => item.id === step.cueId); const expanded = expandedStepId === step.id; return <div key={step.id}><div className="flex items-center gap-1"><select aria-label={`Cue for cue ${index + 1}`} value={step.cueId} onChange={(event) => editCueListCommand(list.id, { type: 'rename-step', id: step.id, cueId: event.target.value })} className="min-w-0 flex-1 rounded bg-bg p-1">{cues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={() => editCueListCommand(list.id, { type: 'move', id: step.id, direction: -1 })} disabled={index === 0}>↑</button><button onClick={() => editCueListCommand(list.id, { type: 'move', id: step.id, direction: 1 })} disabled={index === list.steps.length - 1}>↓</button><button onClick={() => setClipboard([structuredClone(step)])}>Copy</button><button onClick={() => editCueListCommand(list.id, { type: 'remove', id: step.id })}>Remove</button><button type="button" aria-label={`${expanded ? 'Hide' : 'Show'} contents of cue ${index + 1}`} aria-expanded={expanded} onClick={() => setExpandedStepId(expanded ? null : step.id)}>{expanded ? '▾' : '▸'}</button></div>
      {expanded && <div className="ml-1 mt-1 rounded bg-bg p-2 text-dim">
        {!cue ? <span>Missing cue</span> : (() => {
          const cuePresets = (cue.presetIds ?? []).map((id) => presets.find((p) => p.id === id)?.name ?? 'Missing preset')
          const cueSequences = (cue.sequenceIds ?? []).map((id) => sequences.find((s) => s.id === id)?.name ?? 'Missing sequence')
          const adHoc = cueAdHocEntries(cue, fixtures)
          if (!cuePresets.length && !cueSequences.length && !adHoc.length) return <span>Empty cue — no presets, sequences or ad-hoc values</span>
          return <div className="grid gap-1">
            {cuePresets.length > 0 && <div><span className="font-semibold text-text">Presets: </span>{cuePresets.join(', ')}</div>}
            {cueSequences.length > 0 && <div><span className="font-semibold text-text">Sequences: </span>{cueSequences.join(', ')}</div>}
            {adHoc.length > 0 && <div><span className="font-semibold text-text">Ad hoc: </span>{adHoc.map((entry) => `${entry.fixture} · ${entry.property} ${entry.value}`).join(', ')}</div>}
          </div>
        })()}
      </div>}
    </div>})}</div>
    {/* LightKey (Guide ch.11, p.191): creating a cue captures the
        active presets and sequences, plus overridden properties as ad
        hoc values — so "+ Cue" works from zero cues too, and always
        makes a cue from the current look. */}
    <button type="button" className="btn-theme mt-2" title="New cue from the current look (active presets, sequences and overrides)" onClick={() => addCueToList(list.id)}>+ Cue</button>
  </section>
}
