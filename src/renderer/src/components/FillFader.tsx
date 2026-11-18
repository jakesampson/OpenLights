import { useRef } from 'react'

const clampFader = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

// Shared vertical fill-bar fader — the LightKey Master style, extracted
// from MasterFader's MasterTrack (18 Nov 2026) so the Design Dimmer and
// channel faders use the exact same control instead of a second, different
// one: a wide solid track that fills from the bottom in proportion to the
// value, no thin line + round knob. A div with role="slider" (not a native
// range input) so the fill can be drawn as a solid bar. Dragging sets the
// value by pointer Y (top = 255); keyboard: arrows ±1 (Shift ±10),
// PageUp/PageDown ±25, Home = 255, End = 0.
export function FillFader({ value, onChange, label, fillColor, disabled = false, trackClassName = 'live-master-track', valueText }: {
  value: number
  onChange: (value: number) => void
  label: string
  fillColor: string
  disabled?: boolean
  trackClassName?: string
  valueText?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

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
      className={trackClassName}
      onPointerDown={(event) => { if (disabled) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); valueFromPointer(event.clientY) }}
      onPointerMove={(event) => { if (dragging.current) valueFromPointer(event.clientY) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
      onKeyDown={onKeyDown}
    >
      <div className="live-master-fill" style={{ height: `${(value / 255) * 100}%`, backgroundColor: fillColor }} />
    </div>
  )
}
