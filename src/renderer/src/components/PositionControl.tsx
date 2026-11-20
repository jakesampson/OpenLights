import type { FixtureDef } from '@shared/types'
import { fixtureAttributes } from '../lib/automationRuntime'
import { positionFractions, positionValues } from '../lib/position'
import { useShowStore } from '../stores/showStore'
import { useDragEnd } from './useDragEnd'
import { useRef } from 'react'
export function PositionControl({ fixtures, update, current }: { fixtures: FixtureDef[]; update: (values: Record<string, number>) => void; current?: { pan: number; tilt: number } }) {
  // The pad only moves while pointer capture is held, so a missed
  // pointerup cannot drift the value — but it would leave the history
  // group open. The same drag-end guard as FillFader ends the group on
  // a window pointerup / pointercancel / blur, a button-less move, or
  // lost capture. endHistoryGroup only clears flags, so calling it from
  // both pointerup and lost-capture is safe.
  const drag = useDragEnd()
  // Axis-lock start values live above the early return: hooks must run
  // on every render, even when no fixture qualifies for the pad.
  const dragStartRef = useRef<{ pan: number; tilt: number } | null>(null)
  if (!fixtures.length || !fixtures.every((f) => ['pan', 'tilt'].every((key) => fixtureAttributes(f).includes(key)))) return null
  const first = fixtures[0]
  // Axis locks (Guide ch.8, p.93): hold Ctrl (the guide's Command key on
  // Windows) to lock the pan angle, Shift to lock the tilt angle, while
  // clicking or dragging. The locked axis holds its value from drag start,
  // captured here so the live value cannot drift mid-drag.
  const setPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const rawX = (event.clientX - rect.left) / rect.width
    const rawY = (event.clientY - rect.top) / rect.height
    const start = dragStartRef.current
    const x = event.ctrlKey && start ? start.pan : rawX
    const y = event.shiftKey && start ? start.tilt : rawY
    update(positionValues(x, y, fixtureAttributes(first)))
  }
  const endDrag = () => { drag.end(); useShowStore.getState().endHistoryGroup() }
  return <div className="flex flex-wrap items-center gap-2 text-xs"><div role="slider" aria-label="Pan and tilt position pad" aria-valuemin={0} aria-valuemax={255} tabIndex={0} title="Drag to move. Hold Ctrl to lock pan, Shift to lock tilt." className="h-20 w-28 cursor-crosshair rounded border border-line bg-panel2" style={{ touchAction: 'none', backgroundImage: 'linear-gradient(transparent 49%, var(--line) 50%, transparent 51%),linear-gradient(90deg, transparent 49%, var(--line) 50%, transparent 51%)' }} onPointerDown={(e) => { useShowStore.getState().beginHistoryGroup(); drag.begin(); dragStartRef.current = current ?? { pan: 0.5, tilt: 0.5 }; e.currentTarget.setPointerCapture(e.pointerId); setPosition(e) }} onPointerMove={(e) => { if (e.buttons === 0) { endDrag(); return } if (e.currentTarget.hasPointerCapture(e.pointerId)) setPosition(e) }} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={(e) => { if (e.key === 'Home') { e.preventDefault(); update(positionValues(0.5, 0.5, fixtureAttributes(first))) } }} />{(['invertPan', 'invertTilt', 'swapPanTilt'] as const).map((key) => <label key={key}><input type="checkbox" checked={first.positionOptions?.[key] ?? false} onChange={(e) => { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const f of fixtures) state.updateFixture(f.id, { positionOptions: { ...f.positionOptions, [key]: e.target.checked } }); state.endHistoryGroup() }} /> {key}</label>)}</div>
}
