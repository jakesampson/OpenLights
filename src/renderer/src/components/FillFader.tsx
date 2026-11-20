import { useRef } from 'react'
import { useDragEnd } from './useDragEnd'

const clampFader = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

// Shared vertical fill-bar fader — the LightKey Master style, extracted
// from MasterFader's MasterTrack (18 Nov 2026) so the Design Dimmer and
// channel faders use the exact same control instead of a second, different
// one: a wide solid track that fills from the bottom in proportion to the
// value, no thin line + round knob. A div with role="slider" (not a native
// range input) so the fill can be drawn as a solid bar. Dragging sets the
// value by pointer Y (top = 255); keyboard: arrows ±1 (Shift ±10),
// PageUp/PageDown ±25, Home = 255, End = 0.
//
// `selected` (Design tab only, Jake 19 Nov 2026): the blue #0A84FF border
// marking the control the shortcuts act on. It is a prop, not focus, so
// the Live master fader — which never passes it — keeps its own look.
// `fillGradient` (additional-colour sliders only, Jake's LightKey
// screenshots 19 Nov 2026 — lightkey-colour-wheel-*.png): the
// track shows the value scale as a full-height gradient (full colour
// at the top, black at the bottom), and the fill is a mask over the
// unfilled top part, so the gradient visible at any height is exactly
// the slice of the scale up to the current value — the colour at a
// given height never depends on the value. Without it, the fill is
// the old solid fillColor bar (Dimmer, Master, channel faders).
export function FillFader({ value, onChange, label, fillColor, fillGradient, disabled = false, trackClassName = 'live-master-track', valueText, selected = false }: {
  value: number
  onChange: (value: number) => void
  label: string
  fillColor: string
  fillGradient?: string
  disabled?: boolean
  trackClassName?: string
  valueText?: string
  selected?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  // A drag tracked only by a ref stays live when pointerup is missed
  // (released outside the window — capture never delivers it), so the
  // next hover-back over the track resumes dragging. The guard ends the
  // drag on any window pointerup / pointercancel / blur, and a move with
  // no button held ends it too — a hover-back move has buttons === 0.
  const drag = useDragEnd()

  const valueFromPointer = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return
    onChange(clampFader((1 - (clientY - rect.top) / rect.height) * 255))
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); onChange(clampFader(value + step)) }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); onChange(clampFader(value - step)) }
    else if (event.key === 'Home') { event.preventDefault(); onChange(255) }
    else if (event.key === 'End') { event.preventDefault(); onChange(0) }
    else if (event.key === 'PageUp') { event.preventDefault(); onChange(clampFader(value + 25)) }
    else if (event.key === 'PageDown') { event.preventDefault(); onChange(clampFader(value - 25)) }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={255}
      aria-valuenow={value}
      aria-valuetext={valueText ?? `${Math.round((value / 255) * 100)}%`}
      aria-disabled={disabled || undefined}
      className={`${trackClassName}${selected ? ' design-fader-selected' : ''}`}
      style={fillGradient ? { background: fillGradient } : undefined}
      onPointerDown={(event) => { if (disabled) return; drag.begin(); event.currentTarget.setPointerCapture(event.pointerId); valueFromPointer(event.clientY) }}
      onPointerMove={(event) => { if (event.buttons === 0) { drag.end(); return } if (drag.isActive()) valueFromPointer(event.clientY) }}
      onPointerUp={() => drag.end()}
      onPointerCancel={() => drag.end()}
      onLostPointerCapture={() => drag.end()}
      onKeyDown={onKeyDown}
    >
      {fillGradient ? (
        // The gradient is the track's background (full height); this
        // mask covers the unfilled top in the track's normal
        // background, so at 0 the slider reads dark and at full the
        // whole gradient shows. A zero-height mask at full is harmless.
        <div className="live-master-fill" aria-hidden="true" style={{ top: 0, bottom: 'auto', height: `${100 - (value / 255) * 100}%`, background: 'var(--bg)' }} />
      ) : (
        <div className="live-master-fill" style={{ height: `${(value / 255) * 100}%`, backgroundColor: fillColor }} />
      )}
    </div>
  )
}
