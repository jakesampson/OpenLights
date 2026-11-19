import { useRef } from 'react'
import { useDragEnd } from './useDragEnd'

const CX = 110, CY = 110

// Angle convention: 0° is the top of the wheel (12 o'clock), increasing
// clockwise — the same convention as colorWheelPosition (pure red at the
// top, green 120° clockwise from it).
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) }
}

const angleOf = (x: number, y: number) => ((Math.atan2(x - CX, CY - y) * 180) / Math.PI + 360) % 360

function annulusSector(rOuter: number, rInner: number, a0: number, a1: number): string {
  const p1 = polar(rOuter, a0), p2 = polar(rOuter, a1), p3 = polar(rInner, a1), p4 = polar(rInner, a0)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${rInner} ${rInner} 0 ${large} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`
}

export interface ExtraColorChannel {
  attribute: string
  label: string
  /** Current channel value, 0–255. */
  value: number
  /** The channel's colour, for the arc's fill. */
  color: string
}

interface InnerArc {
  key: string
  label: string
  kind: 'saturation' | 'brightness' | 'channel'
  attribute?: string
  /** Current value as a fraction, 0–1 (max at the arc's start). */
  fraction: number
  maxColor: string
  minColor: string
}

// LightKey's round Color control (Guide p.82–84, and Jake's LightKey
// screenshot Screenshot_2026-11-19_at_9.56.05_am.png): an outer hue ring
// with tick marks and six triangle markers at the pure hues (red, yellow,
// green, cyan, blue, magenta), and inner arcs in the centre — saturation
// on the left half, brightness on the right half, plus one arc per
// additional colour channel the fixture has (White / Amber / UV …), the
// inner circle divided equally between them. A fixture without those
// channels shows no extra arcs. The centre disc shows the current colour
// and opens the system colour window on click (Guide p.84).
//
// Each inner arc is a vertical slider bent into an arc: its value is
// highest at the arc's top end and lowest at the bottom end, like the
// two half-wheel sliders in the screenshot. Dragging an arc or the hue
// ring sets its value by pointer angle; the white marker on each arc
// shows the current value.
export function ColorWheelControl({ hsv, extraChannels, centreHex, disabled = false, onHsvChange, onExtraChange, onCentrePick }: {
  hsv: { h: number; s: number; v: number }
  extraChannels: ExtraColorChannel[]
  centreHex: string
  disabled?: boolean
  onHsvChange: (next: { h: number; s: number; v: number }) => void
  onExtraChange: (attribute: string, value: number) => void
  onCentrePick: (hex: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useDragEnd()
  const activeZone = useRef<{ type: 'hue' } | { type: 'arc'; index: number } | null>(null)

  const arcs: InnerArc[] = [
    { key: 'saturation', label: 'Saturation', kind: 'saturation', fraction: hsv.s / 100, maxColor: `hsl(${hsv.h}, 100%, 50%)`, minColor: `hsl(${hsv.h}, 0%, 50%)` },
    { key: 'brightness', label: 'Brightness', kind: 'brightness', fraction: hsv.v / 100, maxColor: `hsl(${hsv.h}, ${hsv.s}%, 50%)`, minColor: '#000000' },
    ...extraChannels.map((c) => ({ key: c.attribute, label: c.label, kind: 'channel' as const, attribute: c.attribute, fraction: c.value / 255, maxColor: c.color, minColor: '#111111' }))
  ]
  const span = 360 / arcs.length
  const arcStart = (index: number) => 180 + index * span

  const pointAt = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return null
    const scale = 220 / rect.width
    const x = (event.clientX - rect.left) * scale
    const y = (event.clientY - rect.top) * scale
    const r = Math.hypot(x - CX, y - CY)
    return { angle: angleOf(x, y), r }
  }

  const applyAt = (event: React.PointerEvent) => {
    const point = pointAt(event)
    const zone = activeZone.current
    if (!point || !zone) return
    if (zone.type === 'hue') {
      onHsvChange({ h: Math.round(point.angle), s: hsv.s, v: hsv.v })
      return
    }
    const start = arcStart(zone.index)
    const rel = Math.max(0, Math.min(span, (point.angle - start + 360) % 360))
    const fraction = 1 - rel / span
    const arc = arcs[zone.index]
    if (!arc) return
    if (arc.kind === 'saturation') onHsvChange({ h: hsv.h, s: Math.round(fraction * 100), v: hsv.v })
    else if (arc.kind === 'brightness') onHsvChange({ h: hsv.h, s: hsv.s, v: Math.round(fraction * 100) })
    else if (arc.attribute) onExtraChange(arc.attribute, Math.round(fraction * 255))
  }

  const endDrag = () => { drag.end(); activeZone.current = null }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    const point = pointAt(event)
    if (!point) return
    // The centre disc is the native colour input (system colour window,
    // Guide p.84) — leave the click to it. Outside the wheel, ignore.
    if (point.r <= 32 || point.r > 116) return
    drag.begin()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (point.r >= 76) activeZone.current = { type: 'hue' }
    else {
      const index = Math.min(arcs.length - 1, Math.floor(((point.angle - 180 + 360) % 360) / span))
      activeZone.current = { type: 'arc', index }
    }
    applyAt(event)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    // A move with no button held means the release was missed (released
    // outside the window) — end the drag instead of re-engaging it.
    if (event.buttons === 0) { endDrag(); return }
    if (drag.isActive()) applyAt(event)
  }

  const onKeyDownHue = (event: React.KeyboardEvent) => {
    if (disabled) return
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); onHsvChange({ h: (hsv.h + step) % 360, s: hsv.s, v: hsv.v }) }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); onHsvChange({ h: (hsv.h - step + 360) % 360, s: hsv.s, v: hsv.v }) }
    else if (event.key === 'PageUp') { event.preventDefault(); onHsvChange({ h: (hsv.h + 30) % 360, s: hsv.s, v: hsv.v }) }
    else if (event.key === 'PageDown') { event.preventDefault(); onHsvChange({ h: (hsv.h - 30 + 360) % 360, s: hsv.s, v: hsv.v }) }
  }

  const onKeyDownArc = (event: React.KeyboardEvent, index: number) => {
    if (disabled) return
    const arc = arcs[index]
    if (!arc) return
    const step = event.shiftKey ? 10 : 1
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? step : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -step : event.key === 'PageUp' ? 25 : event.key === 'PageDown' ? -25 : 0
    if (!delta) return
    event.preventDefault()
    if (arc.kind === 'saturation') onHsvChange({ h: hsv.h, s: Math.max(0, Math.min(100, hsv.s + delta)), v: hsv.v })
    else if (arc.kind === 'brightness') onHsvChange({ h: hsv.h, s: hsv.s, v: Math.max(0, Math.min(100, hsv.v + delta)) })
    else if (arc.attribute) onExtraChange(arc.attribute, Math.max(0, Math.min(255, Math.round(arc.fraction * 255) + delta)))
  }

  const hueSegments = Array.from({ length: 60 }, (_, i) => i * 6)
  const ticks = Array.from({ length: 60 }, (_, i) => i * 6)
  const triangles = [0, 60, 120, 180, 240, 300]

  return (
    <div
      ref={wrapRef}
      className="color-wheel"
      style={{ position: 'relative', width: 150, height: 150, touchAction: 'none', opacity: disabled ? 0.4 : 1 }}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Colour hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsv.h)}
      aria-valuetext={`${Math.round(hsv.h)} degrees`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDownHue}
    >
      <svg viewBox="0 0 220 220" width="100%" height="100%">
        <defs>
          {arcs.map((arc, i) => {
            const start = polar(54, arcStart(i)), end = polar(54, arcStart(i) + span)
            return (
              <linearGradient key={arc.key} id={`color-wheel-arc-${i}`} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
                <stop offset="0%" stopColor={arc.maxColor} />
                <stop offset="100%" stopColor={arc.minColor} />
              </linearGradient>
            )
          })}
        </defs>
        {/* Outer hue ring, 60 segments. */}
        {hueSegments.map((deg) => (
          <path key={deg} d={annulusSector(97, 77, deg, deg + 6)} fill={`hsl(${deg}, 100%, 50%)`} />
        ))}
        {/* Tick marks around the outside of the hue ring. */}
        {ticks.map((deg) => {
          const major = deg % 30 === 0
          const a = polar(major ? 107 : 105, deg), b = polar(99, deg)
          return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(0,0,0,0.5)" strokeWidth={major ? 1.5 : 1} />
        })}
        {/* Triangle markers at the six pure hues. */}
        {triangles.map((deg) => {
          const apex = polar(117, deg), left = polar(106, deg - 2.5), right = polar(106, deg + 2.5)
          return <polygon key={deg} points={`${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}`} fill={`hsl(${deg}, 100%, 50%)`} />
        })}
        {/* Current hue marker: a white bar on the ring. */}
        <line x1={polar(77, hsv.h).x} y1={polar(77, hsv.h).y} x2={polar(97, hsv.h).x} y2={polar(97, hsv.h).y} stroke="#000" strokeWidth={5} strokeLinecap="round" />
        <line x1={polar(77, hsv.h).x} y1={polar(77, hsv.h).y} x2={polar(97, hsv.h).x} y2={polar(97, hsv.h).y} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
        {/* Inner arcs: saturation, brightness, then one per extra channel. */}
        {arcs.map((arc, i) => {
          const start = arcStart(i)
          const value = arc.kind === 'saturation' ? hsv.s : arc.kind === 'brightness' ? hsv.v : Math.round(arc.fraction * 255)
          const max = arc.kind === 'channel' ? 255 : 100
          const markerAngle = start + (1 - arc.fraction) * span
          const ticksInArc = Array.from({ length: 11 }, (_, k) => start + (k / 10) * span)
          return (
            <g key={arc.key}>
              <path
                d={annulusSector(72, 36, start, start + span)}
                fill={`url(#color-wheel-arc-${i})`}
                tabIndex={disabled ? -1 : 0}
                role="slider"
                aria-label={arc.label}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={value}
                onKeyDown={(event) => onKeyDownArc(event, i)}
              >
                <title>{arc.label}</title>
              </path>
              {ticksInArc.map((deg, k) => {
                const major = k % 5 === 0
                const a = polar(major ? 67 : 69, deg), b = polar(72, deg)
                return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(0,0,0,0.45)" strokeWidth={major ? 1.5 : 1} />
              })}
              <line x1={polar(36, markerAngle).x} y1={polar(36, markerAngle).y} x2={polar(72, markerAngle).x} y2={polar(72, markerAngle).y} stroke="#000" strokeWidth={5} strokeLinecap="round" />
              <line x1={polar(36, markerAngle).x} y1={polar(36, markerAngle).y} x2={polar(72, markerAngle).x} y2={polar(72, markerAngle).y} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
            </g>
          )
        })}
        {/* Centre disc: the current colour. */}
        <circle cx={CX} cy={CY} r={32} fill={centreHex} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      </svg>
      {/* Clicking the centre opens the system colour window (Guide p.84). */}
      <input
        type="color"
        value={centreHex}
        disabled={disabled}
        aria-label="Colour — open system colour picker"
        onChange={(event) => onCentrePick(event.target.value)}
        style={{ position: 'absolute', left: '50%', top: '50%', width: '29%', height: '29%', transform: 'translate(-50%, -50%)', opacity: 0, cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
    </div>
  )
}
