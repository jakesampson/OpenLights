import { useEffect, useRef, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { calculateTapTempo } from '../lib/tapTempo'
import { runToolbarCommand } from '../lib/toolbarCommands'
import { DmxConnection } from './DmxConnection'
import { beatPhase } from '../lib/beatGrid'
export function WorkspaceToolbar({ view, onView, onBlackout }: { view: string; onView: (view: 'Design' | 'Live') => void; onBlackout: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [lockError, setLockError] = useState(false)
  const { locked, lockApp, unlockApp, blackout, blind, toggleBlind, freeze, toggleFreeze, bpm, setBpm } = useShowStore()
  const taps = useRef<number[]>([])
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setPhase(beatPhase(performance.now(), bpm)), 50)
    return () => window.clearInterval(timer)
  }, [bpm])
  const actions = { design: () => onView('Design'), live: () => onView('Live'), blackout: onBlackout, tap: () => { const result = calculateTapTempo(taps.current, performance.now()); taps.current = result.taps; if (result.bpm !== null) setBpm(result.bpm) } }
  const toggleLock = () => { if (locked) { if (!unlockApp(passcode)) { setLockError(true); return } } else { lockApp(passcode); onView('Live') } setPasscode('') }
  return <div role="toolbar" aria-label="Lighting controls" className="lighting-toolbar">
    <button className={`header-icon ${locked ? 'on' : ''}`} aria-label={locked ? 'Unlock project' : 'Lock project'} aria-pressed={locked} onClick={toggleLock} title={locked ? 'Unlock project' : 'Lock project'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="13" height="10" rx="2"/><path d={locked ? 'M8 10V7a4 4 0 0 1 8 0v3' : 'M16 10V7a4 4 0 0 0-8 0'} /></svg></button>
    <button className={`header-icon ${blind ? 'on' : ''}`} aria-label="Blind mode" aria-pressed={blind} onClick={toggleBlind} title="Blind mode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><path d="m4 4 16 16"/></svg></button>
    <button className={`header-icon ${freeze ? 'on' : ''}`} aria-label="Freeze output" aria-pressed={freeze} onClick={toggleFreeze} title="Freeze output"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V5a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 8-8 8S5 18 4 14l-1-3a2 2 0 0 1 4-1l1 1Z"/></svg></button>
    <details className="header-more"><summary className="header-icon" aria-label="More controls" title="More controls">•••</summary><div className="header-more-menu">
      <label>BPM <input aria-label="Tempo in BPM" type="number" min="30" max="240" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} /></label><span aria-label="Beat indicator" className="beat-dot" style={{ opacity: Math.max(0.2, 1 - phase) }} /><button onClick={() => runToolbarCommand('tap', actions)}>Tap tempo</button>
      <input type="password" aria-label={locked ? 'Unlock passcode' : 'Optional lock passcode'} placeholder="Optional lock passcode" value={passcode} onChange={(e) => { setPasscode(e.target.value); setLockError(false) }} />{lockError && <span role="alert" className="text-red-300">Incorrect passcode</span>}
      <DmxConnection /><button className="header-blackout" onClick={() => runToolbarCommand('blackout', actions)}>{blackout ? 'Restore output' : 'Blackout'}</button>
    </div></details>
  </div>
}
