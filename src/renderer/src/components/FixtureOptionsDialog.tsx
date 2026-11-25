import { useMemo, useState } from 'react'
import { useShowStore } from '../stores/showStore'

// Fixture Options… (LightKey Guide pp.62–63): the Inspector's home for
// the fixture options that don't belong in the panel itself — the beam
// width in the Preview and the DMX dimmer limits. Hide light beam,
// Ignore Master Dimmer and Disable stay as checkboxes in the Inspector.
export function FixtureOptionsDialog({ fixtureIds, onClose }: { fixtureIds: string[]; onClose: () => void }) {
  const show = useShowStore((s) => s.show)
  const fixtures = useMemo(() => fixtureIds.map((id) => show?.fixtures.find((f) => f.id === id)).filter((f) => f !== undefined), [fixtureIds, show?.fixtures])
  const first = fixtures[0]
  const [beamAngle, setBeamAngle] = useState(first?.previewBeam?.beamAngle !== undefined ? String(first.previewBeam.beamAngle) : '')
  const [minDimmer, setMinDimmer] = useState(first?.minDimmer ?? 0)
  const [maxDimmer, setMaxDimmer] = useState(first?.maxDimmer ?? 255)
  if (!first) return null
  // A spinner click steps the value without a normal text-field click,
  // so Chromium may leave focus elsewhere — the same focus trap the
  // Inspector's number inputs guard against (Jake, 20 Nov 2026).
  const focusNumberInput = (event: React.MouseEvent<HTMLInputElement>) => event.currentTarget.focus()
  const save = () => {
    const angle = beamAngle.trim() === '' ? undefined : Math.max(5, Math.min(120, Math.round(Number(beamAngle))))
    const min = Math.max(0, Math.min(255, Math.round(Number(minDimmer) || 0)))
    const max = Math.max(0, Math.min(255, Math.round(Number(maxDimmer) || 0)))
    const state = useShowStore.getState()
    state.beginHistoryGroup()
    for (const fixture of fixtures) {
      const { beamAngle: _omit, ...rest } = fixture.previewBeam ?? {}
      const beam = rest as { direction?: number | 'auto'; color?: string }
      state.updateFixture(fixture.id, { minDimmer: min, maxDimmer: max, previewBeam: { ...beam, direction: beam.direction ?? 'auto', ...(angle !== undefined ? { beamAngle: angle } : {}) } })
    }
    state.endHistoryGroup()
    onClose()
  }
  return <div className="header-lock-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <form className="header-lock-dialog" role="dialog" aria-modal="true" aria-label="Fixture Options" onSubmit={(event) => { event.preventDefault(); save() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() } }}>
      <strong>Fixture Options</strong>
      <label className="block">Beam angle
        <input autoFocus type="number" min={5} max={120} aria-label="Beam angle" placeholder="Default" value={beamAngle} onClick={focusNumberInput} onMouseUp={focusNumberInput} onChange={(event) => setBeamAngle(event.target.value)} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" />
        <span className="text-[11px] text-dim">The width of the beam in the Preview, in degrees. Empty uses the default.</span>
      </label>
      <label className="block">Minimum dimmer
        <input type="number" min={0} max={255} aria-label="Minimum dimmer" value={minDimmer} onClick={focusNumberInput} onMouseUp={focusNumberInput} onChange={(event) => setMinDimmer(Number(event.target.value))} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" />
      </label>
      <label className="block">Maximum dimmer
        <input type="number" min={0} max={255} aria-label="Maximum dimmer" value={maxDimmer} onClick={focusNumberInput} onMouseUp={focusNumberInput} onChange={(event) => setMaxDimmer(Number(event.target.value))} className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-xs text-text" />
        <span className="text-[11px] text-dim">The DMX values sent when the Dimmer is set to Off and Full.</span>
      </label>
      <div>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary">Done</button>
      </div>
    </form>
  </div>
}
