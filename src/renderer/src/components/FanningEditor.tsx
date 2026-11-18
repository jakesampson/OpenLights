import { useState } from 'react'
import type { FanDef } from '@shared/types'
import { useShowStore } from '../stores/showStore'
import { availableProperties } from '../lib/availableProperties'
export function FanningEditor() {
  const { show, cues, activeCueId, selectedFixtureIds, selectFixtures, saveFan, deleteFan } = useShowStore()
  const [fan, setFan] = useState<FanDef>({ id: '', attribute: 'intensity', fixtureIds: [], mode: 'linear', order: 'selection', start: 0, end: 255 })
  const cue = cues.find((s) => s.id === activeCueId), channels = availableProperties((show?.fixtures ?? []).filter((f) => selectedFixtureIds.includes(f.id)))
  return <details className="rounded border border-line p-2 text-xs"><summary>Fanning</summary>
    <div className="my-2 flex flex-wrap gap-2">
      <label>Property<select value={fan.attribute} onChange={(e) => setFan({ ...fan, attribute: e.target.value })}>{channels.map((c) => <option key={c.attribute}>{c.attribute}</option>)}</select></label>
      <label>Shape<select value={fan.mode} onChange={(e) => setFan({ ...fan, mode: e.target.value as FanDef['mode'] })}><option value="linear">Linear</option><option value="centre">From centre</option><option value="reverse">Reverse</option></select></label>
      <label>Order<select value={fan.order} onChange={(e) => setFan({ ...fan, order: e.target.value as FanDef['order'] })}>{['selection', 'left-right', 'top-bottom', 'name', 'address'].map((o) => <option key={o}>{o}</option>)}</select></label>
      {(['start', 'end'] as const).map((key) => <label key={key}>{key}<input type="number" min={0} max={255} value={fan[key]} className="w-16" onChange={(e) => setFan({ ...fan, [key]: Math.max(0, Math.min(255, Number(e.target.value))) })} /></label>)}
      <label><input type="checkbox" checked={Boolean(fan.considerSpacing)} onChange={(e) => setFan({ ...fan, considerSpacing: e.target.checked })} />Use stage spacing</label>
      <button type="button" className="btn-theme" disabled={!cue || !selectedFixtureIds.length || !channels.some((c) => c.attribute === fan.attribute)} onClick={() => { const next = { ...fan, id: fan.id || crypto.randomUUID(), fixtureIds: [...selectedFixtureIds] }; saveFan(next); setFan(next) }}>Apply fan</button>
      <button type="button" className="btn-theme" onClick={() => setFan({ ...fan, id: '', anchors: undefined })}>New fan</button>
    </div>
    {(cue?.fans ?? []).map((f) => <div key={f.id} className="flex gap-2"><span>{f.attribute} · {f.fixtureIds.length} fixtures</span><button type="button" onClick={() => { setFan(structuredClone(f)); selectFixtures(f.fixtureIds) }}>Edit</button><button type="button" onClick={() => deleteFan(f.id, true)}>Remove, keep values</button><button type="button" onClick={() => deleteFan(f.id, false)}>Remove and clear</button></div>)}
  </details>
}
