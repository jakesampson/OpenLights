import { useEffect, useRef, useState } from 'react'
import type { StageObject } from '@shared/types'
import { useShowStore } from '../stores/showStore'
import { getAmbienceTransitionMs } from '../lib/ndiAmbience'
import { useNdiFrame, useNdiSession } from '../lib/ndiSession'
type Props = { editing: boolean; selectedId: string | null; select: (id: string | null) => void }
export function StageObjectLayer({ editing, selectedId, select }: Props) {
  const objects = useShowStore((s) => s.show?.stageObjects ?? [])
  // Live video preview on the Screen (Jake, 23 Nov 2026): while
  // Ambience runs, the Screen shows the feed as a small live picture
  // instead of the blue rectangle. It fades in when Ambience comes on
  // and out when it stops, over the same transition as the colour
  // smoothing (default 500 ms, 0 = instant).
  const ndiFrame = useNdiFrame()
  const ndiActive = useNdiSession().active
  const [videoIn, setVideoIn] = useState(false)
  useEffect(() => {
    if (ndiActive && ndiFrame) {
      // Mount at opacity 0, then fade in on the next frame — the first
      // picture glides in instead of popping in.
      const raf = requestAnimationFrame(() => setVideoIn(true))
      return () => cancelAnimationFrame(raf)
    }
    setVideoIn(false)
  }, [ndiActive, ndiFrame])
  const fadeMs = getAmbienceTransitionMs()
  const drag = useRef<{ original: StageObject; x: number; y: number; current: StageObject } | null>(null)
  const point = (event: React.PointerEvent<SVGGElement>) => { const svg = event.currentTarget.ownerSVGElement!, matrix = svg.getScreenCTM(); if (!matrix) return null; const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(matrix.inverse()) }
  return <g>{objects.filter((o) => o.kind !== 'truss').map((o) => <g key={o.id} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation}) scale(${o.flipX ? -1 : 1} ${o.flipY ? -1 : 1})`} opacity={o.opacity ?? 1} fill={o.fill ?? 'var(--panel2)'} stroke={selectedId === o.id && editing ? '#0A84FF' : o.stroke ?? 'var(--line)'} style={{ cursor: editing ? 'grab' : 'default', touchAction: 'none' }} onPointerDown={(e) => { if (!editing) return; e.preventDefault(); e.stopPropagation(); const p = point(e); if (!p) return; select(o.id); drag.current = { original: o, current: o, x: p.x, y: p.y }; useShowStore.getState().beginHistoryGroup(); e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={(e) => { const d = drag.current, p = point(e); if (!d || !p) return; e.stopPropagation(); d.current = { ...d.original, x: Math.round(d.original.x + p.x - d.x), y: Math.round(d.original.y + p.y - d.y) }; useShowStore.getState().updateStageObject(o.id, { x: d.current.x, y: d.current.y }) }} onPointerUp={(e) => { if (!drag.current) return; e.stopPropagation(); drag.current = null; useShowStore.getState().endHistoryGroup(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }} onPointerCancel={() => { if (drag.current) useShowStore.getState().updateStageObject(o.id, drag.current.original); drag.current = null; useShowStore.getState().endHistoryGroup() }}>
    {o.kind === 'rectangle' && <rect x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} />}
    {o.kind === 'rounded-rectangle' && <rect x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} rx="8" />}
    {o.kind === 'triangle' && <polygon points={`0,${-o.height / 2} ${o.width / 2},${o.height / 2} ${-o.width / 2},${o.height / 2}`} />}
    {o.kind === 'screen' && <><rect x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} fill="rgba(10,132,255,0.10)" stroke="#0A84FF" strokeWidth="2" />{ndiFrame && <image href={ndiFrame} x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} preserveAspectRatio="xMidYMid slice" opacity={videoIn ? 1 : 0} style={{ transition: `opacity ${fadeMs}ms ease`, pointerEvents: 'none' }} />}<text textAnchor="middle" dominantBaseline="middle" fontSize={13} stroke="none" fill="#0A84FF" opacity={videoIn ? 0 : 1} style={{ transition: `opacity ${fadeMs}ms ease` }}>Screen</text></>}
    {o.kind === 'ellipse' && <ellipse rx={o.width / 2} ry={o.height / 2} />}
    {o.kind === 'line' && <line x1={-o.width / 2} y1={-o.height / 2} x2={o.width / 2} y2={o.height / 2} strokeWidth="3" />}
    {o.kind === 'text' && <text textAnchor="middle" dominantBaseline="middle" fontSize={o.fontSize ?? 14} stroke="none">{o.text ?? o.name}</text>}
    {o.kind === 'image' && o.imageSrc && <image href={o.imageSrc} x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} />}
    {editing && selectedId === o.id && <rect x={-o.width / 2 - 2} y={-o.height / 2 - 2} width={o.width + 4} height={o.height + 4} fill="none" stroke="#0A84FF" strokeDasharray="3 2" />}
  </g>)}</g>
}
// LightKey's Inspector shape tools (Guide p.65): a Shapes / Images
// tabbed grid — click a tool to place it on the Preview. The grid holds
// the shapes LightKey lists (rectangles, rounded rectangles, ovals,
// triangles, lines, and the truss types) plus the text tool; trusses
// are drawing tools here, not a separate Layout section.
const SHAPE_GLYPHS: Record<string, React.ReactNode> = {
  rectangle: <rect x="3" y="6" width="14" height="10" />,
  'rounded-rectangle': <rect x="3" y="6" width="14" height="10" rx="2.5" />,
  ellipse: <ellipse cx="10" cy="11" rx="7" ry="5" />,
  triangle: <polygon points="10,4 17,18 3,18" />,
  line: <line x1="4" y1="17" x2="16" y2="5" />,
  truss: <path d="M3 7h14M3 15h14M6 7v8M10 7v8M14 7v8" />,
  'curved-truss': <path d="M3 17A14 14 0 0 1 17 3M6 17A11 11 0 0 1 17 6M3 17h3M17 3v3M8 15l3-3" />,
  'circular-truss': <><circle cx="10" cy="11" r="7" /><circle cx="10" cy="11" r="3.5" /></>,
  text: <path d="M5 5h10M10 5v12" />
}
const SHAPE_TOOLS: { id: string; label: string }[] = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'rounded-rectangle', label: 'Rounded rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'line', label: 'Line' },
  { id: 'truss', label: 'Truss' },
  { id: 'curved-truss', label: 'Curved truss' },
  { id: 'circular-truss', label: 'Circular truss' },
  { id: 'text', label: 'Text' }
]
export function StageObjectTools({ editing, selectedId, select }: Props) {
  const { show, addStageObject, updateStageObject } = useShowStore()
  const selected = show?.stageObjects?.find((o) => o.id === selectedId)
  const imageInput = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'shapes' | 'images'>('shapes')
  const add = (kind: StageObject['kind'], imageSrc?: string) => { const object: StageObject = { id: crypto.randomUUID(), name: kind === 'text' ? 'Stage label' : kind === 'rounded-rectangle' ? 'Rounded rectangle' : kind, kind, x: 400, y: 170, width: 120, height: kind === 'line' ? 4 : 60, rotation: 0, fill: '#50275e', stroke: '#a06ab3', opacity: 1, text: kind === 'text' ? 'Stage label' : undefined, fontSize: 14, imageSrc }; addStageObject(object); select(object.id) }
  const addTruss = (shape: 'straight' | 'curved' | 'circular') => {
    const state = useShowStore.getState()
    const item = { id: crypto.randomUUID(), name: 'Truss', shape, x: 400, y: 170, width: 200, height: shape === 'straight' ? 100 : 200, rotation: 0, ...(shape === 'curved' ? { startAngle: -90, endAngle: 0 } : {}) }
    state.setPreviewTrusses([...(state.show?.previewTrusses ?? []), item])
    state.setSelectedPreviewTrussId(item.id)
  }
  useEffect(() => {
    if (!editing || !selectedId) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) return
      const state = useShowStore.getState()
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { state.copyStageObjects([selectedId]); event.preventDefault() }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { select(state.pasteStageObjects()[0] ?? selectedId); event.preventDefault() }
      else if (event.key === 'Delete') { state.removeStageObjects([selectedId]); select(null); event.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, selectedId])
  if (!editing) return null
  return <div className="rounded border border-line bg-panel p-2 text-xs">
    <div role="tablist" aria-label="Inspector shapes" className="flex gap-1 border-b border-line pb-1">
      {(['shapes', 'images'] as const).map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`rounded px-2 py-1 capitalize ${tab === name ? 'bg-panel2 font-semibold text-text' : 'text-dim'}`}>{name}</button>)}
    </div>
    {tab === 'shapes' ? (
      <div className="mt-2 grid grid-cols-5 gap-1">
        {SHAPE_TOOLS.map((tool) => <button key={tool.id} type="button" aria-label={`Add ${tool.label}`} title={tool.label} onClick={() => { if (tool.id === 'truss') addTruss('straight'); else if (tool.id === 'curved-truss') addTruss('curved'); else if (tool.id === 'circular-truss') addTruss('circular'); else add(tool.id as StageObject['kind']) }} className="flex h-9 items-center justify-center rounded bg-panel2 text-text hover:bg-panel"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{SHAPE_GLYPHS[tool.id]}</svg></button>)}
      </div>
    ) : (
      <div className="mt-2 flex flex-col gap-1">
        <button type="button" className="rounded bg-panel2 px-2 py-1" onClick={() => imageInput.current?.click()}>Add image…</button>
        <p className="text-[10px] text-dim">Add a custom image to the Preview.</p>
        <input ref={imageInput} type="file" accept="image/*" aria-label="Stage image file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file || !file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = () => add('image', String(reader.result)); reader.readAsDataURL(file); e.target.value = '' }} />
      </div>
    )}
    {selected && <div className="mt-2 flex max-w-xl flex-wrap items-end gap-2">{(['name', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'text', 'fontSize'] as const).filter((key) => selected.kind === 'text' || (key !== 'text' && key !== 'fontSize')).map((key) => <label key={key} className="text-[10px] capitalize">{key}<input aria-label={`Stage object ${key}`} type={key === 'name' || key === 'text' ? 'text' : 'number'} step={key === 'opacity' ? '0.1' : '1'} value={selected[key] ?? ''} onChange={(e) => updateStageObject(selected.id, { [key]: key === 'name' || key === 'text' ? e.target.value : Number(e.target.value) })} className="block w-20 rounded bg-panel2 p-1 text-xs" /></label>)}{(['fill', 'stroke'] as const).map((key) => <label key={key} className="text-[10px] capitalize">{key}<input type="color" aria-label={`Stage object ${key}`} value={selected[key]?.startsWith('#') ? selected[key] : '#50275e'} onChange={(e) => updateStageObject(selected.id, { [key]: e.target.value })} className="block h-6 w-10" /></label>)}<button className="text-dim" onClick={() => useShowStore.getState().copyStageObjects([selected.id])}>Copy</button><button className="text-dim" onClick={() => select(useShowStore.getState().pasteStageObjects()[0] ?? selected.id)}>Paste</button><button className="text-dim" onClick={() => select(useShowStore.getState().duplicateStageObjects([selected.id])[0] ?? selected.id)}>Duplicate</button>{(['x', 'y'] as const).map((axis) => <button key={axis} className="text-dim" onClick={() => useShowStore.getState().flipStageObjects([selected.id], axis)}>Flip {axis.toUpperCase()}</button>)}{(['front', 'back'] as const).map((side) => <button key={side} className="text-dim" onClick={() => useShowStore.getState().orderStageObjects([selected.id], side)}>{side}</button>)}<button className="text-red-300" onClick={() => { useShowStore.getState().removeStageObjects([selected.id]); select(null) }}>Delete</button><button className="text-dim" onClick={() => select(null)}>Close</button></div>}
  </div>
}
