import { useMemo, useState } from 'react'
import type { FixtureDef, FixtureProfile } from '@shared/types'
import { allocateFixtures, fixtureWidth, placementError } from '../lib/patch'
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

interface PatchDialogProps {
  profile: FixtureProfile
  initialModeId: string
  start: number
  onPatched: (message: string) => void
  onClose: () => void
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

// LightKey's patch options dialog (Guide pp.29–30, video 1:52–2:27): after
// dragging a profile onto the channel grid, the fixture appears with a
// dashed outline and this window below it — mode, LED count for FLEX
// strips, short name, address, Count (same address) and consecutive
// quantity — instead of patching immediately.
export function PatchDialog({ profile, initialModeId, start, onPatched, onClose }: PatchDialogProps) {
  const { show } = useShowStore()
  const fixtures = show?.fixtures ?? []
  const [modeId, setModeId] = useState(initialModeId)
  const [address, setAddress] = useState(start)
  const [shortName, setShortName] = useState(() => proposeShortName(fixtures.map((f) => f.shortName).filter((s): s is string => Boolean(s)), profile.legacyType))
  const [count, setCount] = useState(1)
  const [consecutive, setConsecutive] = useState(1)
  const [submitError, setSubmitError] = useState('')
  const mode = profile.modes.find((item) => item.id === modeId) ?? profile.modes[0]
  const flexible = mode?.flexibleLeds
  const [ledCount, setLedCount] = useState(flexible?.defaultLeds ?? 0)
  const width = mode ? fixtureWidth(profile, mode.id, flexible ? ledCount : undefined) : 0
  const liveError = placementError(fixtures, address, width)
  const shortNameError = shortName.trim() ? '' : 'Enter a short name'
  // Preview of what Patch will do (allocateFixtures is pure): the landing
  // addresses and short names for the batch, or the reason it cannot fit.
  const plan = useMemo(() => {
    if (liveError || shortNameError) return { patched: [] as FixtureDef[], error: '' }
    try {
      return { patched: allocateFixtures(fixtures, profile, { quantity: consecutive, start: address, modeId: mode?.id, universe: 1, shortName: shortName.trim(), count, ...(flexible ? { ledCount } : {}) }), error: '' }
    } catch (reason) { return { patched: [] as FixtureDef[], error: reason instanceof Error ? reason.message : String(reason) } }
  }, [liveError, shortNameError, fixtures, profile, consecutive, address, mode?.id, shortName, count, flexible, ledCount])
  const error = liveError || shortNameError || plan.error || submitError
  const canPatch = !error && plan.patched.length > 0

  const patch = () => {
    if (!canPatch) return
    const message = summaryFor(plan.patched)
    try {
      useShowStore.getState().addProfileFixtures(profile, { quantity: consecutive, start: address, modeId: mode?.id, universe: 1, shortName: shortName.trim(), count, ...(flexible ? { ledCount } : {}) })
      onPatched(message)
    } catch (reason) { setSubmitError(reason instanceof Error ? reason.message : String(reason)) }
  }

  return <div role="dialog" aria-modal="true" aria-label={`Patch ${profile.name}`} className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-8" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <form className="panel w-full max-w-md p-4" onSubmit={(event) => { event.preventDefault(); patch() }}>
      <div className="mb-1 flex items-center justify-between"><strong className="text-sm">Patch fixture</strong><button type="button" className="btn-theme text-xs" onClick={onClose}>Cancel</button></div>
      <p className="mb-3 truncate text-xs text-dim">{profile.manufacturer} · {profile.name}</p>
      {mode && <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="text-xs text-dim">Mode<select aria-label="Fixture mode" value={mode.id} onChange={(event) => { const next = profile.modes.find((item) => item.id === event.target.value) ?? profile.modes[0]; setModeId(next.id); setLedCount(next.flexibleLeds?.defaultLeds ?? 0) }} className="mt-1 block w-full rounded border border-line bg-panel2 px-2 py-1 text-sm text-text">{profile.modes.map((item) => <option key={item.id} value={item.id}>{item.name} · {fixtureWidth(profile, item.id, item.flexibleLeds?.defaultLeds)}ch</option>)}</select></label>
        <label className="text-xs text-dim">Start at (DMX address)<PatchNumberField value={address} min={1} max={512} label="Start at" onCommit={setAddress} /></label>
        <label className="text-xs text-dim">Short name (max 4 characters)<input aria-label="Short name" type="text" autoFocus value={shortName} maxLength={4} onChange={(event) => setShortName(event.target.value)} onKeyDown={(event) => {
          // Guide p.30: when the short name ends with a number, Up/Down
          // Arrow keys increase/decrease it.
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          const next = incrementShortName(shortName, event.key === 'ArrowUp' ? 1 : -1)
          if (!next) return
          event.preventDefault()
          setShortName(next)
        }} className="mt-1 block w-full rounded border border-line bg-panel2 px-2 py-1 text-sm text-text" /></label>
        <label className="text-xs text-dim">Count (same address)<PatchNumberField value={count} min={1} max={99} label="Count" onCommit={setCount} /></label>
        <label className="text-xs text-dim">Patch consecutive fixtures<PatchNumberField value={consecutive} min={1} max={512} label="Patch consecutive fixtures" onCommit={setConsecutive} /></label>
        {flexible && <label className="text-xs text-dim">LEDs<PatchNumberField value={ledCount} min={flexible.minLeds ?? 1} max={flexible.maxLeds} label="LEDs" onCommit={setLedCount} /></label>}
      </div>}
      <p className="mb-1 text-xs text-dim">{width} channels{plan.patched.length > 0 ? ` · ${summaryFor(plan.patched).replace(/^Patched /, '')}` : ''}</p>
      {error && <div role="alert" className="mb-3 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">{error}</div>}
      <div className="flex justify-end gap-2"><button type="button" className="btn-theme text-xs" onClick={onClose}>Cancel</button><button type="submit" className="btn-theme text-xs" disabled={!canPatch}>Patch</button></div>
    </form>
  </div>
}
