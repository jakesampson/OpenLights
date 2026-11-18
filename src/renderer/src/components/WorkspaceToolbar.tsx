import { useEffect, useRef, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { calculateTapTempo } from '../lib/tapTempo'
import { runToolbarCommand } from '../lib/toolbarCommands'
import { DmxConnection } from './DmxConnection'
import { beatPhase } from '../lib/beatGrid'
export function WorkspaceToolbar({ view, onView, onBlackout }: { view: string; onView: (view: 'Design' | 'Live') => void; onBlackout: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [lockError, setLockError] = useState(false)
  const { locked, lockApp, unlockApp, master, setMaster, blackout, blind, toggleBlind, freeze, toggleFreeze, bpm, setBpm } = useShowStore()
  const taps = useRef<number[]>([])
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setPhase(beatPhase(performance.now(), bpm)), 50)
    return () => window.clearInterval(timer)
  }, [bpm])
  const actions = { design: () => onView('Design'), live: () => onView('Live'), blackout: onBlackout, tap: () => { const result = calculateTapTempo(taps.current, performance.now()); taps.current = result.taps; if (result.bpm !== null) setBpm(result.bpm) } }
  return <div role="toolbar" aria-label="Lighting controls" className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
    <label className="flex items-center gap-1">Master<input aria-label="Master intensity" type="range" min="0" max="255" value={master} onChange={(e) => setMaster(Number(e.target.value))} className="w-24 accent-[var(--accent)]" />{Math.round(master / 255 * 100)}%</label>
    <button className={`btn-theme ${blind ? 'on' : ''}`} aria-pressed={blind} onClick={toggleBlind} title="Hold live output while editing">Blind</button><button className={`btn-theme ${freeze ? 'on' : ''}`} aria-pressed={freeze} onClick={toggleFreeze} title="Hold the current DMX frame">Freeze</button>
    <span aria-label="Beat indicator" title="Beat phase" className="h-2 w-2 rounded-full bg-[var(--accent)]" style={{ opacity: Math.max(0.2, 1 - phase) }} /><label>BPM <input aria-label="Tempo in BPM" type="number" min="30" max="240" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-14 rounded bg-panel2 p-1" /></label><button className="btn-theme" onClick={() => runToolbarCommand('tap', actions)}>Tap</button>
    <input type="password" aria-label={locked ? 'Unlock passcode' : 'Optional lock passcode'} placeholder={locked ? 'Passcode' : 'Optional passcode'} value={passcode} onChange={(e) => { setPasscode(e.target.value); setLockError(false) }} className="w-24 rounded bg-panel2 p-1" /><button className="btn-theme" onClick={() => { if (locked) { if (!unlockApp(passcode)) { setLockError(true); return } } else { lockApp(passcode); onView('Live') } setPasscode('') }}>{locked ? 'Unlock' : 'Lock'}</button>{lockError && <span role="alert" className="text-red-300">Incorrect passcode</span>}<DmxConnection /><button className="btn-panic rounded px-3 py-1 font-semibold" onClick={() => runToolbarCommand('blackout', actions)}>{blackout ? 'Restore' : 'Blackout'}</button>
  </div>
}
