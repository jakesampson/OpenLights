import { useShowStore } from '../stores/showStore'
import { getPresetColor } from '../lib/presetColor'

/** The Cues section — the cue grid under the Live canvas (Jake,
 * 26 Nov 2026). Shared by the separate Live window (LiveTab) and the
 * main window's Live tab (App renders it below LiveWorkspace): the cue
 * list must exist in both, because the Live window is unreachable on
 * Windows (its native Window menu has no menu-bar surface on the
 * frameless window). The two renderings are identical except for the
 * optional `className` on the section — the main window passes the
 * Master-column inset (see App), the Live window passes nothing.
 *
 * Clicking the lit cue turns it off again — the same toggle presets
 * already have. Only this button toggles; activateCue stays
 * activation-only for the wizard, cue-list playback, MIDI, number keys
 * and search. */
export function LiveCueButtons({ className }: { className?: string }) {
  const { cues, presets, activeCueId, activateCue, deactivateCue } = useShowStore()
  return (
    <section className={`flex flex-col gap-1${className ? ` ${className}` : ''}`}>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Cues</h3>
      {cues.length === 0 ? (
        <p className="py-2 text-xs text-dim">No cues yet — edit fixtures in Design to start a new cue, then add it in Live Edit.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {cues.map((cue) => (
            <button
              key={cue.id}
              type="button"
              onClick={() => (cue.id === activeCueId ? deactivateCue() : activateCue(cue.id))}
              className={`pad rounded border border-line px-2 py-2 text-xs transition-colors ${
                cue.id === activeCueId
                  ? 'active'
                  : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'
              }`}
            >
              <span className="flex items-center justify-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getPresetColor(cue, presets) }} />{cue.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
