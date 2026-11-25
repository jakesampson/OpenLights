import type { FixtureDef } from '@shared/types'
import { fixtureAttributes } from '../lib/automationRuntime'
import { flipPosition, positionDegrees, positionFractions, positionFromPoint, positionPoint, positionValues } from '../lib/position'
import { useShowStore } from '../stores/showStore'
import { useDragEnd } from './useDragEnd'
import { useEffect, useRef, useState } from 'react'

// LightKey's position control is a CIRCLE (Guide ch.8, pp.90–91): the
// angle around the circle is the pan angle (home at the top), the
// distance from the centre is the tilt, and the centre is home (pan 0°,
// tilt 0°). The dot is red in the negative pan range and green in the
// positive pan range, lighter for negative tilt; the shaded outer ring
// marks tilt beyond 90° (2/3 of the ±135° tilt range). There are no
// invert/swap checkboxes — LightKey reverses an angle with Flip Pan /
// Flip Tilt from the control's shortcut menu (p.93), a one-off change
// to the value. The old persistent per-fixture invert/swap options
// were our own addition (first Codex run, no guide citation) and are
// removed with this control.
const SIZE = 112
const CENTRE = SIZE / 2
const RIM = 54
// Tilt 90° sits at 90/135 of the radius — everything outside this ring
// is the shaded beyond-90° zone.
const BEYOND_90 = (RIM * 2) / 3
export function PositionControl({ fixtures, update, current }: { fixtures: FixtureDef[]; update: (values: Record<string, number>) => void; current?: { pan: number; tilt: number } }) {
  // The pad only moves while pointer capture is held, so a missed
  // pointerup cannot drift the value — but it would leave the history
  // group open. The same drag-end guard as FillFader ends the group on
  // a window pointerup / pointercancel / blur, a button-less move, or
  // lost capture. endHistoryGroup only clears flags, so calling it from
  // both pointerup and lost-capture is safe.
  const drag = useDragEnd()
  // Axis-lock start values live above the early return: hooks must run
  // on every render, even when no fixture qualifies for the control.
  const dragStartRef = useRef<{ pan: number; tilt: number } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // The drag measures the pointer against the svg's box — frozen at
  // drag start, not re-read per move. The degrees readout under the
  // control widens as the values grow, which widens the column and
  // shifts the svg right mid-drag; re-reading the box each move fed
  // that shift back into the measurement, so a horizontal drag stopped
  // short (the probe's +30px drag read Tilt +56° instead of +73°).
  const dragRectRef = useRef<DOMRect | null>(null)
  useEffect(() => {
    if (!menu) return
    const closeOutside = (event: PointerEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node | null)) setMenu(null) }
    window.addEventListener('pointerdown', closeOutside)
    return () => window.removeEventListener('pointerdown', closeOutside)
  }, [menu])
  if (!fixtures.length || !fixtures.every((f) => ['pan', 'tilt'].every((key) => fixtureAttributes(f).includes(key)))) return null
  const first = fixtures[0]
  const now = current ?? { pan: 0.5, tilt: 0.5 }
  const degrees = positionDegrees(now.pan, now.tilt)
  const dot = positionPoint(now.pan, now.tilt)
  const dotFill = now.pan < 0.5 ? '#ef4444' : now.pan > 0.5 ? '#22c55e' : '#e5e7eb'
  // Axis locks (Guide ch.8, p.93): hold Ctrl (the guide's Command key on
  // Windows) to lock the pan angle, Shift to lock the tilt angle, while
  // clicking or dragging. The locked axis holds its value from drag start,
  // captured here so the live value cannot drift mid-drag. A point fixes
  // the pan angle and the tilt magnitude, not the tilt sign — the guide's
  // circle shows both tilt signs at the same point (p.91) — so the sign
  // is kept from drag start and only changes via Flip Tilt below.
  const setPosition = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = dragRectRef.current ?? svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    const start = dragStartRef.current ?? now
    const tiltSign: 1 | -1 = start.tilt >= 0.5 ? 1 : -1
    const point = positionFromPoint(x, y, tiltSign)
    const pan = event.ctrlKey ? start.pan : point.pan
    const tilt = event.shiftKey ? start.tilt : point.tilt
    update(positionValues(pan, tilt, fixtureAttributes(first)))
  }
  const endDrag = () => { drag.end(); dragRectRef.current = null; useShowStore.getState().endHistoryGroup() }
  const flip = (axis: 'pan' | 'tilt') => {
    setMenu(null)
    const flipped = flipPosition(now.pan, now.tilt, axis)
    update(positionValues(flipped.pan, flipped.tilt, fixtureAttributes(first)))
  }
  return <div className="relative flex items-center gap-2 text-xs">
    <svg ref={svgRef} role="slider" aria-label="Pan and tilt position control" aria-valuemin={0} aria-valuemax={255} aria-valuetext={`Pan ${degrees.pan >= 0 ? '+' : ''}${Math.round(degrees.pan)}°, Tilt ${degrees.tilt >= 0 ? '+' : ''}${Math.round(degrees.tilt)}°`} tabIndex={0} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="position-circle" style={{ touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={(e) => { useShowStore.getState().beginHistoryGroup(); drag.begin(); dragStartRef.current = now; dragRectRef.current = e.currentTarget.getBoundingClientRect(); e.currentTarget.setPointerCapture(e.pointerId); setPosition(e) }}
      onPointerMove={(e) => { if (e.buttons === 0) { endDrag(); return } if (e.currentTarget.hasPointerCapture(e.pointerId)) setPosition(e) }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && menu) { e.preventDefault(); e.stopPropagation(); setMenu(null); return }
        if (e.key === 'Home') { e.preventDefault(); update(positionValues(0.5, 0.5, fixtureAttributes(first))) }
      }}>
      <title>Drag to move. Hold Ctrl to lock pan, Shift to lock tilt. Right-click for Flip Pan / Flip Tilt.</title>
      {/* Shaded outer ring: tilt beyond 90° (Guide p.91). */}
      <circle cx={CENTRE} cy={CENTRE} r={RIM} fill="rgba(0,0,0,0.18)" stroke="var(--line)" strokeWidth="1" />
      <circle cx={CENTRE} cy={CENTRE} r={BEYOND_90} fill="var(--panel2)" stroke="var(--line)" strokeWidth="0.5" />
      <line x1={CENTRE} y1={CENTRE - RIM} x2={CENTRE} y2={CENTRE + RIM} stroke="var(--line)" strokeWidth="0.5" />
      <line x1={CENTRE - RIM} y1={CENTRE} x2={CENTRE + RIM} y2={CENTRE} stroke="var(--line)" strokeWidth="0.5" />
      {/* Home marker at the top (Guide p.91: the home angle). */}
      <polygon points={`${CENTRE},2 ${CENTRE - 4},9 ${CENTRE + 4},9`} fill="var(--text)" opacity="0.7" />
      <circle cx={CENTRE} cy={CENTRE} r="2" fill="var(--text)" opacity="0.5" />
      {/* Current position dot (Guide p.91: red negative pan, green
          positive pan, lighter for negative tilt). */}
      <circle cx={dot.x * SIZE} cy={dot.y * SIZE} r="6" fill={dotFill} fillOpacity={now.tilt < 0.5 ? 0.55 : 1} stroke="var(--bg)" strokeWidth="1.5" />
    </svg>
    {menu && <div ref={menuRef} role="menu" className="fixed z-50 flex flex-col rounded-lg border border-line bg-panel p-1 shadow-xl" style={{ left: menu.x, top: menu.y }}>
      <button type="button" role="menuitem" className="rounded px-3 py-1.5 text-left text-xs text-text hover:bg-panel2" onClick={() => flip('pan')}>Flip Pan</button>
      <button type="button" role="menuitem" className="rounded px-3 py-1.5 text-left text-xs text-text hover:bg-panel2" onClick={() => flip('tilt')}>Flip Tilt</button>
    </div>}
  </div>
}
