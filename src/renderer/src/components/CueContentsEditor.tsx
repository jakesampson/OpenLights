import type { LiveControl } from '@shared/types'
import { useShowStore } from '../stores/showStore'

export function CueContentsEditor({ control }: { control: LiveControl }) {
  const { presets, show, editCueContents } = useShowStore()
  return <details className="rounded border border-line bg-panel2 p-2 text-xs" open><summary>Contents</summary><div className="mt-2 grid gap-2 sm:grid-cols-3">
    <fieldset><legend className="text-dim">Presets</legend>{presets.map((item) => <label key={item.id} className="block"><input type="checkbox" checked={control.presetIds.includes(item.id)} onChange={(event) => editCueContents(control.id, { type: event.target.checked ? 'add-preset' : 'remove-preset', id: item.id })} /> {item.name}</label>)}</fieldset>
    <fieldset><legend className="text-dim">Sequences</legend>{(show?.sequences ?? []).map((item) => <label key={item.id} className="block"><input type="checkbox" checked={(control.sequenceIds ?? []).includes(item.id)} onChange={(event) => editCueContents(control.id, { type: event.target.checked ? 'add-sequence' : 'remove-sequence', id: item.id })} /> {item.name}</label>)}</fieldset>
    <fieldset><legend className="text-dim">Ad-hoc properties</legend>{Object.entries(control.adHocValues ?? {}).flatMap(([fixtureId, values]) => Object.entries(values).map(([property, value]) => <label key={`${fixtureId}:${property}`} className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate">{fixtureId} · {property}</span><input aria-label={`${fixtureId} ${property}`} type="number" min="0" max="255" value={value} className="w-16 rounded bg-bg p-1" onChange={(event) => editCueContents(control.id, { type: 'set-ad-hoc', fixtureId, property, value: Number(event.target.value) })} /><button type="button" aria-label={`Remove ${fixtureId} ${property}`} onClick={() => editCueContents(control.id, { type: 'remove-ad-hoc', fixtureId, property })}>×</button></label>))}{!Object.keys(control.adHocValues ?? {}).length && <span className="text-dim">None</span>}</fieldset>
  </div></details>
}
