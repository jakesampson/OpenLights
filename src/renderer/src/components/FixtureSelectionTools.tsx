import { useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { selectFixtureIds } from '../lib/fixtureSelection'
export function FixtureSelectionTools() {
  const { show, selectFixtures } = useShowStore(), fixtures = show?.fixtures ?? []
  const [name, setName] = useState('')
  return <details className="rounded border border-line bg-panel2 p-2 text-xs"><summary className="cursor-pointer">Fixture selection</summary><div className="mt-2 flex flex-wrap items-center gap-2"><button className="btn-theme" onClick={() => selectFixtures(selectFixtureIds(fixtures))}>All</button><select aria-label="Select fixture type" defaultValue="" className="rounded bg-bg p-1" onChange={(e) => { if (e.target.value) selectFixtures(selectFixtureIds(fixtures, { type: e.target.value })); e.target.value = '' }}><option value="">By type…</option>{[...new Set(fixtures.map((f) => f.type))].map((type) => <option key={type}>{type}</option>)}</select><input type="search" aria-label="Fixture name selection" placeholder="Fixture name" value={name} onChange={(e) => setName(e.target.value)} className="rounded bg-bg p-1" /><button className="btn-theme" onClick={() => selectFixtures(selectFixtureIds(fixtures, { name }))}>Select matches</button>{(['left', 'right', 'front', 'back'] as const).map((location) => <button key={location} className="btn-theme capitalize" onClick={() => selectFixtures(selectFixtureIds(fixtures, { location }))}>{location}</button>)}</div></details>
}
