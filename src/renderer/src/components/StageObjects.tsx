import { useEffect, useRef } from 'react'
import type { StageObject } from '@shared/types'
import { useShowStore } from '../stores/showStore'
type Props = { editing: boolean; selectedId: string | null; select: (id: string | null) => void }
export function StageObjectLayer({ editing, selectedId, select }: Props) {
  const objects = useShowStore((s) => s.show?.stageObjects ?? [])
  const drag = useRef<{ original: StageObject; x: number; y: number; current: StageObject } | null>(null)
  const point = (event: React.PointerEvent<SVGGElement>) => { const svg = event.currentTarget.ownerSVGElement!, matrix = svg.getScreenCTM(); if (!matrix) return null; const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(matrix.inverse()) }
  return <g>{objects.filter((o) => o.kind !== 'truss').map((o) => <g key={o.id} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation}) scale(${o.flipX ? -1 : 1} ${o.flipY ? -1 : 1})`} opacity={o.opacity ?? 1} fill={o.fill ?? 'var(--panel2)'} stroke={selectedId === o.id && editing ? 'var(--accent)' : o.stroke ?? 'var(--line)'} style={{ cursor: editing ? 'grab' : 'default', touchAction: 'none' }} onPointerDown={(e) => { if (!editing) return; e.preventDefault(); e.stopPropagation(); const p = point(e); if (!p) return; select(o.id); drag.current = { original: o, current: o, x: p.x, y: p.y }; useShowStore.getState().beginHistoryGroup(); e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={(e) => { const d = drag.current, p = point(e); if (!d || !p) return; e.stopPropagation(); d.current = { ...d.original, x: Math.round(d.original.x + p.x - d.x), y: Math.round(d.original.y + p.y - d.y) }; useShowStore.getState().updateStageObject(o.id, { x: d.current.x, y: d.current.y }) }} onPointerUp={(e) => { if (!drag.current) return; e.stopPropagation(); drag.current = null; useShowStore.getState().endHistoryGroup(); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }} onPointerCancel={() => { if (drag.current) useShowStore.getState().updateStageObject(o.id, drag.current.original); drag.current = null; useShowStore.getState().endHistoryGroup() }}>
    {o.kind === 'rectangle' && <rect x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} />}
    {o.kind === 'screen' && <><rect x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} fill="rgba(10,132,255,0.10)" stroke="#0A84FF" strokeWidth="2" /><text textAnchor="middle" dominantBaseline="middle" fontSize={13} stroke="none" fill="#0A84FF">Screen</text></>}
    {o.kind === 'ellipse' && <ellipse rx={o.width / 2} ry={o.height / 2} />}
    {o.kind === 'line' && <line x1={-o.width / 2} y1={-o.height / 2} x2={o.width / 2} y2={o.height / 2} strokeWidth="3" />}
    {o.kind === 'text' && <text textAnchor="middle" dominantBaseline="middle" fontSize={o.fontSize ?? 14} stroke="none">{o.text ?? o.name}</text>}
    {o.kind === 'image' && o.imageSrc && <image href={o.imageSrc} x={-o.width / 2} y={-o.height / 2} width={o.width} height={o.height} />}
    {editing && selectedId === o.id && <rect x={-o.width / 2 - 2} y={-o.height / 2 - 2} width={o.width + 4} height={o.height + 4} fill="none" stroke="var(--accent)" strokeDasharray="3 2" />}
  </g>)}</g>
}
export function StageObjectTools({ editing, selectedId, select, variant = 'overlay' }: Props & {
  // 'overlay' is the old on-canvas row; 'panel' docks the same tools in the
  // right side panel in edit mode (LightKey's Inspector, Guide p.53) so
  // the canvas stays clean.
  variant?: 'overlay' | 'panel'
}) {
  const { show, addStageObject, updateStageObject } = useShowStore()
  const selected = show?.stageObjects?.find((o) => o.id === selectedId)
  const imageInput = useRef<HTMLInputElement>(null)
  const add = (kind: StageObject['kind'], imageSrc?: string) => { const object: StageObject = { id: crypto.randomUUID(), name: kind === 'text' ? 'Stage label' : kind, kind, x: 400, y: 170, width: 120, height: kind === 'line' ? 4 : 60, rotation: 0, fill: '#50275e', stroke: '#a06ab3', opacity: 1, text: kind === 'text' ? 'Stage label' : undefined, fontSize: 14, imageSrc }; addStageObject(object); select(object.id) }
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
  return <div className={variant === 'panel' ? 'rounded border border-line bg-panel p-2 text-xs' : 'absolute left-3 top-14 z-10 max-w-[50%] rounded border border-line bg-panel p-2 text-xs'}><div className="flex flex-wrap gap-1">{(['rectangle', 'ellipse', 'line', 'text'] as const).map((kind) => <button key={kind} className="rounded bg-panel2 px-2 py-1 capitalize" onClick={() => add(kind)}>+ {kind}</button>)}<button className="rounded bg-panel2 px-2 py-1" onClick={() => imageInput.current?.click()}>+ Image</button><input ref={imageInput} type="file" accept="image/*" aria-label="Stage image file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file || !file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = () => add('image', String(reader.result)); reader.readAsDataURL(file); e.target.value = '' }} /></div>
    {selected && <div className="mt-2 flex max-w-xl flex-wrap items-end gap-2">{(['name', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'text', 'fontSize'] as const).filter((key) => selected.kind === 'text' || (key !== 'text' && key !== 'fontSize')).map((key) => <label key={key} className="text-[10px] capitalize">{key}<input aria-label={`Stage object ${key}`} type={key === 'name' || key === 'text' ? 'text' : 'number'} step={key === 'opacity' ? '0.1' : '1'} value={selected[key] ?? ''} onChange={(e) => updateStageObject(selected.id, { [key]: key === 'name' || key === 'text' ? e.target.value : Number(e.target.value) })} className="block w-20 rounded bg-panel2 p-1 text-xs" /></label>)}{(['fill', 'stroke'] as const).map((key) => <label key={key} className="text-[10px] capitalize">{key}<input type="color" aria-label={`Stage object ${key}`} value={selected[key]?.startsWith('#') ? selected[key] : '#50275e'} onChange={(e) => updateStageObject(selected.id, { [key]: e.target.value })} className="block h-6 w-10" /></label>)}<button className="text-dim" onClick={() => useShowStore.getState().copyStageObjects([selected.id])}>Copy</button><button className="text-dim" onClick={() => select(useShowStore.getState().pasteStageObjects()[0] ?? selected.id)}>Paste</button><button className="text-dim" onClick={() => select(useShowStore.getState().duplicateStageObjects([selected.id])[0] ?? selected.id)}>Duplicate</button>{(['x', 'y'] as const).map((axis) => <button key={axis} className="text-dim" onClick={() => useShowStore.getState().flipStageObjects([selected.id], axis)}>Flip {axis.toUpperCase()}</button>)}{(['front', 'back'] as const).map((side) => <button key={side} className="text-dim" onClick={() => useShowStore.getState().orderStageObjects([selected.id], side)}>{side}</button>)}<button className="text-red-300" onClick={() => { useShowStore.getState().removeStageObjects([selected.id]); select(null) }}>Delete</button><button className="text-dim" onClick={() => select(null)}>Close</button></div>}
  </div>
}
