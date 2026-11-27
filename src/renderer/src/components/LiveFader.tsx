import { useRef } from 'react'
import type { LiveControl } from '@shared/types'
import { useDragEnd } from './useDragEnd'

const clampFader = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

// Live canvas fader (LightKey guide ch.11, pp.179, 215–216; Jake's
// screenshots, 27 Nov 2026 — the Spots Left/Right faders): a track
// with tick marks and a fill from the bottom (vertical) or the left
// (horizontal), a handle line at the value, the control name at the
// end of the track and a % readout. Dragging the track sets the value
// (top = 255 for vertical, right = 255 for horizontal); keyboard
// mirrors the Design faders (arrows ±1, Shift ±10, PgUp/PgDn ±25,
// Home 255, End 0). A div with role="slider", not a native range
// input — the old range input rendered the vertical fader as a
// horizontal slider, and a fader's size is its track length.
//
// The track carries data-fader-track so the control's drag arming in
// LiveWorkspace skips it: a press on the track sets the value in both
// modes (like the old slider), and the label area is the drag handle
// that moves the control in Edit mode.
export function LiveFader({ control, level, onChange, textColor }: {
  control: LiveControl
  level: number
  onChange: (value: number) => void
  textColor: string
}) {
  const vertical = control.type === 'faderVertical'
  const trackRef = useRef<HTMLDivElement>(null)
  // A drag tracked only by a ref stays live when pointerup is missed
  // (released outside the window — capture never delivers it), so the
  // next hover-back over the track resumes dragging. Same guard as
  // FillFader (Jake, 19 Nov 2026).
  const drag = useDragEnd()

  const valueFromPointer = (clientX: number, clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    if (vertical) {
      if (rect.height <= 0) return
      onChange(clampFader((1 - (clientY - rect.top) / rect.height) * 255))
    } else {
      if (rect.width <= 0) return
      onChange(clampFader(((clientX - rect.left) / rect.width) * 255))
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); onChange(clampFader(level + step)) }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); onChange(clampFader(level - step)) }
    else if (event.key === 'Home') { event.preventDefault(); onChange(255) }
    else if (event.key === 'End') { event.preventDefault(); onChange(0) }
    else if (event.key === 'PageUp') { event.preventDefault(); onChange(clampFader(level + 25)) }
    else if (event.key === 'PageDown') { event.preventDefault(); onChange(clampFader(level - 25)) }
  }

  const percent = Math.round((level / 255) * 100)
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const track = (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={control.name}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={0}
      aria-valuemax={255}
      aria-valuenow={level}
      aria-valuetext={`${percent}%`}
      data-fader-track
      className="live-fader-track relative min-h-0 flex-1"
      onPointerDown={(event) => { drag.begin(); event.currentTarget.setPointerCapture(event.pointerId); valueFromPointer(event.clientX, event.clientY) }}
      onPointerMove={(event) => { if (event.buttons === 0) { drag.end(); return } if (drag.isActive()) valueFromPointer(event.clientX, event.clientY) }}
      onPointerUp={() => drag.end()}
      onPointerCancel={() => drag.end()}
      onLostPointerCapture={() => drag.end()}
      onKeyDown={onKeyDown}
    >
      <div className="live-fader-fill" aria-hidden="true" style={vertical ? { left: 0, right: 0, bottom: 0, height: `${percent}%` } : { top: 0, bottom: 0, left: 0, width: `${percent}%` }} />
      {ticks.map((p) => {
        const long = p % 25 === 0
        return vertical
          ? <div key={p} className="live-fader-tick" aria-hidden="true" style={{ left: 0, bottom: `${p}%`, width: long ? 8 : 4, height: 1 }} />
          : <div key={p} className="live-fader-tick" aria-hidden="true" style={{ bottom: 0, left: `${p}%`, height: long ? 8 : 4, width: 1 }} />
      })}
      <div className="live-fader-handle" aria-hidden="true" style={vertical ? { left: 0, right: 0, bottom: `calc(${percent}% - 1px)`, height: 2 } : { top: 0, bottom: 0, left: `calc(${percent}% - 1px)`, width: 2 }} />
      {vertical && (
        <>
          <span className="live-fader-percent" aria-hidden="true" style={{ color: textColor }}>{percent}%</span>
          <span className="live-fader-name-vertical" aria-hidden="true" style={{ color: textColor }}>{control.effectIds?.length ? '∿ ' : ''}{control.name}</span>
        </>
      )}
    </div>
  )
  if (vertical) return track
  return (
    <div className="flex h-full flex-col">
      {track}
      <div className="flex items-center justify-between px-0.5 pt-0.5" style={{ color: textColor }}>
        <span className="min-w-0 truncate">{control.effectIds?.length ? '∿ ' : ''}{control.name}</span>
        <span className="shrink-0">{percent}%</span>
      </div>
    </div>
  )
}
