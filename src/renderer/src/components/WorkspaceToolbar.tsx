import { useEffect, useMemo, useRef, useState } from 'react'
import { availableProperties } from '../lib/availableProperties'
import { useShowStore } from '../stores/showStore'

const propertyLabel = (attribute: string) => attribute.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())

export function WorkspaceToolbar({ onView }: { view: string; onView: (view: 'Design' | 'Live') => void; onBlackout: () => void }) {
  const state = useShowStore()
  const [property, setProperty] = useState<string | null>(null)
  const [lockDialog, setLockDialog] = useState<'lock' | 'unlock' | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const fixtures = useMemo(() => (state.show?.fixtures ?? []).filter((fixture) => state.selectedFixtureIds.includes(fixture.id)), [state.show?.fixtures, state.selectedFixtureIds])
  const properties = useMemo(() => availableProperties(fixtures), [fixtures])
  const selectedProperty = property && properties.some((item) => item.attribute === property) ? property : properties[0]?.attribute ?? null
  const openLockDialog = () => {
    setPin('')
    setPinError(false)
    setLockDialog(state.locked ? 'unlock' : 'lock')
  }
  const submitLockDialog = () => {
    if (lockDialog === 'lock') {
      state.lockApp(pin)
      onView('Live')
      setLockDialog(null)
      setPin('')
      return
    }
    if (!state.unlockApp(pin)) { setPinError(true); return }
    setLockDialog(null)
    setPin('')
  }
  // Add Effect opens the effects chooser (Guide ch.10, pp.148-149) instead
  // of creating an effect immediately — the chooser picks a template or a
  // custom effect for the property.
  const addEffect = (attribute: string) => state.setEffectChooserAttribute(attribute)
  const clearProperty = () => {
    if (!selectedProperty) return
    state.releaseManualOverrides(state.selectedFixtureIds, selectedProperty)
    const cue = state.cues.find((item) => item.id === state.activeCueId)
    if (!cue) return
    const fixtureValues = structuredClone(cue.fixtureValues)
    for (const fixtureId of state.selectedFixtureIds) if (fixtureValues[fixtureId]) delete fixtureValues[fixtureId][selectedProperty]
    state.updateCue(cue.id, { fixtureValues })
  }
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      for (const details of toolbarRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? []) {
        if (!target || !details.contains(target)) details.open = false
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      for (const details of toolbarRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? []) details.open = false
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('pointerdown', closeOutside); window.removeEventListener('keydown', closeOnEscape) }
  }, [])
  return <div ref={toolbarRef} role="toolbar" aria-label="Lighting controls" className="lighting-toolbar">
    <button className={`header-icon ${state.locked ? 'on' : ''}`} aria-label={state.locked ? 'Unlock project' : 'Lock project'} aria-pressed={state.locked} onClick={openLockDialog} title={state.locked ? 'Unlock project' : 'Lock project'}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="13" height="10" rx="2"/><path d={state.locked ? 'M8 10V7a4 4 0 0 1 8 0v3' : 'M16 10V7a4 4 0 0 0-8 0'} /></svg></button>
    <button className={`header-icon ${state.blind ? 'on' : ''}`} aria-label="Blind mode" aria-pressed={state.blind} onClick={state.toggleBlind} title="Blind mode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><path d="m4 4 16 16"/></svg></button>
    <button className={`header-icon ${state.freeze ? 'on' : ''}`} aria-label="Freeze output" aria-pressed={state.freeze} onClick={state.toggleFreeze} title="Freeze output"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V5a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 8-8 8S5 18 4 14l-1-3a2 2 0 0 1 4-1l1 1Z"/></svg></button>
    <details className="header-more"><summary className="header-icon" aria-label="Fixture property menu" title="Fixture property menu">•••<span aria-hidden="true">⌄</span></summary><div className="header-more-menu property-menu">
      <details><summary>Select Property <span>›</span></summary><div className="header-submenu">{properties.map((item) => <button key={item.attribute} className={selectedProperty === item.attribute ? 'on' : ''} onClick={() => setProperty(item.attribute)}>{propertyLabel(item.attribute)}</button>)}{!properties.length && <span>No common properties</span>}</div></details>
      <button disabled={!fixtures.length} onClick={() => state.copyFixtureProperties()}>Copy Properties</button>
      <details><summary>Copy Property <span>›</span></summary><div className="header-submenu">{properties.map((item) => <button key={item.attribute} onClick={() => { setProperty(item.attribute); state.copyFixtureProperties(item.attribute) }}>{propertyLabel(item.attribute)}</button>)}</div></details>
      <button disabled={!state.propertyClipboard || !fixtures.length} onClick={() => state.pasteFixtureProperties()}>Paste Properties</button>
      <button disabled={!selectedProperty || !fixtures.length} onClick={clearProperty}>Clear Property</button>
    </div></details>
    <details className="header-more effects-menu"><summary className="header-icon" aria-label="Add effect" title="Add effect"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 10-10m-7-2 2-2m3 5 2-2m2-5 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" /></svg><span aria-hidden="true">⌄</span></summary><div className="header-more-menu"><strong>Add Effect for:</strong>{properties.map((item) => <button key={item.attribute} onClick={() => addEffect(item.attribute)}>{propertyLabel(item.attribute)}</button>)}{!properties.length && <span>Select fixtures with common properties</span>}</div></details>
    {lockDialog && <div className="header-lock-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLockDialog(null) }}><form className="header-lock-dialog" role="dialog" aria-modal="true" aria-label={lockDialog === 'lock' ? 'Lock OpenLights' : 'Unlock OpenLights'} onSubmit={(event) => { event.preventDefault(); submitLockDialog() }}>
      <strong>{lockDialog === 'lock' ? 'Lock OpenLights' : 'Unlock OpenLights'}</strong>
      <p>{lockDialog === 'lock' ? 'Enter an optional PIN. Leave it blank to unlock without a PIN.' : 'Enter the PIN used when OpenLights was locked.'}</p>
      <input autoFocus type="password" inputMode="numeric" autoComplete="off" aria-label={lockDialog === 'lock' ? 'Optional lock PIN' : 'Unlock PIN'} placeholder={lockDialog === 'lock' ? 'Optional PIN' : 'PIN'} value={pin} onChange={(event) => { setPin(event.target.value); setPinError(false) }} />
      {pinError && <span role="alert">Incorrect PIN</span>}
      <div><button type="button" onClick={() => setLockDialog(null)}>Cancel</button><button type="submit" className="primary">{lockDialog === 'lock' ? 'Lock' : 'Unlock'}</button></div>
    </form></div>}
  </div>
}
