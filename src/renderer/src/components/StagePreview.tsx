import { useEffect, useMemo, useRef, useState } from 'react'
import { previewFixtureValues, previewBeamAppearance } from '../lib/previewOutput'
import { alignObjects, type AlignMode } from '../lib/align'
import { resizeFixtureIcon, rotateFixtureIcon } from '../lib/fixtureGeometry'
import { marqueeSelection } from '../lib/previewSelection'
import { fitPreview, type Bounds } from '../lib/previewViewport'
import { moveTruss, resizeTruss, rotateTruss, snapFixtureToTruss, snapTrussEndpoints } from '../lib/trussGeometry'
import { StageObjectLayer, StageObjectTools } from './StageObjects'
import { useShowStore } from '../stores/showStore'
import type { FixtureDef, SceneDef, PreviewTruss } from '@shared/types'

interface Pos { x: number; y: number }
interface FixtureView extends FixtureDef {
  pos: Pos
  intensity: number
  color: string
}

function clamp(v: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, v))
}

function averageAttribute(values: Record<string, number>, attribute: string) {
  const attributes = [
    attribute,
    `${attribute}2`,
    `${attribute}3`,
    `${attribute}4`
  ].filter((key) => typeof values[key] === 'number')
  if (attributes.length === 0) return 0
  return attributes.reduce((total, key) => total + values[key], 0) / attributes.length
}

