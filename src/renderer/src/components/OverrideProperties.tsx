import { useShowStore } from '../stores/showStore'

export function OverrideProperties() {
  const { show, manualOverrides, selectedFixtureIds, releaseManualOverrides } = useShowStore()
  if (!Object.keys(manualOverrides).length) return null
  return <details className="rounded border border-amber-400/40 p-2 text-xs" open>
    <summary>Overridden properties</summary>
    <div className="my-2 flex gap-2"><button type="button" className="btn-theme" onClick={() => releaseManualOverrides()}>Clear all</button><button type="button" className="btn-theme" disabled={!selectedFixtureIds.length} onClick={() => releaseManualOverrides(selectedFixtureIds)}>Clear selection</button></div>
    {Object.entries(manualOverrides).map(([id, values]) => <div key={id} className="flex flex-wrap items-center gap-1"><span>{show?.fixtures.find((f) => f.id === id)?.name ?? id}</span>{Object.entries(values).map(([property, value]) => <button type="button" key={property} title={`Release ${property}`} className="rounded bg-panel2 px-2 py-1 text-amber-200" onClick={() => releaseManualOverrides([id], property)}>{property}: {value} ×</button>)}</div>)}
  </details>
}
