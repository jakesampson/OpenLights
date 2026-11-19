import { useMemo, useState } from 'react'
import type { FixtureDef, FixtureProfile } from '@shared/types'
import { allocateFixtures, dipSwitchesForAddress, DIP_SWITCH_VALUES, fixtureWidth, placementError } from '../lib/patch'
import { incrementShortName, proposeShortName } from '@shared/shortNames'
import { useShowStore } from '../stores/showStore'

// Plain controlled number input. Unlike the Fanning HUD's NumberField
// (commit-on-blur, because each commit there writes a fan and an undo
// step), the dialog persists nothing until Patch is clicked, so updating
// state on every keystroke is free — and it keeps Enter = Patch working
// with the value just typed instead of the pre-commit one.
function PatchNumberField({ value, min, max, label, onCommit }: {
  value: number
  min: number
  max: number
  label: string
  onCommit: (value: number) => void
}) {
  return <input
    type="number"
    aria-label={label}
    title={label}
    value={value}
    min={min}
    max={max}
    onChange={(event) => { const next = event.target.valueAsNumber; if (Number.isFinite(next)) onCommit(Math.max(min, Math.min(max, Math.trunc(next)))) }}
    className="mt-1 block w-full rounded border border-line bg-panel2 px-2 py-1 text-sm text-text"
  />
}

// LightKey's DIP switch guide (Patching tab): nine switches, values
// 1–256, ON when that switch's value is part of the address. Read-only
// diagram — it follows the Address field.
function DipSwitchGuide({ address }: { address: number }) {
  const switches = dipSwitchesForAddress(address)
  const outOfRange = address > 511
  return <div aria-label={`DIP switches for address ${address}`} className="rounded border border-line bg-panel2 p-2">
    <div className="flex gap-1">
      {DIP_SWITCH_VALUES.map((value, index) => <div key={value} className="flex flex-1 flex-col items-center gap-0.5">
        <span className="text-[9px] text-dim">{index + 1}</span>
        <span data-switch={index + 1} data-on={switches[index]} title={`Switch ${index + 1} (${value}): ${switches[index] ? 'ON' : 'OFF'}`} className={`h-6 w-full max-w-5 rounded-sm border ${switches[index] ? 'border-accent bg-accent' : 'border-line bg-bg'}`} />
        <span className="text-[9px] text-dim">{value}</span>
      </div>)}
    </div>
    <p className="mt-1 text-[10px] text-dim">DIP switches for address {address}{outOfRange ? ' — address 512 is outside the 9-switch DIP range (1–511); set it on the fixture per its manual' : ''}</p>
  </div>
}

type PatchTab = 'kind' | 'patching' | 'comments'

const TABS: { id: PatchTab; label: string }[] = [
  { id: 'kind', label: 'Kind' },
  { id: 'patching', label: 'Patching' },
  { id: 'comments', label: 'Comments' }
]

interface PatchDialogProps {
  profile: FixtureProfile
  initialModeId: string
  start: number
  onPatched: (message: string) => void
  onClose: () => void
  /** Edit mode: the existing fixture being edited — LightKey reopens this
   * same dialog when a patched fixture is double-clicked. */
  fixture?: FixtureDef
  /** Notice shown in the patch panel after an edit-mode action (duplicate, delete). */
  onNotice?: (message: string) => void
  /** "Show in Preview": select the fixture and leave the patch window. */
  onShowInPreview?: (fixtureId: string) => void
  onShowProfileInLibrary?: (profile: FixtureProfile) => void
  onEditProfile?: (profile: FixtureProfile) => void
}

