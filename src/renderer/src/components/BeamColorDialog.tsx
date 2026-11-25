import { useMemo, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { fixtureHasDmxColourControl } from '../lib/previewOutput'

// Beam Color… (LightKey Guide p.61): for fixtures with a fixed colour
// that can't be changed through DMX (e.g. a PAR with a colour gel) —
// choose the virtual beam colour, also shown as a dot inside the
// fixture icon. Fixtures with DMX colour control always show their
// live colour, so the button is greyed out for them and this dialog
// only ever writes the fixtures it applies to.
export function BeamColorDialog({ fixtureIds, onClose }: { fixtureIds: string[]; onClose: () => void }) {
  const show = useShowStore((s) => s.show)
  const fixtures = useMemo(() => fixtureIds.map((id) => show?.fixtures.find((f) => f.id === id)).filter((f) => f !== undefined), [fixtureIds, show?.fixtures])
  const supported = useMemo(() => fixtures.filter((f) => !fixtureHasDmxColourControl(f)), [fixtures])
  const first = supported[0]
  const [color, setColor] = useState(first?.previewBeam?.color ?? '#ffffff')
  if (!first) return null
  const save = (nextColor: string | null) => {
    const state = useShowStore.getState()
    state.beginHistoryGroup()
    for (const fixture of supported) {
      const { color: _omit, ...rest } = fixture.previewBeam ?? {}
      const beam = rest as { direction?: number | 'auto'; beamAngle?: number }
      state.updateFixture(fixture.id, { previewBeam: { ...beam, direction: beam.direction ?? 'auto', ...(nextColor ? { color: nextColor } : {}) } })
    }
    state.endHistoryGroup()
    onClose()
  }
  return <div className="header-lock-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <form className="header-lock-dialog" role="dialog" aria-modal="true" aria-label="Beam Color" onSubmit={(event) => { event.preventDefault(); save(color) }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() } }}>
      <strong>Beam Color</strong>
      <p>For fixtures with a fixed colour that can&apos;t be changed through DMX — the virtual beam colour in the Preview. {supported.length < fixtures.length && `${fixtures.length - supported.length} selected fixture${fixtures.length - supported.length === 1 ? '' : 's'} already change${fixtures.length - supported.length === 1 ? 's' : ''} colour through DMX, so this doesn&apos;t apply to ${fixtures.length - supported.length === 1 ? 'it' : 'them'}.`}</p>
      <label className="flex items-center gap-2">Colour
        <input autoFocus type="color" aria-label="Beam colour" value={color} onChange={(event) => setColor(event.target.value)} className="h-8 w-12 cursor-pointer rounded border border-line bg-panel2" />
        <span className="font-mono text-xs">{color}</span>
      </label>
      <div>
        <button type="button" onClick={() => save(null)}>Reset</button>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary">Done</button>
      </div>
    </form>
  </div>
}
