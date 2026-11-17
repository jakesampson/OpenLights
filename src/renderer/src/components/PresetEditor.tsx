import { PresetGroups } from './PresetGroups'
import { PresetContents } from './PresetContents'
import { useState } from 'react'
import type { PresetCategory } from '@shared/types'
import { useShowStore } from '../stores/showStore'

export function PresetEditor() {
  const { show, scenes, activeSceneId, selectedFixtureIds, presets, capturePreset, renamePreset, deletePreset } = useShowStore()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [category, setCategory] = useState<PresetCategory>('color')
  const scene = scenes.find((item) => item.id === activeSceneId)
  const capture = () => {
    const previous = useShowStore.getState().presets.length
    capturePreset(name, category)
    if (useShowStore.getState().presets.length > previous) { setName(''); setError('') }
    else setError('No matching properties found in the selected fixtures and scene.')
  }
  return <section className="rounded border border-line bg-panel p-3">
    <h3 className="text-sm font-semibold">Reusable presets</h3><PresetGroups editing />
    <p className="mt-1 text-xs text-dim">Select fixtures and a scene in Design, then capture the properties you want to reuse. Presets layer over the scene in activation order; the latest wins on overlapping channels.</p>
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs text-dim">Name<input aria-label="Preset name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Warm wash" className="mt-1 block rounded border border-line bg-panel2 px-2 py-2 text-xs text-text" /></label>
      <label className="text-xs text-dim">Properties<select aria-label="Preset properties" value={category} onChange={(event) => setCategory(event.target.value as PresetCategory)} className="mt-1 block rounded border border-line bg-panel2 px-2 py-2 text-xs text-text"><option value="color">Colour</option><option value="intensity">Intensity</option><option value="position">Position</option><option value="other">Other</option></select></label>
      <button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={!name.trim() || !scene || selectedFixtureIds.length === 0} onClick={capture}>Capture preset</button>
      <span className="text-[10px] text-dim">{scene ? `Scene: ${scene.name}` : 'Choose a scene'} · {selectedFixtureIds.length} selected</span>
    </div>
    {name.trim() && scene && selectedFixtureIds.length > 0 && <p className="mt-2 text-[10px] text-dim">Only properties present in the scene and supported by selected fixtures are captured.</p>}
    {error && <p role="alert" className="mt-2 text-xs text-amber-300">{error}</p>}
    <div className="mt-3 flex flex-col gap-1">{presets.map((preset) => <div key={preset.id} data-project-id={preset.id} className="flex flex-wrap items-center gap-2 rounded border border-line bg-bg/30 px-2 py-1.5 text-xs"><span className="min-w-0 flex-1 truncate">{preset.name} <span className="text-dim">· {preset.category} · {Object.keys(preset.fixtureValues).filter((id) => show?.fixtures.some((fixture) => fixture.id === id)).length} fixtures</span></span><button type="button" className="text-dim hover:text-text" onClick={() => { const next = prompt('Preset name', preset.name); if (next !== null) renamePreset(preset.id, next) }}>Rename</button><button type="button" className="text-dim hover:text-red-300" onClick={() => { if (confirm(`Delete preset "${preset.name}"?`)) deletePreset(preset.id) }}>Delete</button><PresetContents preset={preset} /></div>)}</div>
  </section>
}
