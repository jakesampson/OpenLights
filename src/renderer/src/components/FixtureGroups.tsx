import { useCallback, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { fixtureGroupMembers } from '../lib/fixtureGroups'

// Fixture groups, rewritten for clarity (Jake, 20 Nov 2026): the popup
// explains itself — what a group is, how to add one, and how to rename
// or remove one. Nothing about what groups DO changed: a group is still
// fixtures of the same type in the same location, selected together
// (LightKey Guide ch.4 Step 5, ch.7 Preview). The edit controls used to
// hide behind a Manage toggle; they are always visible now. Adding a
// group works off the fixtures selected in the Preview — the form says
// how many are selected, and Add stays off until some are.
export function FixtureGroups() {
  const { show, locked, selectedFixtureIds, selectFixtures, selectFixture, createFixtureGroup, renameFixtureGroup, parentFixtureGroup, moveFixtureGroup, removeFixtureGroup } = useShowStore()
  const [name, setName] = useState(''), [parent, setParent] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null), [renameDraft, setRenameDraft] = useState('')
  // Focus the rename input the moment its node mounts: autoFocus is
  // queued by the browser as a separate task, so a fast keystroke after
  // the click could land before focus arrived (the palette rename had
  // the same fault, Jake 19 + 22 Nov 2026).
  const focusRenameInput = useCallback((el: HTMLInputElement | null) => { if (el) el.focus() }, [])
  const groups = show?.fixtureGroups ?? []
  const selectedCount = selectedFixtureIds.length
  const saveRename = (id: string) => {
    if (renameDraft.trim()) renameFixtureGroup(id, renameDraft)
    setRenamingId(null)
  }
  const render = (parentId: string | null, visited = new Set<string>()): React.ReactNode => groups.filter((g) => (g.parentId ?? null) === parentId && !visited.has(g.id)).map((g) => <div key={g.id} className="ml-2 border-l border-line pl-2"><div className="flex flex-wrap items-center gap-1 py-1">
    {renamingId === g.id ? <>
      <input aria-label={`Rename group ${g.name}`} ref={focusRenameInput} value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveRename(g.id); if (e.key === 'Escape') setRenamingId(null) }} className="min-w-0 flex-1 rounded bg-panel2 p-1 text-xs" />
      <button type="button" className="btn-theme text-xs" onClick={() => saveRename(g.id)}>Save</button>
      <button type="button" className="btn-theme text-xs" onClick={() => setRenamingId(null)}>Cancel</button>
    </> : <button type="button" className="min-w-0 flex-1 truncate text-left text-xs" title="Click to select this group's fixtures" onClick={() => selectFixtures(fixtureGroupMembers(groups, g.id))}>{g.name}<span className="ml-1 text-dim">{fixtureGroupMembers(groups, g.id).length}</span></button>}
    {renamingId !== g.id && !locked && <button type="button" className="text-xs" onClick={() => { setRenamingId(g.id); setRenameDraft(g.name) }}>Rename</button>}
    {!locked && <>
      <label className="flex items-center gap-1 text-xs text-dim">Inside <select aria-label={`Parent group for ${g.name}`} value={g.parentId ?? ''} onChange={(e) => parentFixtureGroup(g.id, e.target.value || null)} className="w-20 rounded bg-panel2 text-xs"><option value="">Root</option>{groups.filter((p) => p.id !== g.id).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <button type="button" title="Move group up" onClick={() => moveFixtureGroup(g.id, -1)}>↑</button>
      <button type="button" title="Move group down" onClick={() => moveFixtureGroup(g.id, 1)}>↓</button>
      <button type="button" className="text-xs text-red-300" onClick={() => removeFixtureGroup(g.id)}>Delete</button>
    </>}
  </div>{g.fixtureIds.map((id) => { const f = show?.fixtures.find((f) => f.id === id); return f ? <button type="button" key={id} className="ml-2 block w-full truncate py-1 text-left text-xs text-dim" onClick={(event) => selectFixture(id, event.shiftKey)}>{f.name}</button> : null })}{render(g.id, new Set([...visited, g.id]))}</div>)
  return <div className="rounded border border-line p-2">
    <p className="text-xs text-dim">A group is fixtures of the same type in the same place. Click a group name to select all its fixtures at once; click a fixture name to select just that one.</p>
    {!groups.length && <p className="mt-2 text-xs text-dim">No groups yet — select fixtures in the Preview, then add a group below.</p>}
    {render(null)}
    {!locked && <form className="mt-2 border-t border-line pt-2" onSubmit={(e) => { e.preventDefault(); if (createFixtureGroup(name, parent || null)) setName('') }}>
      <strong className="text-xs">Add a group</strong>
      <p className="mt-1 text-xs text-dim">Select fixtures in the Preview first (click one, Shift-click for more) — the selected fixtures go into the new group.</p>
      <p className="mt-1 text-xs">{selectedCount === 0 ? 'No fixtures selected yet' : `${selectedCount} fixture${selectedCount === 1 ? '' : 's'} selected`}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        <input aria-label="New group name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className="min-w-0 flex-1 rounded bg-panel2 p-1 text-xs" />
        <label className="flex items-center gap-1 text-xs text-dim">Inside <select aria-label="New group parent" value={parent} onChange={(e) => setParent(e.target.value)} className="max-w-24 rounded bg-panel2 text-xs"><option value="">Root</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <button type="submit" className="btn-theme text-xs" disabled={!name.trim() || selectedCount === 0} title={selectedCount === 0 ? 'Select fixtures in the Preview first' : undefined}>Add group</button>
      </div>
    </form>}
  </div>
}
