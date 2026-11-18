import { useEffect, useRef, useState } from 'react'
import { BEAT_QUADRANTS, nextBeatQuadrant, quarterBeatMs, type BeatQuadrant } from '../lib/beatQuadrant'

const clampMaster = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

// LightKey-style Master fader (Jake's 18 Nov 2026 screenshots 9.56.45 /
// 10.00.16): a tall, wide, solid vertical track that fills from the
// bottom in proportion to the master value — no thin line + round knob.
// A div with role="slider" instead of a native range input, so the fill
// can be drawn as a solid bar and the track can never overlap the tap
// tempo button below the rail. Dragging sets the same store master
// (0–255) through the same setMaster output path; keyboard: arrows ±1
// (Shift ±10), PageUp/PageDown ±25, Home = Full, End = 0.
function MasterTrack({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const valueFromPointer = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return
    onChange(clampMaster((1 - (clientY - rect.top) / rect.height) * 255))
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); onChange(clampMaster(value + step)) }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); onChange(clampMaster(value - step)) }
    else if (event.key === 'Home') { event.preventDefault(); onChange(255) }
    else if (event.key === 'End') { event.preventDefault(); onChange(0) }
    else if (event.key === 'PageUp') { event.preventDefault(); onChange(clampMaster(value + 25)) }
    else if (event.key === 'PageDown') { event.preventDefault(); onChange(clampMaster(value - 25)) }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Live master"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={255}
      aria-valuenow={value}
      aria-valuetext={value >= 255 ? 'Full' : `${Math.round((value / 255) * 100)}%`}
      className="live-master-track"
      onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); valueFromPointer(event.clientY) }}
      onPointerMove={(event) => { if (dragging.current) valueFromPointer(event.clientY) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
      onKeyDown={onKeyDown}
    >
      <div className="live-master-fill" style={{ height: `${(value / 255) * 100}%` }} />
    </div>
  )
}

// LightKey-style tap-tempo box (screenshots 9.56.45 / 9.58.58): a
// separate element under the fader rail, the same width as the rail,
// split into four quadrants — one lights up at a time, advancing
// clockwise on every 1/4 beat (top-left → top-right → bottom-right →
// bottom-left). The highlight steps on a DOM interval of one quarter
// beat, reset whenever the tempo changes and cleared on unmount; it
// lives in the sandboxed renderer, so it dies with the window and
// cannot hold the main process open on quit. With no usable tempo
// (bpm 0) no quadrant is lit.
function BpmButton({ bpm, onTap }: { bpm: number; onTap: () => void }) {
  const [lit, setLit] = useState<BeatQuadrant | null>(null)
  useEffect(() => {
    const quarter = quarterBeatMs(bpm)
    if (quarter === null) { setLit(null); return }
    setLit('top-left')
    const timer = window.setInterval(() => {
      setLit((current) => (current === null ? 'top-left' : nextBeatQuadrant(current)))
    }, quarter)
    return () => window.clearInterval(timer)
  }, [bpm])

  return (
    <button type="button" className="live-master-bpm" aria-label="Tap tempo" title="Tap tempo — click to set the tempo" onClick={onTap}>
      <span className="live-master-bpm-quadrants" aria-hidden="true">
        {BEAT_QUADRANTS.map((quadrant) => (
          <span key={quadrant} data-quadrant={quadrant} className={`bpm-quadrant${lit === quadrant ? ' bpm-quadrant-lit' : ''}`} />
        ))}
      </span>
      <span className="live-master-bpm-text"><strong>{bpm > 0 ? Math.round(bpm) : '—'}</strong> <small>bpm</small></span>
    </button>
  )
}

export function MasterFader({ master, setMaster, bpm, onTap }: {
  master: number
  setMaster: (value: number) => void
  bpm: number
  onTap: () => void
}) {
  return (
    <div className="live-master-column">
      <div className="live-master-rail" aria-label="Master fader">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">Master</span>
        <MasterTrack value={master} onChange={setMaster} />
        <span className="text-xs text-text">{master >= 255 ? 'Full' : `${Math.round((master / 255) * 100)}%`}</span>
      </div>
      <BpmButton bpm={bpm} onTap={onTap} />
    </div>
  )
}
