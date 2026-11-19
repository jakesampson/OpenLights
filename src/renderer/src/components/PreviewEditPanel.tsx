import { useShowStore } from '../stores/showStore'
import { StageObjectTools } from './StageObjects'
import type { FixtureDef, PreviewTruss } from '@shared/types'
import type { AlignMode } from '../lib/align'

// LightKey's Inspector (Guide p.53): "On the right of the window is the
// Inspector where you can change the properties of the selected objects."
// In edit mode the right side panel becomes that Inspector — the shape
// tools, layout tools and the selected truss/fixture properties live here
// instead of overlaid on the canvas, so the canvas stays clean (Jake's
// LightKey screenshot, 19 Nov 2026). The Preset Palette is the side
// panel's non-edit content; App swaps between the two.
// Alignment itself stays in StagePreview (it needs the live fixture
// positions) — the Align control here only dispatches the mode.
export function PreviewEditPanel() {
  const show = useShowStore((s) => s.show)
  const editing = useShowStore((s) => s.previewEditing)
  const fixtures = (show?.fixtures ?? []).filter((f) => !f.inStorage)
  const storedFixtures = (show?.fixtures ?? []).filter((f) => f.inStorage)
  const trusses = show?.previewTrusses ?? []
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const selectFixtures = useShowStore((s) => s.selectFixtures)
  const selectedPreviewTrussId = useShowStore((s) => s.selectedPreviewTrussId)
  const setSelectedPreviewTrussId = useShowStore((s) => s.setSelectedPreviewTrussId)
  const setSelectedLayoutTrussIds = useShowStore((s) => s.setSelectedLayoutTrussIds)
  const selectedStageObjectId = useShowStore((s) => s.selectedStageObjectId)
  const setSelectedStageObjectId = useShowStore((s) => s.setSelectedStageObjectId)
  const setPreviewTrusses = useShowStore((s) => s.setPreviewTrusses)
  const selectedTruss = trusses.find((item) => item.id === selectedPreviewTrussId)

  if (!editing) return null

  const addTruss = () => {
    const item: PreviewTruss = { id: crypto.randomUUID(), name: 'Truss', shape: 'straight', x: 400, y: 170, width: 200, height: 100, rotation: 0 }
    setPreviewTrusses([...trusses, item])
    setSelectedPreviewTrussId(item.id)
  }
  const duplicateTruss = (source: PreviewTruss) => {
    const item = { ...source, id: crypto.randomUUID(), x: source.x + 20, y: source.y + 20 }
    setPreviewTrusses([...trusses, item])
    setSelectedPreviewTrussId(item.id)
    return item
  }
  const changeTruss = (patch: Partial<PreviewTruss>) => {
    if (!selectedTruss) return
    setPreviewTrusses(trusses.map((item) => item.id === selectedTruss.id ? { ...item, ...patch } : item))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <section>
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-dim">Shapes</h3>
        <StageObjectTools editing={editing} variant="panel" selectedId={selectedStageObjectId} select={setSelectedStageObjectId} />
      </section>

      <section className="rounded border border-line bg-panel p-2 text-xs">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-dim">Layout</h3>
        <div className="mt-1 flex flex-wrap gap-1">
          <button type="button" className="rounded bg-panel2 px-2 py-1" onClick={addTruss}>+ Add truss</button>
          <button type="button" className="rounded bg-panel2 px-2 py-1" onClick={() => { selectFixtures(fixtures.map((f) => f.id)); setSelectedLayoutTrussIds(trusses.map((t) => t.id)); setSelectedPreviewTrussId(trusses[0]?.id ?? null) }}>Select all</button>
          <select aria-label="Align selected preview objects" defaultValue="" className="rounded bg-panel2 px-2 py-1" onChange={(e) => { if (e.target.value) window.dispatchEvent(new CustomEvent('openlights-preview-align', { detail: e.target.value as AlignMode })); e.target.value = '' }}><option value="">Align / distribute…</option>{(['left', 'right', 'top', 'bottom', 'center-x', 'center-y', 'space-x', 'space-y'] as const).map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select>
        </div>
      </section>

      {selectedTruss && <section className="rounded border border-line bg-panel p-2 text-xs">
        <div className="flex items-center justify-between gap-2"><strong>Truss properties</strong><button type="button" onClick={() => setSelectedPreviewTrussId(null)} className="text-dim">Close</button></div>
        <label className="mt-2 block text-[10px] text-dim">Name<input value={selectedTruss.name} onChange={(event) => changeTruss({ name: event.target.value })} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" /></label>
        <div className="mt-2 grid grid-cols-2 gap-2">{(selectedTruss.shape === 'u' ? ['x', 'y', 'width', 'height', 'rotation'] as const : ['x', 'y', 'width', 'rotation'] as const).map((key) => <label key={key} className="text-[10px] capitalize text-dim">{key === 'width' ? 'Length' : key}<input type="number" aria-label={`Truss ${key}`} value={selectedTruss[key]} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) changeTruss({ [key]: key === 'width' || key === 'height' ? Math.max(10, value) : value }) }} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" /></label>)}</div>
        <div className="mt-2 flex items-center gap-4"><button type="button" className="text-text" onClick={() => duplicateTruss(selectedTruss)}>Duplicate</button><button type="button" className="text-red-300" onClick={() => { setPreviewTrusses(trusses.filter((item) => item.id !== selectedTruss.id)); setSelectedPreviewTrussId(null) }}>Remove truss</button></div>
      </section>}

      {selectedFixtureIds.length > 0 && <section className="rounded border border-line bg-panel p-2 text-xs">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-dim">Fixture properties</h3>
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <label>Beam angle<input aria-label="Preview beam angle" type="number" className="ml-1 w-16 rounded bg-panel2 p-1" value={(() => { const f = fixtures.find((f) => f.id === selectedFixtureIds[0]); return f && typeof f.previewBeam?.direction === 'number' ? f.previewBeam.direction : 0 })()} onChange={(event) => { const direction = Number(event.target.value); if (!Number.isFinite(direction)) return; const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) { const f = fixtures.find((f) => f.id === id); state.updateFixture(id, { previewBeam: { ...f?.previewBeam, direction } }) } state.endHistoryGroup() }} /></label>
          <label>Beam colour<input aria-label="Preview beam colour" type="color" className="ml-1 h-6 w-8" value={fixtures.find((f) => f.id === selectedFixtureIds[0])?.previewBeam?.color ?? '#ffffff'} onChange={(event) => { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) { const f = fixtures.find((f) => f.id === id); state.updateFixture(id, { previewBeam: { direction: 'auto', ...f?.previewBeam, color: event.target.value } }) } state.endHistoryGroup() }} /></label>
          <button type="button" onClick={() => { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) state.updateFixture(id, { previewBeam: { direction: 'auto' } }); state.endHistoryGroup() }} className="text-dim">Auto beam</button>
          <label>Name position<select aria-label="Fixture name position" className="ml-1 rounded bg-panel2 p-1" value={fixtures.find((f) => f.id === selectedFixtureIds[0])?.namePosition ?? 'above'} onChange={(event) => { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) state.updateFixture(id, { namePosition: event.target.value as FixtureDef['namePosition'] }); state.endHistoryGroup() }}><option value="above">Above</option><option value="below">Below</option><option value="hidden">Hidden</option></select></label>
          {(['iconSize', 'rotation'] as const).map((key) => <label key={key}>{key === 'iconSize' ? 'Icon size' : 'Rotation'}<input aria-label={`Fixture ${key}`} type="number" min={key === 'iconSize' ? 4 : undefined} max={key === 'iconSize' ? 80 : undefined} value={fixtures.find((f) => f.id === selectedFixtureIds[0])?.[key] ?? (key === 'iconSize' ? 10 : 0)} onChange={(event) => { const value = Number(event.target.value); if (!Number.isFinite(value)) return; const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) state.updateFixture(id, { [key]: key === 'iconSize' ? Math.max(4, Math.min(80, value)) : value }); state.endHistoryGroup() }} className="ml-1 w-16 rounded bg-panel2 p-1" /></label>)}
        </div>
      </section>}

      <section id="fixture-storage-tray" className="rounded border border-line bg-panel p-2 text-xs">
        <strong>Fixture storage</strong>
        <p className="text-[10px] text-dim">Drag fixtures here to remove them from the layout.</p>
        <div className="mt-1 flex flex-wrap gap-1">{storedFixtures.map((fixture) => <span key={fixture.id} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-openlights-fixture', fixture.id)} className="cursor-grab rounded bg-panel2 p-1">{fixture.name}</span>)}</div>
      </section>

      {!selectedTruss && selectedFixtureIds.length === 0 && <p className="text-[11px] text-dim">Click a truss or a fixture on the canvas to edit its properties here.</p>}
    </div>
  )
}
