import type { PresetDef } from '@shared/types'
import { fixtureMode } from '@shared/fixtureProfiles'
import { useShowStore } from '../stores/showStore'
export function PresetContents({ preset }: { preset: PresetDef }) {
  const { show, selectedFixtureIds, updatePresetContents, updatePresetFromCurrent, removePresetProperty, applyPresetsToOverrides, addOverridesToPresets } = useShowStore()
  return <details className="w-full rounded border border-line p-2 text-xs"><summary>View / edit properties</summary>
    <label>Group<select value={show?.presetGroups?.find((g) => g.presetIds.includes(preset.id))?.id ?? ''} onChange={(e) => useShowStore.getState().assignPresetGroup(preset.id, e.target.value)}>{(show?.presetGroups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    <button type="button" disabled={!selectedFixtureIds.length} className="btn-theme my-2" onClick={() => updatePresetFromCurrent(preset.id)}>Update from selected fixtures</button>
    <button type="button" className="btn-theme m-1" title="Hold Alt to apply only to selected fixtures" onClick={(e) => applyPresetsToOverrides([preset.id], e.altKey)}>Apply to overrides</button>
    <button type="button" className="btn-theme m-1" title="Hold Alt to store only the selected fixtures' overrides" onClick={(e) => addOverridesToPresets([preset.id], e.altKey)}>Add overrides</button>
    {Object.entries(preset.fixtureValues).map(([id, values]) => {
      const fixture = show?.fixtures.find((f) => f.id === id)
      return <div key={id} className="mb-2 rounded bg-panel2 p-2"><div className="flex justify-between"><strong>{fixture?.name ?? `Missing fixture: ${id}`}</strong><button type="button" onClick={() => removePresetProperty(preset.id, id)}>Remove fixture</button></div>
        {Object.entries(values).map(([attribute, value]) => { const channel = fixture && fixtureMode(fixture)?.channels.find((c) => c.attribute === attribute); return <label key={attribute} className="my-1 flex items-center gap-2">{attribute}<input aria-label={`${fixture?.name ?? id} ${attribute}`} type="number" className="ml-auto w-16 bg-panel" min={channel?.min ?? 0} max={channel?.max ?? 255} value={value} onChange={(e) => updatePresetContents(preset.id, { ...preset.fixtureValues, [id]: { ...values, [attribute]: Math.max(channel?.min ?? 0, Math.min(channel?.max ?? 255, Number(e.target.value))) } })} /><button type="button" title={`Remove ${attribute}`} onClick={() => removePresetProperty(preset.id, id, attribute)}>Remove property</button></label> })}
      </div>
    })}
    {!Object.keys(preset.fixtureValues).length && <p>No properties stored.</p>}
  </details>
}
