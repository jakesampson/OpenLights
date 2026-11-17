import { useRef, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { calculateTapTempo } from '../lib/tapTempo'
import { runToolbarCommand } from '../lib/toolbarCommands'
import { DmxConnection } from './DmxConnection'
export function WorkspaceToolbar({ view, onView, onBlackout }: { view: string; onView: (view: 'Design' | 'Live' | 'Edit') => void; onBlackout: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [lockError, setLockError] = useState(false)
  const { locked, lockApp, unlockApp, master, setMaster, blackout, bpm, setBpm } = useShowStore()
  const taps = useRef<number[]>([])
  const actions = { design: () => onView('Design'), live: () => onView('Live'), blackout: onBlackout, tap: () => { const result = calculateTapTempo(taps.current, performance.now()); taps.current = result.taps; if (result.bpm !== null) setBpm(result.bpm) } }
  return <div role="toolbar" aria-label="Lighting controls" className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
    <label className="flex items-center gap-1">Master<input aria-label="Master intensity" type="range" min="0" max="255" value={master} onChange={(e) => setMaster(Number(e.target.value))} className="w-24 accent-[var(--accent)]" />{Math.round(master / 255 * 100)}%</label>
    <button className="btn-theme" disabled title="Blind editing will be available after output controls are completed">Blind</button><button className="btn-theme" disabled title="Freeze will be available after output controls are completed">Freeze</button>
    <label>BPM <input aria-label="Tempo in BPM" type="number" min="30" max="240" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-14 rounded bg-panel2 p-1" /></label><button className="btn-theme" onClick={() => runToolbarCommand('tap', actions)}>Tap</button>
    <input type="password" aria-label={locked ? 'Unlock passcode' : 'Optional lock passcode'} placeholder={locked ? 'Passcode' : 'Optional passcode'} value={passcode} onChange={(e) => { setPasscode(e.target.value); setLockError(false) }} className="w-24 rounded bg-panel2 p-1" /><button className="btn-theme" onClick={() => { if (locked) { if (!unlockApp(passcode)) { setLockError(true); return } } else { lockApp(passcode); onView('Live') } setPasscode('') }}>{locked ? 'Unlock' : 'Lock'}</button>{lockError && <span role="alert" className="text-red-300">Incorrect passcode</span>}<DmxConnection /><button className="btn-panic rounded px-3 py-1 font-semibold" onClick={() => runToolbarCommand('blackout', actions)}>{blackout ? 'Restore' : 'Blackout'}</button><button disabled={locked} className="btn-theme ml-auto" onClick={() => onView('Edit')}>Scenes & cues</button>
  </div>
}