function summaryFor(patched: FixtureDef[]): string {
  if (!patched.length) return ''
  const first = patched[0]
  const last = patched[patched.length - 1]
  const firstEnd = first.channelStart + first.channels - 1
  const lastEnd = last.channelStart + last.channels - 1
  const instances = first.count && first.count > 1 ? ` · ${first.count} instances sharing the address` : ''
  if (patched.length === 1) return `Patched ${first.shortName ?? first.name} · channels ${first.channelStart}–${firstEnd}${instances}`
  return `Patched ${first.shortName ?? first.name}–${last.shortName ?? last.name} · ${patched.length} fixtures · channels ${first.channelStart}–${lastEnd}${instances}`
}

// LightKey's patch options dialog (Guide pp.29–30, video 04:00): three
// tabs — Kind (fixture, mode, quantity), Patching (short name, address
// with a DIP switch guide, Count, Ext. reference, quantity) and Comments
// (free-text notes, output footer, "…" menu). Dragging a profile onto the
// grid opens it to patch new fixtures; double-clicking a patched fixture
// reopens it to edit that fixture, with no Cancel/Patch — changes apply
// as they are made and the "…" menu holds the actions.
export function PatchDialog({ profile, initialModeId, start, onPatched, onClose, fixture, onNotice, onShowInPreview, onShowProfileInLibrary, onEditProfile }: PatchDialogProps) {
  const { show } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const editing = Boolean(fixture)
  const [tab, setTab] = useState<PatchTab>('kind')
  const [modeId, setModeId] = useState(fixture?.modeId ?? initialModeId)
  const [address, setAddress] = useState(fixture?.channelStart ?? start)
  const [shortName, setShortName] = useState(() => fixture?.shortName ?? proposeShortName(fixtures.map((f) => f.shortName).filter((s): s is string => Boolean(s)), profile.legacyType))
  const [count, setCount] = useState(fixture?.count ?? 1)
  const [consecutive, setConsecutive] = useState(1)
  const [extReference, setExtReference] = useState(fixture?.extReference ?? '')
  const [notes, setNotes] = useState(fixture?.notes ?? '')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [editError, setEditError] = useState('')
  const mode = profile.modes.find((item) => item.id === modeId) ?? profile.modes[0]
  const flexible = mode?.flexibleLeds
  const [ledCount, setLedCount] = useState(fixture?.ledCount ?? flexible?.defaultLeds ?? 0)
  const width = mode ? fixtureWidth(profile, mode.id, flexible ? ledCount : undefined) : 0
  const liveError = editing ? '' : placementError(fixtures, address, width)
  const shortNameError = shortName.trim() ? '' : 'Enter a short name'
  // Preview of what Patch will do (allocateFixtures is pure): the landing
  // addresses and short names for the batch, or the reason it cannot fit.
  const plan = useMemo(() => {
    if (editing || liveError || shortNameError) return { patched: [] as FixtureDef[], error: '' }
    try {
      return { patched: allocateFixtures(fixtures, profile, { quantity: consecutive, start: address, modeId: mode?.id, universe: 1, shortName: shortName.trim(), count, ...(flexible ? { ledCount } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), ...(extReference.trim() ? { extReference: extReference.trim() } : {}) }), error: '' }
    } catch (reason) { return { patched: [] as FixtureDef[], error: reason instanceof Error ? reason.message : String(reason) } }
  }, [editing, liveError, shortNameError, fixtures, profile, consecutive, address, mode?.id, shortName, count, flexible, ledCount, notes, extReference])
  const error = editing ? editError : (liveError || shortNameError || plan.error || submitError)
  const canPatch = !editing && !error && plan.patched.length > 0

  const patch = () => {
    if (!canPatch) return
    const message = summaryFor(plan.patched)
    try {
      useShowStore.getState().addProfileFixtures(profile, { quantity: consecutive, start: address, modeId: mode?.id, universe: 1, shortName: shortName.trim(), count, ...(flexible ? { ledCount } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), ...(extReference.trim() ? { extReference: extReference.trim() } : {}) })
      onPatched(message)
    } catch (reason) { setSubmitError(reason instanceof Error ? reason.message : String(reason)) }
  }

  // Edit mode: each change is validated against the other fixtures and
  // applied to the store straight away (LightKey has no Cancel/Patch
  // here). Text fields commit on blur so a half-typed value never writes
  // — and so typing does not flood the undo stack with one step per key.
  const store = () => useShowStore.getState()
  const applyMode = (nextModeId: string) => {
    if (!fixture) return
    const next = profile.modes.find((item) => item.id === nextModeId) ?? profile.modes[0]
    const nextLeds = next.flexibleLeds?.defaultLeds
    const nextWidth = fixtureWidth(profile, next.id, nextLeds)
    const problem = placementError(fixtures, fixture.channelStart, nextWidth, fixture.id)
    if (problem) { setEditError(problem); return }
    setEditError('')
    setModeId(next.id)
    setLedCount(nextLeds ?? 0)
    store().updateFixture(fixture.id, { modeId: next.id, channels: nextWidth, ...(next.flexibleLeds ? { ledCount: nextLeds } : { ledCount: undefined }) })
  }
  const applyLedCount = (next: number) => {
    if (!fixture || !flexible) return
    const nextWidth = fixtureWidth(profile, mode.id, next)
    const problem = placementError(fixtures, fixture.channelStart, nextWidth, fixture.id)
    if (problem) { setEditError(problem); return }
    setEditError('')
    setLedCount(next)
    store().updateFixture(fixture.id, { ledCount: next, channels: nextWidth })
  }
  const applyAddress = (next: number) => {
    if (!fixture) return
    const problem = placementError(fixtures, next, fixture.channels, fixture.id)
    if (problem) { setEditError(problem); setAddress(fixture.channelStart); return }
    setEditError('')
    setAddress(next)
    store().updateFixture(fixture.id, { channelStart: next })
  }
  const applyShortName = () => {
    if (!fixture) return
    const next = shortName.trim()
    if (!next) { setEditError('Enter a short name'); setShortName(fixture.shortName ?? ''); return }
    if (next === fixture.shortName) { setEditError(''); return }
    setEditError('')
    setShortName(next)
    store().updateFixture(fixture.id, { shortName: next })
  }
  const applyCount = (next: number) => {
    if (!fixture) return
    setCount(next)
    store().updateFixture(fixture.id, { count: next > 1 ? next : undefined })
  }
  const applyExtReference = () => {
    if (!fixture) return
    const next = extReference.trim()
    if (next === (fixture.extReference ?? '')) return
    setExtReference(next)
    store().updateFixture(fixture.id, { extReference: next || undefined })
  }
  const applyNotes = () => {
    if (!fixture) return
    const next = notes.trim()
    if (next === (fixture.notes ?? '')) return
    setNotes(next)
    store().updateFixture(fixture.id, { notes: next || undefined })
  }

  const closeMenu = () => { setMenuOpen(false); setConfirmDelete(false) }
  const outputLine = editing
    ? (fixture?.disabled ? 'No output' : `Output: Universe 1 · channels ${fixture?.channelStart}–${(fixture?.channelStart ?? 1) + (fixture?.channels ?? 0) - 1}`)
    : (plan.patched.length > 0 ? `Output: Universe 1 · channels ${plan.patched[0].channelStart}–${plan.patched[plan.patched.length - 1].channelStart + plan.patched[plan.patched.length - 1].channels - 1}` : 'Output: —')

  const kindTab = <>
    <div className="mb-3 flex h-28 items-center justify-center rounded border border-line bg-panel2" aria-label="Fixture image">
      <div className="text-center">
        <div className="text-lg font-semibold">{shortName || profile.name}</div>
        <div className="text-[10px] text-dim">{profile.legacyType}</div>
        <div className="text-[10px] text-dim">No fixture image in the library</div>
      </div>
    </div>
    <p className="mb-1 text-sm font-medium">{profile.manufacturer} · {profile.name}</p>
    <p className="mb-3 text-xs text-dim">{width} channels{!editing && plan.patched.length > 0 ? ` · ${summaryFor(plan.patched).replace(/^Patched /, '')}` : ''}{editing && fixture ? ` · patched at ${fixture.channelStart}–${fixture.channelStart + fixture.channels - 1}` : ''}</p>
    {profile.modes.length > 1 && <label className="mb-3 block text-xs text-dim">Mode<select aria-label="Fixture mode" value={mode.id} onChange={(event) => { if (editing) applyMode(event.target.value); else { const next = profile.modes.find((item) => item.id === event.target.value) ?? profile.modes[0]; setModeId(next.id); setLedCount(next.flexibleLeds?.defaultLeds ?? 0) } }} className="mt-1 block w-full rounded border border-line bg-panel2 px-2 py-1 text-sm text-text">{profile.modes.map((item) => <option key={item.id} value={item.id}>{item.name} · {fixtureWidth(profile, item.id, item.flexibleLeds?.defaultLeds)}ch</option>)}</select></label>}
    {flexible && <label className="mb-3 block text-xs text-dim">LEDs<PatchNumberField value={ledCount} min={flexible.minLeds ?? 1} max={flexible.maxLeds} label="LEDs" onCommit={(value) => { if (editing) applyLedCount(value); else setLedCount(value) }} /></label>}
    {!editing && <label className="mb-3 block text-xs text-dim">Add N fixtures<PatchNumberField value={consecutive} min={1} max={512} label="Patch consecutive fixtures" onCommit={setConsecutive} /></label>}
  </>

  const patchingTab = <div className="grid grid-cols-2 gap-3">
    <label className="text-xs text-dim">Short name (max 4 characters)<input aria-label="Short name" type="text" autoFocus value={shortName} maxLength={4} onChange={(event) => setShortName(event.target.value)} onBlur={() => { if (editing) applyShortName() }} onKeyDown={(event) => {
      // Guide p.30: when the short name ends with a number, Up/Down
      // Arrow keys increase/decrease it.
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      const next = incrementShortName(shortName, event.key === 'ArrowUp' ? 1 : -1)
      if (!next) return
      event.preventDefault()
      setShortName(next)
    }} className="mt-1 block w-full rounded border border-line bg-panel2 px-2 py-1 text-sm text-text" /></label>
    <label className="text-xs text-dim">Start at (DMX address)<PatchNumberField value={address} min={1} max={512} label="Start at" onCommit={(value) => { if (editing) applyAddress(value); else setAddress(value) }} /></label>
    <div className="col-span-2"><DipSwitchGuide address={address} /></div>
    <label className="text-xs text-dim">Count (same address)<PatchNumberField value={count} min={1} max={99} label="Count" onCommit={(value) => { if (editing) applyCount(value); else setCount(value) }} /></label>
    <label className="text-xs text-dim">Ext. reference<input aria-label="Ext. reference" type="text" value={extReference} onChange={(event) => setExtReference(event.target.value)} onBlur={() => { if (editing) applyExtReference() }} placeholder="External reference" className="mt-1 block w-full rounded border border-line bg-panel2 px-2 py-1 text-sm text-text" /></label>
    {!editing && <label className="text-xs text-dim">Add N fixtures<PatchNumberField value={consecutive} min={1} max={512} label="Patch consecutive fixtures" onCommit={setConsecutive} /></label>}
  </div>

  const menuItemClass = (danger = false) => `block w-full px-3 py-1.5 text-left text-xs ${danger ? 'text-red-300' : 'text-text'} hover:bg-panel2 disabled:opacity-40`
  const commentsTab = <>
    <label className="mb-3 block text-xs text-dim">Notes<textarea aria-label="Fixture notes" value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => { if (editing) applyNotes() }} rows={5} placeholder="Notes about this fixture" className="mt-1 block w-full rounded border border-line bg-panel2 px-2 py-1 text-sm text-text" /></label>
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-xs text-dim">{outputLine}</p>
      <div className="relative">
        <button type="button" aria-label="Fixture actions" aria-haspopup="menu" aria-expanded={menuOpen} className="btn-theme text-xs" onClick={() => { setMenuOpen((open) => !open); setConfirmDelete(false) }}>…</button>
        {menuOpen && <>
          <button type="button" aria-label="Close fixture actions menu" className="fixed inset-0 z-10 cursor-default" onClick={closeMenu} />
          <div role="menu" aria-label="Fixture actions" className="absolute right-0 z-20 mt-1 w-56 rounded border border-line bg-panel py-1 shadow-xl">
            <button type="button" role="menuitem" className={menuItemClass()} disabled={!editing} title={editing ? undefined : 'Patch the fixture first'} onClick={() => { closeMenu(); if (fixture) onShowInPreview?.(fixture.id) }}>Show in Preview</button>
            <button type="button" role="menuitem" className={menuItemClass()} onClick={() => { closeMenu(); onEditProfile?.(profile) }}>Edit Profile</button>
            <button type="button" role="menuitem" className={menuItemClass()} onClick={() => { closeMenu(); onShowProfileInLibrary?.(profile) }}>Show Profile in Library</button>
            <button type="button" role="menuitem" className={menuItemClass()} disabled={!editing} title={editing ? undefined : 'Patch the fixture first'} onClick={() => { if (!fixture) return; closeMenu(); store().updateFixture(fixture.id, { disabled: !fixture.disabled }) }}>{fixture?.disabled ? 'Enable' : 'Disable'}</button>
            <button type="button" role="menuitem" className={menuItemClass()} disabled={!editing} title={editing ? undefined : 'Patch the fixture first'} onClick={() => { if (!fixture) return; closeMenu(); store().duplicateFixture(fixture.id); onNotice?.(`Duplicated ${fixture.name} — the copy is in Fixture Storage`) }}>Duplicate…</button>
            <button type="button" role="menuitem" className={menuItemClass(true)} disabled={!editing} title={editing ? undefined : 'Patch the fixture first'} onClick={() => { if (!fixture) return; if (!confirmDelete) { setConfirmDelete(true); return } closeMenu(); store().removeFixture(fixture.id); onNotice?.(`Removed ${fixture.name}`) }}>{confirmDelete ? 'Confirm delete?' : 'Delete…'}</button>
          </div>
        </>}
      </div>
    </div>
  </>

  return <div role="dialog" aria-modal="true" aria-label={editing ? `Edit ${fixture?.name ?? profile.name}` : `Patch ${profile.name}`} className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-8" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <form className="panel w-full max-w-md p-4" onSubmit={(event) => { event.preventDefault(); if (!editing) patch() }}>
      <div className="mb-1 flex items-center justify-between"><strong className="text-sm">{editing ? 'Edit fixture' : 'Patch fixture'}</strong><button type="button" className="btn-theme text-xs" onClick={onClose}>{editing ? 'Done' : 'Cancel'}</button></div>
      <p className="mb-3 truncate text-xs text-dim">{profile.manufacturer} · {profile.name}</p>
      <div role="tablist" aria-label="Patch dialog sections" className="mb-3 flex gap-1 border-b border-line">
        {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-label={`${item.label} tab`} className={`rounded-t px-3 py-1.5 text-xs ${tab === item.id ? 'bg-panel2 font-semibold text-text' : 'text-dim hover:bg-panel2'}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      {tab === 'kind' && kindTab}
      {tab === 'patching' && patchingTab}
      {tab === 'comments' && commentsTab}
      {error && <div role="alert" className="mb-3 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</div>}
      {!editing && <div className="flex justify-end gap-2"><button type="button" className="btn-theme text-xs" onClick={onClose}>Cancel</button><button type="submit" className="btn-theme text-xs" disabled={!canPatch}>Patch</button></div>}
    </form>
  </div>
}
