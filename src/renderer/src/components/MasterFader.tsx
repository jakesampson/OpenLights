import { useEffect, useState } from 'react'
import { BEAT_QUADRANTS, nextBeatQuadrant, beatMs, type BeatQuadrant } from '../lib/beatQuadrant'
import { FillFader } from './FillFader'

// LightKey-style tap-tempo box (screenshots 9.56.45 / 9.58.58): a
// separate element under the fader rail, the same width as the rail,
// split into four quadrants — one lights up at a time, advancing
// clockwise on every BEAT (top-left → top-right → bottom-right →
// bottom-left; Jake's correction, 18 Nov 2026: at 60 bpm that is one
// quadrant per second, 15 full rotations per minute — the earlier
// quarter-beat step was 4x too fast). The highlight steps on a DOM
// interval of one beat, reset whenever the tempo changes and cleared on
// unmount; it lives in the sandboxed renderer, so it dies with the window
// and cannot hold the main process open on quit. With no usable tempo
// (bpm 0) no quadrant is lit.
function BpmButton({ bpm, onTap }: { bpm: number; onTap: () => void }) {
  const [lit, setLit] = useState<BeatQuadrant | null>(null)
  useEffect(() => {
    const beat = beatMs(bpm)
    if (beat === null) { setLit(null); return }
    setLit('top-left')
    const timer = window.setInterval(() => {
      setLit((current) => (current === null ? 'top-left' : nextBeatQuadrant(current)))
    }, beat)
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
        {/* LightKey-style Master fader (Jake's 18 Nov 2026 screenshots
            9.56.45 / 10.00.16): the shared FillFader — a tall, wide, solid
            vertical track that fills from the bottom in proportion to the
            master value, no thin line + round knob. Dragging sets the same
            store master (0–255) through the same setMaster output path. */}
        <FillFader value={master} onChange={setMaster} label="Live master" fillColor="#d9d4f5" valueText={master >= 255 ? 'Full' : `${Math.round((master / 255) * 100)}%`} />
        <span className="text-xs text-text">{master >= 255 ? 'Full' : `${Math.round((master / 255) * 100)}%`}</span>
      </div>
      <BpmButton bpm={bpm} onTap={onTap} />
    </div>
  )
}
