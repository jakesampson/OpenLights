// Beam Color… dialog (Piece 5, wizard Build Your Preview step, video
// 04:45; Guide p.61 "Set a fixture's beam color": "choose the color of the
// virtual light beam"). Sets the virtual beam colour for every selected
// fixture — the colour the Preview draws the beam in. Monochrome fixtures
// are the ones that need it; colour fixtures already show their live colour.

import { useState } from 'react'
import { useShowStore } from '../stores/showStore'

export function BeamColorDialog({ onClose }: { onClose: () => void }) {
  const show = useShowStore((s) => s.show)
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const fixtures = (show?.fixtures ?? []).filter((f) => selectedFixtureIds.includes(f.id))
  const [color, setColor] = useState(fixtures[0]?.previewBeam?.color ?? '#ffffff')

  const apply = () => {
    const state = useShowStore.getState()
    state.beginHistoryGroup()
    for (const id of selectedFixtureIds) {
      const f = state.show?.fixtures.find((fixture) => fixture.id === id)
      state.updateFixture(id, { previewBeam: { direction: 'auto', ...f?.previewBeam, color } })
    }
    state.endHistoryGroup()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="beam-color-title" className="panel flex w-full max-w-[380px] flex-col overflow-hidden shadow-2xl">
        <header className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <h2 id="beam-color-title" className="text-lg font-semibold">Beam Color</h2>
            <p className="mt-1 text-xs text-dim">{fixtures.length === 1 ? fixtures[0].name : `${fixtures.length} fixtures selected`}</p>
          </div>
          <button type="button" className="btn-theme" onClick={onClose} aria-label="Close beam color" title="Close beam color">×</button>
        </header>
        <div className="p-6">
          <label className="block text-xs font-semibold">Beam color
            <input aria-label="Beam color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="mt-2 block h-10 w-full cursor-pointer rounded border border-line bg-panel2" />
          </label>
          <p className="mt-3 text-xs text-dim">The color of the virtual light beam in the Preview. It is also shown as a dot inside the fixture icon.</p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-6 py-3">
          <button type="button" className="btn-theme text-xs" onClick={onClose}>Cancel</button>
          <button type="button" className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-black" onClick={apply}>Done</button>
        </footer>
      </section>
    </div>
  )
}
