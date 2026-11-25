import { useEffect, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { StageObjectTools } from './StageObjects'
import { BeamColorDialog } from './BeamColorDialog'
import { FixtureOptionsDialog } from './FixtureOptionsDialog'
import { fixtureHasDmxColourControl } from '../lib/previewOutput'
import { fixtureIconKind } from '../lib/fixtureIcon'
import type { FixtureDef, PreviewTruss } from '@shared/types'

// LightKey's Inspector (Guide p.53): "On the right of the window is the
// Inspector where you can change the properties of the selected objects."
// In edit mode the right side panel becomes that Inspector — the Shapes /
// Images tabs, the selected fixture's Beam Direction… / Beam Color… /
// Fixture Options… and checkboxes, and the selected truss's properties.
// What LightKey puts elsewhere lives elsewhere: Select All and Align /
// Distribute are in the Layout menu, Fixture Storage is below the
// Preview (Guide p.70), zoom/fit are in the View menu and Highlight is
// a header toolbar button — none of them in this panel. The Preset
// Palette is the side panel's non-edit content; App swaps between the two.
export function PreviewEditPanel() {
  const show = useShowStore((s) => s.show)
  const editing = useShowStore((s) => s.previewEditing)
  const fixtures = (show?.fixtures ?? []).filter((f) => !f.inStorage)
  const trusses = show?.previewTrusses ?? []
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const selectedPreviewTrussId = useShowStore((s) => s.selectedPreviewTrussId)
  const setSelectedPreviewTrussId = useShowStore((s) => s.setSelectedPreviewTrussId)
  const setPreviewTrusses = useShowStore((s) => s.setPreviewTrusses)
  const selectedTruss = trusses.find((item) => item.id === selectedPreviewTrussId)
  const selectedStageObjectId = useShowStore((s) => s.selectedStageObjectId)
  const setSelectedStageObjectId = useShowStore((s) => s.setSelectedStageObjectId)
  const [beamColorOpen, setBeamColorOpen] = useState(false)
  const [fixtureOptionsOpen, setFixtureOptionsOpen] = useState(false)

  // The Layout menu and the fixture shortcut menu open these dialogs
  // too (Layout > Beam Color… / Fixture Options…, Guide pp.61–63).
  useEffect(() => {
    const openBeamColor = () => { if (useShowStore.getState().selectedFixtureIds.length) setBeamColorOpen(true) }
    const openFixtureOptions = () => { if (useShowStore.getState().selectedFixtureIds.length) setFixtureOptionsOpen(true) }
    window.addEventListener('openlights-open-beam-color', openBeamColor)
    window.addEventListener('openlights-open-fixture-options', openFixtureOptions)
    return () => {
      window.removeEventListener('openlights-open-beam-color', openBeamColor)
      window.removeEventListener('openlights-open-fixture-options', openFixtureOptions)
    }
  }, [])

  // A spinner click steps the value without a normal text-field click, so
  // Chromium may leave focus elsewhere — and with focus outside any input
  // the app's shortcuts swallow the keys instead of typing (Jake,
  // 20 Nov 2026: keyboard dead after clicking a spinner arrow in this
  // panel). Force focus into the input on the click and on release, so
  // the caret stays in the field after the step. Every number input in
  // this panel writes straight to the store on change, so the same
  // handlers cover the truss inputs too.
  const focusNumberInput = (event: React.MouseEvent<HTMLInputElement>) => event.currentTarget.focus()

  if (!editing) return null

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
  const selectedFixtures = selectedFixtureIds.map((id) => fixtures.find((f) => f.id === id)).filter((f): f is FixtureDef => Boolean(f))
  const firstFixture = selectedFixtures[0]
  // Beam Color… is only for fixtures with a fixed colour (Guide p.61);
  // greyed out when every selected fixture changes colour through DMX.
  const beamColorSupported = selectedFixtures.some((f) => !fixtureHasDmxColourControl(f))
  // LED fixture icon options (Guide pp.56–57): two sizes for LED strips
  // and matrixes, line/ring for LED strips. Greyed out for anything else.
  const ledKind = firstFixture ? fixtureIconKind(firstFixture) : 'generic'
  const ledRowEnabled = ['led-bar', 'led-matrix', 'led-strip-open', 'led-strip-closed'].includes(ledKind)
  const ledShapeEnabled = ledRowEnabled && ledKind !== 'led-matrix'
  const setLedIcon = (patch: Partial<Pick<FixtureDef, 'iconSize' | 'ledIconShape'>>) => {
    const state = useShowStore.getState()
    state.beginHistoryGroup()
    for (const id of selectedFixtureIds) state.updateFixture(id, patch)
    state.endHistoryGroup()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <StageObjectTools editing={editing} selectedId={selectedStageObjectId} select={setSelectedStageObjectId} />

      {selectedTruss && <section className="rounded border border-line bg-panel p-2 text-xs">
        <div className="flex items-center justify-between gap-2"><strong>Truss properties</strong><button type="button" onClick={() => setSelectedPreviewTrussId(null)} className="text-dim">Close</button></div>
        <label className="mt-2 block text-[10px] text-dim">Name<input value={selectedTruss.name} onChange={(event) => changeTruss({ name: event.target.value })} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" /></label>
        <div className="mt-2 grid grid-cols-2 gap-2">{(selectedTruss.shape === 'curved' ? ['x', 'y', 'width', 'height', 'rotation', 'startAngle', 'endAngle'] as const : selectedTruss.shape === 'u' ? ['x', 'y', 'width', 'height', 'rotation'] as const : ['x', 'y', 'width', 'rotation'] as const).map((key) => <label key={key} className="text-[10px] capitalize text-dim">{key === 'width' ? (selectedTruss.shape === 'circular' ? 'Diameter' : selectedTruss.shape === 'curved' ? 'Width' : 'Length') : key === 'startAngle' ? 'Start angle' : key === 'endAngle' ? 'End angle' : key}<input type="number" aria-label={`Truss ${key}`} value={key === 'startAngle' ? selectedTruss.startAngle ?? -90 : key === 'endAngle' ? selectedTruss.endAngle ?? 0 : selectedTruss[key]} onClick={focusNumberInput} onMouseUp={focusNumberInput} onChange={(event) => { const value = Number(event.target.value); if (!Number.isFinite(value)) return; if (key === 'startAngle') { const end = selectedTruss.endAngle ?? 0; changeTruss({ startAngle: Math.max(end - 355, Math.min(end - 5, value)) }); return } if (key === 'endAngle') { const start = selectedTruss.startAngle ?? -90; changeTruss({ endAngle: Math.max(start + 5, Math.min(start + 355, value)) }); return } if (key === 'width' && selectedTruss.shape === 'circular') { const size = Math.max(10, value); changeTruss({ width: size, height: size }); return } changeTruss({ [key]: key === 'width' || key === 'height' ? Math.max(10, value) : value }) }} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" /></label>)}</div>
        <div className="mt-2 flex items-center gap-4"><button type="button" className="text-text" onClick={() => duplicateTruss(selectedTruss)}>Duplicate</button><button type="button" className="text-red-300" onClick={() => { setPreviewTrusses(trusses.filter((item) => item.id !== selectedTruss.id)); setSelectedPreviewTrussId(null) }}>Remove truss</button></div>
      </section>}

      {selectedFixtureIds.length > 0 && <section className="rounded border border-line bg-panel p-2 text-xs">
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => window.dispatchEvent(new Event('openlights-open-calibration'))} className="rounded bg-panel2 px-2 py-1 text-left">Beam Direction…</button>
          <button type="button" disabled={!beamColorSupported} title={beamColorSupported ? undefined : 'The selected fixtures change colour through DMX'} onClick={() => setBeamColorOpen(true)} className="rounded bg-panel2 px-2 py-1 text-left disabled:opacity-40">Beam Color…</button>
          <button type="button" onClick={() => setFixtureOptionsOpen(true)} className="rounded bg-panel2 px-2 py-1 text-left">Fixture Options…</button>
        </div>
        {/* Fixture options (Guide p.62; wizard Build Your Preview step,
            video 04:45): Disable, Hide light beam, Ignore Master Dimmer —
            applied to every selected fixture. */}
        <div className="mt-2 flex flex-col gap-1">
          {([['disabled', 'Disable'], ['hideBeam', 'Hide light beam'], ['ignoreMasterDimmer', 'Ignore Master Dimmer']] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1">
              <input type="checkbox" checked={firstFixture?.[key] ?? false} onChange={(event) => { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) state.updateFixture(id, { [key]: event.target.checked }); state.endHistoryGroup() }} />
              {label}
            </label>
          ))}
        </div>
        {/* LED fixture icon options (Guide pp.56–57): the two sizes and
            the line/ring choice, greyed out unless an LED fixture is
            selected. Small/large set the icon size; line/ring switch a
            strip between its open and closed icon (unset keeps the bar). */}
        <div className="mt-2 flex items-center gap-1" role="group" aria-label="LED fixture icon">
          <button type="button" aria-label="Small LED icon" title="Small LED icon" aria-pressed={(firstFixture?.iconSize ?? 10) === 10} disabled={!ledRowEnabled} onClick={() => setLedIcon({ iconSize: 10 })} className="flex h-7 w-8 items-center justify-center rounded bg-panel2 disabled:opacity-40"><svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="3" width="10" height="6" /></svg></button>
          <button type="button" aria-label="Large LED icon" title="Large LED icon" aria-pressed={(firstFixture?.iconSize ?? 10) === 20} disabled={!ledRowEnabled} onClick={() => setLedIcon({ iconSize: 20 })} className="flex h-7 w-8 items-center justify-center rounded bg-panel2 disabled:opacity-40"><svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1" y="1" width="16" height="10" /></svg></button>
          <button type="button" aria-label="LED strip as a line" title="LED strip as a line" aria-pressed={ledKind === 'led-strip-open'} disabled={!ledShapeEnabled} onClick={() => setLedIcon({ ledIconShape: ledKind === 'led-strip-open' ? undefined : 'line' })} className="flex h-7 w-8 items-center justify-center rounded bg-panel2 disabled:opacity-40"><svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M1 8 4 3 7 8 10 3 13 8 16 3 18 6" /></svg></button>
          <button type="button" aria-label="LED strip as a ring" title="LED strip as a ring" aria-pressed={ledKind === 'led-strip-closed'} disabled={!ledShapeEnabled} onClick={() => setLedIcon({ ledIconShape: ledKind === 'led-strip-closed' ? undefined : 'ring' })} className="flex h-7 w-8 items-center justify-center rounded bg-panel2 disabled:opacity-40"><svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="6" r="4.5" /><circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" /></svg></button>
        </div>
      </section>}

      {beamColorOpen && <BeamColorDialog fixtureIds={selectedFixtureIds} onClose={() => setBeamColorOpen(false)} />}
      {fixtureOptionsOpen && <FixtureOptionsDialog fixtureIds={selectedFixtureIds} onClose={() => setFixtureOptionsOpen(false)} />}

      {!selectedTruss && selectedFixtureIds.length === 0 && <p className="text-[11px] text-dim">Click a truss or a fixture on the canvas to edit its properties here.</p>}
    </div>
  )
}

// Fixture Storage (Guide p.70): "an area for keeping fixtures that are
// temporarily not in use" — it lives BELOW the Preview, not in the side
// panel. Drag a fixture from the canvas onto this tray to store it; drag
// a stored fixture back onto the canvas to place it again. The id is
// the drop target StagePreview's pointer-up handler looks up.
export function FixtureStorageTray() {
  const show = useShowStore((s) => s.show)
  const storedFixtures = (show?.fixtures ?? []).filter((f) => f.inStorage)
  return (
    <section id="fixture-storage-tray" className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-2 py-1 text-xs">
      <strong>Fixture storage</strong>
      <span className="text-[10px] text-dim">Drag fixtures here to remove them from the layout.</span>
      <div className="flex flex-wrap gap-1">{storedFixtures.map((fixture) => <span key={fixture.id} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-openlights-fixture', fixture.id)} className="cursor-grab rounded bg-panel2 p-1">{fixture.name}</span>)}</div>
    </section>
  )
}
