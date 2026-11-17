import { useState } from 'react'
import { useShowStore } from '../stores/showStore'
export function PresetGroups({ editing = false }: { editing?: boolean }) {
  const { show, presets, activePresetIds, togglePreset, createPresetGroup, updatePresetGroup, deletePresetGroup, locked } = useShowStore()
  const [name, setName] = useState(''), groups = show?.presetGroups ?? []
  const render = (parent: string | null, seen: string[] = []): React.ReactNode => groups.filter((g) => (g.parentId ?? null) === parent && !seen.includes(g.id)).map((g) => <details key={g.id} open className="ml-2 text-xs"><summary>{g.name}{g.exclusive ? ' · exclusive' : ''}</summary>
    {editing && !locked && <div className="my-1 flex flex-wrap gap-1"><input aria-label="Group name" value={g.name} onChange={(e) => updatePresetGroup(g.id, { name: e.target.value })} className="w-24 bg-panel2" /><label><input type="checkbox" checked={g.exclusive} onChange={(e) => updatePresetGroup(g.id, { exclusive: e.target.checked })} />Exclusive</label><select aria-label={`Parent group for ${g.name}`} value={g.parentId ?? ''} onChange={(e) => updatePresetGroup(g.id, { parentId: e.target.value || null })}><option value="">Top level</option>{groups.filter((p) => p.id !== g.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="button" onClick={() => deletePresetGroup(g.id)}>Remove group</button></div>}
    {g.presetIds.map((id) => { const p = presets.find((p) => p.id === id); return p && <button key={id} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData('application/openlights-preset', id); e.dataTransfer.setData('text/plain', id) }} data-project-id={id} className={`m-1 rounded px-2 py-1 ${activePresetIds.includes(id) ? 'bg-accent text-bg' : 'bg-panel2'}`} aria-pressed={activePresetIds.includes(id)} onClick={() => togglePreset(id)}>{p.name}</button> })}
    {render(g.id, [...seen, g.id])}
  </details>)
  return <section aria-label="Preset groups"><h3 className="p-2 text-xs">Presets</h3>{render(null)}{editing && !locked && <div className="flex gap-1"><input aria-label="New preset group name" value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 bg-panel2" /><button type="button" disabled={!name.trim()} onClick={() => { createPresetGroup(name); setName('') }}>Add group</button></div>}</section>
}