export function fixtureColor(values?: Record<string, number>, dimmerOnly = false): string {
  if (!values) return '#5d3a72'
  if (dimmerOnly && !['red', 'green', 'blue'].some((attribute) => typeof values?.[attribute] === 'number')) {
    values = { ...values, red: 255, green: 255, blue: 255 }
  }
  const dim = clamp(values.intensity ?? 255, 0, 255) / 255
  const white = values.white ?? 0
  const amber = values.amber ?? 0
  const r = Math.round(clamp(averageAttribute(values, 'red') + white + amber) * dim)
  const g = Math.round(
    clamp(averageAttribute(values, 'green') + white + amber * 0.45) * dim
  )
  const b = Math.round(clamp(averageAttribute(values, 'blue') + white) * dim)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function fixturePositions(count: number) {
  // Overhead truss arc + floor positions.
  const positions: Array<{ x: number; y: number }> = []
  const overhead = Math.min(count, 6)

  // Spread fixtures evenly along the full truss arc (x 40..760), following
  // the quadratic curve y = 80 - 84·t·(1 - t) so they sit on the truss.
  for (let i = 0; i < overhead; i++) {
    const t = (i + 0.5) / overhead
    const x = 40 + 720 * t
    const y = 80 - 84 * t * (1 - t)
    positions.push({ x, y })
  }

  // Remaining fixtures go on the stage deck as up-lights.
  const floorCount = Math.max(0, count - overhead)
  for (let i = 0; i < floorCount; i++) {
    const t = (i + 0.5) / floorCount
    positions.push({ x: 40 + 720 * t, y: 300 })
  }

  return positions.slice(0, count)
}

export function StagePreview() {
  const { locked, show, activeSceneId, selectedFixtureIds, selectFixture, selectFixtures, setFixturePositions, setPreviewTrusses } = useShowStore()
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (locked) setEditing(false) }, [locked])
  const [outputChannels, setOutputChannels] = useState<number[]>([])
  useEffect(() => {
    let alive = true
    let pending = false
    const readOutput = async () => {
      if (pending || !window.electronAPI?.getChannels) return
      pending = true
      try { const values = await window.electronAPI.getChannels(); if (alive) setOutputChannels(values) }
      catch { /* Keep the last known output if the bridge is unavailable. */ }
      finally { pending = false }
    }
    void readOutput()
    const timer = window.setInterval(readOutput, 100)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])
  const [trussDraft, setTrussDraft] = useState<PreviewTruss | null>(null)
  const trussDragRef = useRef<{ mode: 'move' | 'resize' | 'rotate'; start: Pos; original: PreviewTruss; current: PreviewTruss } | null>(null)
  const [selectedTrussId, setSelectedTrussId] = useState<string | null>(null)
  const copiedTrussRef = useRef<PreviewTruss | null>(null)
  const [marquee, setMarquee] = useState<{ start: Pos; current: Pos; additive: boolean } | null>(null)
  const [selectedLayoutTrussIds, setSelectedLayoutTrussIds] = useState<string[]>([])
  const fixtureHandleRef = useRef<{ fixture: FixtureDef; mode: 'resize' | 'rotate'; centre: Pos; start: Pos } | null>(null)
  const [selectedStageObjectId, setSelectedStageObjectId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [viewCentre, setViewCentre] = useState({ x: 400, y: 170 })
  const [dragPositions, setDragPositions] = useState<Record<string, Pos> | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ start: Pos; originals: Record<string, Pos>; positions: Record<string, Pos> } | null>(null)
  const pointAt = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const result = point.matrixTransform(matrix.inverse())
    return { x: Math.round(clamp(result.x, 0, 800)), y: Math.round(clamp(result.y, 0, 340)) }
  }
  const storageTrayRef = useRef<HTMLDivElement>(null)
  const storedFixtures = (show?.fixtures ?? []).filter((f) => f.inStorage)
  const fixtures: FixtureDef[] = (show?.fixtures ?? []).filter((f) => !f.inStorage)
  const scenes: SceneDef[] = show?.scenes ?? []
  const activeScene = activeSceneId ? scenes.find((s) => s.id === activeSceneId) : null

  const fixtureViews = useMemo((): FixtureView[] => {
    const count = fixtures.length || 8 // demo rig when nothing patched
    const positions = fixturePositions(count)

    return positions.map((pos, i) => {
      if (fixtures.length > 0) {
        const f = fixtures[i]
        const values = previewFixtureValues(f, outputChannels, activeScene?.fixtureValues[f.id])
        return {
          ...f,
          pos: dragPositions?.[f.id] ?? f.previewPosition ?? pos,
          intensity: values.intensity ?? Math.max(values.red ?? 0, values.green ?? 0, values.blue ?? 0, values.white ?? 0, values.amber ?? 0),
          color: fixtureColor(values, f.type === 'dimmer')
        }
      }
      return {
        id: `demo-${i}`,
        name: `Demo Light ${i + 1}`,
        type: i < 4 ? 'par' : 'moving-head',
        channelStart: i + 1,
        channels: 4,
        pos: { x: pos.x, y: pos.y },
        intensity: 170,
        color: '#c24bd6'
      }
    })
  }, [fixtures, activeScene, dragPositions, outputChannels])

  const trusses = show?.previewTrusses ?? []
  const selectedTruss = trussDraft ?? trusses.find((item) => item.id === selectedTrussId)
  const fit = (selectionOnly: boolean) => {
    const bounds: Bounds[] = fixtureViews.filter((f) => !selectionOnly || selectedFixtureIds.includes(f.id)).map((f) => ({ x: f.pos.x - 10, y: f.pos.y - 10, width: 20, height: 20 }))
    for (const truss of trusses.filter((t) => !selectionOnly || t.id === selectedTrussId)) {
      const angle = truss.rotation * Math.PI / 180, w = truss.width, h = truss.shape === 'u' ? truss.height : 8
      const width = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle)), height = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle))
      bounds.push({ x: truss.x - width / 2, y: truss.y - height / 2, width, height })
    }
    const viewport = fitPreview(bounds)
    setZoom(800 / viewport.width); setViewCentre({ x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 })
  }
  useEffect(() => {
    const handler = (event: Event) => { const command = (event as CustomEvent<string>).detail; if (command === 'fit' || command === 'selection') fit(command === 'selection'); else setZoom((z) => Math.max(0.125, Math.min(8, z * (command === 'in' ? 1.2 : 1 / 1.2)))) }
    window.addEventListener('openlights-preview-zoom', handler)
    return () => window.removeEventListener('openlights-preview-zoom', handler)
  }, [fixtures, trusses, selectedFixtureIds, selectedTrussId])
  const addTruss = () => {
    const item: PreviewTruss = { id: crypto.randomUUID(), name: 'Truss', shape: 'straight', x: 400, y: 170, width: 200, height: 100, rotation: 0 }
    setPreviewTrusses([...trusses, item]); setSelectedTrussId(item.id)
  }
  const duplicateTruss = (source: PreviewTruss) => {
    const item = { ...source, id: crypto.randomUUID(), x: source.x + 20, y: source.y + 20 }
    setPreviewTrusses([...trusses, item]); setSelectedTrussId(item.id)
    return item
  }
  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (event.key.toLowerCase() === 'c' && selectedTruss) {
        copiedTrussRef.current = { ...selectedTruss }
        event.preventDefault()
      } else if (event.key.toLowerCase() === 'v' && copiedTrussRef.current) {
        copiedTrussRef.current = duplicateTruss(copiedTrussRef.current)
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editing, selectedTruss, trusses, setPreviewTrusses])
  const changeTruss = (patch: Partial<PreviewTruss>) => {
    if (!selectedTruss) return
    setPreviewTrusses(trusses.map((item) => item.id === selectedTruss.id ? { ...item, ...patch } : item))
  }
  const align = (mode: AlignMode) => {
    const selected = fixtureViews.filter((f) => selectedFixtureIds.includes(f.id)).map((f) => ({ id: f.id, x: f.pos.x, y: f.pos.y, width: 20, height: 20 }))
    for (const truss of trusses.filter((t) => selectedLayoutTrussIds.includes(t.id) || t.id === selectedTrussId)) {
      const angle = truss.rotation * Math.PI / 180, height = truss.shape === 'u' ? truss.height : 8
      selected.push({ id: truss.id, x: truss.x, y: truss.y, width: Math.abs(truss.width * Math.cos(angle)) + Math.abs(height * Math.sin(angle)), height: Math.abs(truss.width * Math.sin(angle)) + Math.abs(height * Math.cos(angle)) })
    }
    if (selected.length < 2) return
    const output = alignObjects(selected, mode), state = useShowStore.getState()
    state.beginHistoryGroup()
    setFixturePositions(Object.fromEntries(Object.entries(output).filter(([id]) => fixtures.some((f) => f.id === id))))
    setPreviewTrusses(trusses.map((t) => output[t.id] ? { ...t, ...output[t.id] } : t))
    state.endHistoryGroup()
  }

  return (
    <div className="panel stage min-h-0 overflow-hidden relative bg-bg p-2">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1">
        <span className="rounded bg-bg/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-dim">Preview</span><button type="button" className="rounded bg-panel2 px-2 py-1 text-xs disabled:opacity-40" disabled={!selectedFixtureIds.length || locked} onClick={() => useShowStore.getState().locateFixtures(selectedFixtureIds)}>Locate</button>
        <button type="button" disabled={locked} onClick={() => { setEditing(!editing); setDragPositions(null); dragRef.current = null; trussDragRef.current = null; setTrussDraft(null) }} className={`rounded px-2 py-1 text-xs ${editing ? 'bg-text text-bg' : 'bg-panel2 text-text'}`} aria-pressed={editing}>{editing ? 'Done' : 'Edit layout'}</button>
        {editing && <div className="flex flex-wrap gap-1 rounded bg-bg/80 p-1 text-[10px] text-text">
          <button type="button" className="rounded bg-panel2 px-2 py-1" onClick={addTruss}>+ Add truss</button><button type="button" className="rounded bg-panel2 px-2 py-1" onClick={() => { selectFixtures(fixtures.map((f) => f.id)); setSelectedLayoutTrussIds(trusses.map((t) => t.id)); setSelectedTrussId(trusses[0]?.id ?? null) }}>Select all</button>
          <select aria-label="Align selected preview objects" defaultValue="" className="rounded bg-panel2 px-2 py-1" onChange={(e) => { if (e.target.value) align(e.target.value as AlignMode); e.target.value = '' }}><option value="">Align / distribute…</option>{(['left', 'right', 'top', 'bottom', 'center-x', 'center-y', 'space-x', 'space-y'] as const).map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select>
        </div>}
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded bg-bg/80 p-1">
        <button type="button" aria-label="Zoom out preview" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="px-2 text-sm text-text">−</button>
        <button type="button" onClick={() => { setZoom(1); setViewCentre({ x: 400, y: 170 }) }} className="px-1 text-[10px] text-dim" title="Reset preview zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" className="px-1 text-[10px] text-dim" onClick={() => fit(false)}>Fit</button><button type="button" className="px-1 text-[10px] text-dim" disabled={!selectedFixtureIds.length && !selectedTrussId} onClick={() => fit(true)}>Selection</button><button type="button" aria-label="Zoom in preview" onClick={() => setZoom((z) => Math.min(8, z * 1.2))} className="px-2 text-sm text-text">+</button>
      </div>
      {editing && selectedTruss && <div className="absolute bottom-3 right-3 z-10 w-56 rounded border border-line bg-panel p-3 shadow-xl">
        <div className="flex items-center justify-between gap-2"><strong className="text-xs">Truss properties</strong><button type="button" onClick={() => setSelectedTrussId(null)} className="text-xs text-dim">Close</button></div>
        <label className="mt-2 block text-[10px] text-dim">Name<input value={selectedTruss.name} onChange={(event) => changeTruss({ name: event.target.value })} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" /></label>
        <div className="mt-2 grid grid-cols-2 gap-2">{(selectedTruss.shape === 'u' ? ['x', 'y', 'width', 'height', 'rotation'] as const : ['x', 'y', 'width', 'rotation'] as const).map((key) => <label key={key} className="text-[10px] capitalize text-dim">{key === 'width' ? 'Length' : key}<input type="number" aria-label={`Truss ${key}`} value={selectedTruss[key]} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) changeTruss({ [key]: key === 'width' || key === 'height' ? Math.max(10, value) : value }) }} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" /></label>)}</div>
        <div className="mt-2 flex items-center gap-4"><button type="button" className="text-xs text-text" onClick={() => duplicateTruss(selectedTruss)}>Duplicate</button><button type="button" className="text-xs text-red-300" onClick={() => { setPreviewTrusses(trusses.filter((item) => item.id !== selectedTruss.id)); setSelectedTrussId(null) }}>Remove truss</button></div>
      </div>}
      {editing && selectedFixtureIds.length > 0 && <div className="absolute bottom-3 left-3 z-10 flex gap-2 rounded border border-line bg-panel p-2 text-xs"><label>Beam angle<input aria-label="Preview beam angle" type="number" className="ml-1 w-16 rounded bg-panel2 p-1" value={(() => { const f = fixtures.find((f) => f.id === selectedFixtureIds[0]); return f && typeof f.previewBeam?.direction === 'number' ? f.previewBeam.direction : 0 })()} onChange={(event) => { const direction = Number(event.target.value); if (!Number.isFinite(direction)) return; const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) { const f = fixtures.find((f) => f.id === id); state.updateFixture(id, { previewBeam: { ...f?.previewBeam, direction } }) } state.endHistoryGroup() }} /></label><label>Beam colour<input aria-label="Preview beam colour" type="color" className="ml-1 h-6 w-8" value={fixtures.find((f) => f.id === selectedFixtureIds[0])?.previewBeam?.color ?? '#ffffff'} onChange={(event) => { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) { const f = fixtures.find((f) => f.id === id); state.updateFixture(id, { previewBeam: { direction: 'auto', ...f?.previewBeam, color: event.target.value } }) } state.endHistoryGroup() }} /></label><button type="button" onClick={() => { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) state.updateFixture(id, { previewBeam: { direction: 'auto' } }); state.endHistoryGroup() }} className="text-dim">Auto beam</button><label>Name position<select aria-label="Fixture name position" className="ml-1 rounded bg-panel2 p-1" value={fixtures.find((f) => f.id === selectedFixtureIds[0])?.namePosition ?? 'above'} onChange={(event) => { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) state.updateFixture(id, { namePosition: event.target.value as FixtureDef['namePosition'] }); state.endHistoryGroup() }}><option value="above">Above</option><option value="below">Below</option><option value="hidden">Hidden</option></select></label>{(['iconSize', 'rotation'] as const).map((key) => <label key={key}>{key === 'iconSize' ? 'Icon size' : 'Rotation'}<input aria-label={`Fixture ${key}`} type="number" min={key === 'iconSize' ? 4 : undefined} max={key === 'iconSize' ? 80 : undefined} value={fixtures.find((f) => f.id === selectedFixtureIds[0])?.[key] ?? (key === 'iconSize' ? 10 : 0)} onChange={(event) => { const value = Number(event.target.value); if (!Number.isFinite(value)) return; const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of selectedFixtureIds) state.updateFixture(id, { [key]: key === 'iconSize' ? Math.max(4, Math.min(80, value)) : value }); state.endHistoryGroup() }} className="ml-1 w-16 rounded bg-panel2 p-1" /></label>)}</div>}
      {editing && <div ref={storageTrayRef} className="absolute bottom-3 right-3 z-20 max-w-xs rounded border border-line bg-panel p-2 text-xs"><strong>Fixture storage</strong><p className="text-[10px] text-dim">Drag fixtures here to remove them from the layout.</p><div className="mt-1 flex flex-wrap gap-1">{storedFixtures.map((fixture) => <span key={fixture.id} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-openlights-fixture', fixture.id)} className="cursor-grab rounded bg-panel2 p-1">{fixture.name}</span>)}</div></div>}
      <StageObjectTools editing={editing} selectedId={selectedStageObjectId} select={setSelectedStageObjectId} />
      <svg
        ref={svgRef}
        className="h-full w-full"
        onDragOver={(event) => { if (editing && event.dataTransfer.types.includes('application/x-openlights-fixture')) event.preventDefault() }}
        onDrop={(event) => { if (!editing) return; const id = event.dataTransfer.getData('application/x-openlights-fixture'), point = pointAt(event); if (point && storedFixtures.some((f) => f.id === id)) { event.preventDefault(); setFixturePositions({ [id]: point }); selectFixtures([id]) } }}
        viewBox={`${viewCentre.x - 400 / zoom} ${viewCentre.y - 170 / zoom} ${800 / zoom} ${340 / zoom}`}
        onPointerMove={(event) => { if (fixtureHandleRef.current) { const d = fixtureHandleRef.current, point = pointAt(event); if (point) useShowStore.getState().updateFixture(d.fixture.id, d.mode === 'resize' ? { iconSize: resizeFixtureIcon(d.fixture, d.centre, d.start, point) } : { rotation: rotateFixtureIcon(d.fixture, d.centre, d.start, point) }); return } if (marquee) { const point = pointAt(event); if (point) setMarquee({ ...marquee, current: point }); return } if (trussDragRef.current) { const point = pointAt(event); if (point) { const drag = trussDragRef.current; const next = drag.mode === 'move' ? moveTruss(drag.original, drag.start, point) : drag.mode === 'rotate' ? rotateTruss(drag.original, drag.start, point) : resizeTruss(drag.original, drag.start, point); drag.current = drag.mode === 'rotate' ? next : snapTrussEndpoints(next, trusses); setTrussDraft(drag.current) } return } if (!dragRef.current) return; const position = pointAt(event); if (position) { const drag = dragRef.current; const dx = position.x - drag.start.x, dy = position.y - drag.start.y; const positions = Object.fromEntries(Object.entries(drag.originals).map(([id, original]) => [id, { x: clamp(original.x + dx, 0, 800), y: clamp(original.y + dy, 0, 340) }])); drag.positions = positions; setDragPositions(positions) } }}
        onPointerUp={(event) => { if (fixtureHandleRef.current) { fixtureHandleRef.current = null; useShowStore.getState().endHistoryGroup(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return } if (marquee) { const ids = marqueeSelection([...fixtureViews.map((f) => ({ id: f.id, x: f.pos.x, y: f.pos.y, width: 20, height: 20 })), ...trusses.map((t) => ({ ...t, height: t.shape === 'u' ? t.height : 8 }))], marquee.start, pointAt(event) ?? marquee.current); const fixtures = ids.filter((id) => fixtureViews.some((f) => f.id === id)); selectFixtures(marquee.additive ? [...new Set([...selectedFixtureIds, ...fixtures])] : fixtures); const selected = ids.filter((id) => trusses.some((t) => t.id === id)); setSelectedLayoutTrussIds(marquee.additive ? [...new Set([...selectedLayoutTrussIds, ...selected])] : selected); setSelectedTrussId(selected[0] ?? null); setMarquee(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return } if (trussDragRef.current) { const item = trussDragRef.current.current; trussDragRef.current = null; setTrussDraft(null); setPreviewTrusses(trusses.map((truss) => truss.id === item.id ? item : truss)); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return } if (!dragRef.current) return; const drag = dragRef.current; dragRef.current = null; setDragPositions(null); const tray = storageTrayRef.current?.getBoundingClientRect(); if (tray && event.clientX >= tray.left && event.clientX <= tray.right && event.clientY >= tray.top && event.clientY <= tray.bottom) { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of Object.keys(drag.positions)) state.updateFixture(id, { inStorage: true }); state.endHistoryGroup(); selectFixtures([]); return } setFixturePositions(Object.fromEntries(Object.entries(drag.positions).map(([id, position]) => [id, snapFixtureToTruss(position, trusses)]))); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onPointerCancel={() => { if (fixtureHandleRef.current) { const f = fixtureHandleRef.current.fixture; useShowStore.getState().updateFixture(f.id, { iconSize: f.iconSize, rotation: f.rotation }); fixtureHandleRef.current = null; useShowStore.getState().endHistoryGroup() } setMarquee(null); dragRef.current = null; setDragPositions(null); trussDragRef.current = null; setTrussDraft(null) }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Stage glow background */}
        <defs>
          <radialGradient id="stageGlow" cx="50%" cy="95%" r="65%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--bg)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="800" height="340" fill="url(#stageGlow)" onPointerDown={(event) => { if (!editing) return; const start = pointAt(event); if (!start) return; event.preventDefault(); setMarquee({ start, current: start, additive: event.shiftKey }); svgRef.current?.setPointerCapture(event.pointerId) }} onClick={() => { if (!editing) selectFixtures([]) }} />

        {/* Projects created before truss editing retain the original illustration. */}
        {show?.previewTrusses === undefined && <g pointerEvents="none" fill="none" stroke="var(--line)"><path d="M 40 80 Q 400 38 760 80" strokeWidth="3" /><path d="M 40 92 Q 400 50 760 92" strokeWidth="2" opacity="0.7" /></g>}
        {trusses.map((savedTruss) => { const truss = trussDraft?.id === savedTruss.id ? trussDraft : savedTruss; return <g key={truss.id} transform={`translate(${truss.x} ${truss.y}) rotate(${truss.rotation})`} onPointerDown={(event) => { if (!editing) return; event.preventDefault(); event.stopPropagation(); const start = pointAt(event); if (!start) return; setSelectedTrussId(truss.id); trussDragRef.current = { mode: 'move', start, original: truss, current: truss }; svgRef.current?.setPointerCapture(event.pointerId) }} style={{ cursor: editing ? 'grab' : 'default', touchAction: 'none' }}>
          <path d={truss.shape === 'u' ? `M ${-truss.width / 2} ${truss.height / 2} V ${-truss.height / 2} H ${truss.width / 2} V ${truss.height / 2}` : `M ${-truss.width / 2} 0 H ${truss.width / 2}`} fill="none" stroke={(selectedTrussId === truss.id || selectedLayoutTrussIds.includes(truss.id)) && editing ? 'var(--sel)' : 'var(--line)'} strokeWidth="8" strokeLinecap="round" />
          <path d={truss.shape === 'u' ? `M ${-truss.width / 2} ${truss.height / 2} V ${-truss.height / 2} H ${truss.width / 2} V ${truss.height / 2}` : `M ${-truss.width / 2} 0 H ${truss.width / 2}`} fill="none" stroke="var(--text)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="5 5" />
          {editing && selectedTrussId === truss.id && <>
            <rect x={-truss.width / 2} y={truss.shape === 'u' ? -truss.height / 2 : -6} width={truss.width} height={truss.shape === 'u' ? truss.height : 12} fill="none" stroke="var(--sel)" strokeWidth="1" strokeDasharray="4 3" pointerEvents="none" />
            <rect x={truss.width / 2 - 6} y={(truss.shape === 'u' ? truss.height / 2 : 0) - 6} width="12" height="12" fill="var(--text)" stroke="var(--accent)" strokeWidth="2" style={{ cursor: 'nwse-resize' }} aria-label={`Resize ${truss.name}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); const start = pointAt(event); if (!start) return; trussDragRef.current = { mode: 'resize', start, original: truss, current: truss }; svgRef.current?.setPointerCapture(event.pointerId) }} />
            <line x1="0" y1={truss.shape === 'u' ? -truss.height / 2 : -6} x2="0" y2={(truss.shape === 'u' ? -truss.height / 2 : -6) - 20} stroke="var(--sel)" strokeWidth="1.5" pointerEvents="none" />
            <circle cx="0" cy={(truss.shape === 'u' ? -truss.height / 2 : -6) - 20} r="7" fill="var(--text)" stroke="var(--accent)" strokeWidth="2" style={{ cursor: 'grab' }} aria-label={`Rotate ${truss.name}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); const start = pointAt(event); if (!start) return; trussDragRef.current = { mode: 'rotate', start, original: truss, current: truss }; svgRef.current?.setPointerCapture(event.pointerId) }}><title>Drag to rotate</title></circle>
          </>}
          {editing && <text x="0" y="-10" transform={`rotate(${-truss.rotation} 0 -10)`} textAnchor="middle" fill="var(--text)" fontSize="8">{truss.name}</text>}
        </g>})}

        <StageObjectLayer editing={editing} selectedId={selectedStageObjectId} select={(id) => { setSelectedStageObjectId(id); setSelectedTrussId(null); selectFixtures([]) }} />
        {/* Beams */}
        {fixtureViews.map((f) => {
          const x = f.pos.x
          const y = f.pos.y
          const on = f.intensity > 0
          const op = Math.min(f.intensity / 255, 1)
          // Truss fixtures aim down at the deck; floor fixtures aim up.
          const appearance = previewBeamAppearance(f, f.pos, f.color)
          const top = y + 4
          const bottom = y + 150
          const selectable = fixtures.length > 0
          const selected = selectable && selectedFixtureIds.includes(f.id)
          return (
            <g
              key={f.id}
              role={selectable ? 'button' : undefined}
              tabIndex={selectable ? 0 : undefined}
              aria-label={selectable ? f.name : undefined}
              aria-pressed={selectable ? selected : undefined}
              style={selectable ? { cursor: editing ? 'grab' : 'pointer', touchAction: 'none' } : undefined}
              onPointerDown={selectable && editing ? (event) => { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) { selectFixtures(selectedFixtureIds.includes(f.id) ? selectedFixtureIds.filter((id) => id !== f.id) : [...selectedFixtureIds, f.id]); return } const ids = selectedFixtureIds.includes(f.id) ? selectedFixtureIds : [f.id]; if (!selectedFixtureIds.includes(f.id)) selectFixtures(ids); const position = pointAt(event); if (position) { const originals = Object.fromEntries(fixtureViews.filter((fixture) => ids.includes(fixture.id)).map((fixture) => [fixture.id, fixture.pos])); dragRef.current = { start: position, originals, positions: originals }; setDragPositions(originals); svgRef.current?.setPointerCapture(event.pointerId) } } : undefined}
              onClick={
                selectable
                  ? (event) => {
                      event.stopPropagation()
                      if (!editing) selectFixture(f.id, event.shiftKey)
                    }
                  : undefined
              }
              onKeyDown={
                selectable
                  ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      selectFixture(f.id, event.shiftKey)
                    }
                  : undefined
              }
            >
              {on && (
                <polygon
                  pointerEvents="none"
                  points={`${x - 7},${top} ${x + 7},${top} ${x + 34},${bottom} ${x - 34},${bottom}`}
                  transform={`rotate(${appearance.direction} ${x} ${y})`}
                  fill={appearance.color}
                  fillOpacity={op * 0.28}
                  stroke={appearance.color}
                  strokeOpacity={op * 0.45}
                  strokeWidth="1"
                />
              )}
              {selectable && f.namePosition !== 'hidden' && <text x={x} y={f.namePosition === 'below' ? y + 20 : y - 13} textAnchor="middle" fill="var(--text)" fontSize="8" paintOrder="stroke" stroke="var(--bg)" strokeWidth="2">{f.name}</text>}
              <g transform={`translate(${x} ${y}) rotate(${f.rotation ?? 0}) scale(${(f.iconSize ?? 10) / 10}) translate(${-x} ${-y})`}>
              <line x1={x} y1={y} x2={x} y2={y - 8} stroke="var(--text)" strokeWidth="1.5" />
              {selected && (
                <circle
                  cx={x}
                  cy={y}
                  r="9"
                  fill="var(--accent)"
                  fillOpacity="0.22"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r="5"
                fill={on ? f.color : 'var(--panel2)'}
                stroke={selected ? 'var(--accent)' : 'var(--line)'}
                strokeWidth={selected ? '2' : '1.5'}
              />
              </g>
              <circle
                cx={x}
                cy={y}
                r="16"
                fill="transparent"
                pointerEvents="all"
                aria-hidden="true"
              />
              {editing && selected && (['resize', 'rotate'] as const).map((mode) => <rect key={mode} x={x + (mode === 'resize' ? 12 : -4)} y={y + (mode === 'resize' ? 8 : -28)} width="8" height="8" fill="var(--text)" stroke="var(--accent)" style={{ cursor: mode === 'resize' ? 'nwse-resize' : 'grab' }} aria-label={`${mode} ${f.name}`} onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); const start = pointAt(event); if (!start) return; useShowStore.getState().beginHistoryGroup(); fixtureHandleRef.current = { fixture: f, mode, centre: { x, y }, start }; svgRef.current?.setPointerCapture(event.pointerId) }} />)}
            </g>
          )
        })}

        {/* Stage deck */}
        <rect x="30" y="296" width="740" height="28" rx="3" fill="var(--panel)" stroke="var(--line)" />
        <line x1="30" y1="296" x2="770" y2="296" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />

        {/* Performer silhouettes */}
        <g fill="var(--bg)" opacity="0.9">
          <circle cx="340" cy="284" r="6" />
          <path d="M 335 290 Q 340 288 345 290 L 346 306 L 334 306 Z" />
          <circle cx="450" cy="284" r="6" />
          <path d="M 445 290 Q 450 288 455 290 L 456 306 L 444 306 Z" />
        </g>

        {fixtures.length === 0 && (
          <text x="400" y="200" textAnchor="middle" fill="var(--dim)" fontSize="9" letterSpacing="0.08em">
            DEMO RIG — NO FIXTURES PATCHED
          </text>
        )}
      {marquee && <rect x={Math.min(marquee.start.x, marquee.current.x)} y={Math.min(marquee.start.y, marquee.current.y)} width={Math.abs(marquee.current.x - marquee.start.x)} height={Math.abs(marquee.current.y - marquee.start.y)} fill="var(--sel)" fillOpacity="0.12" stroke="var(--sel)" strokeWidth="1" pointerEvents="none" />}
      </svg>
    </div>
  )
}

