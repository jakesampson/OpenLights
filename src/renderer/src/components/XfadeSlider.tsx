import { manualCrossfadeNextIndex, manualCrossfadeProgress } from '../lib/cueListPlayback'
import { useShowStore } from '../stores/showStore'

/**
 * LightKey Xfade slider (8.8a, Guide ch.11, p.191 "Xfade slider: Deselect
 * to hide the slider for manual crossfades" in the cuelist inspector, and
 * p.219 "Manual crossfading": drag the slider from its current position
 * to the opposite end to crossfade from the current cue to the next,
 * ignoring the cue's fade time; moving it back cancels the fade, and
 * after a completed crossfade the next drag goes the opposite way).
 * The slider lives inside the cuelist, next to its transport — rendered
 * once here and shared by the Live page cuelist widget
 * (`LiveWorkspace.tsx`) and the Live tab's Cue Lists section
 * (`LiveTab.tsx`), which already render the same transport twice.
 * Dragging calls `setManualCrossfade`, which blends live output between
 * the two cues and completes the crossfade at the opposite end.
 * Disabled until playback has started on this list (a Go) and while
 * there is no next cue to fade to.
 */
export function XfadeSlider({ listId, vertical = false }: { listId: string; vertical?: boolean }) {
  const { cueLists, cues, activeCueListId, activeCueIndex, manualCrossfade, manualCrossfadeAnchor, setManualCrossfade } = useShowStore()
  const list = cueLists.find((item) => item.id === listId)
  if (!list) return null
  const active = activeCueListId === list.id && activeCueIndex >= 0
  const nextIndex = active ? manualCrossfadeNextIndex(list, activeCueIndex) : -1
  const next = nextIndex >= 0 ? cues.find((cue) => cue.id === list.steps[nextIndex]?.cueId) : undefined
  const disabled = !active || !next
  const progress = manualCrossfadeProgress(manualCrossfadeAnchor, manualCrossfade)
  const input = (
    <input
      type="range"
      aria-label={`Xfade ${list.name}`}
      min={0}
      max={1}
      step={0.01}
      value={manualCrossfade}
      disabled={disabled}
      onChange={(event) => setManualCrossfade(Number(event.target.value))}
      className={vertical ? 'min-h-0 flex-1 accent-[var(--accent)] disabled:opacity-40 [writing-mode:vertical-lr]' : 'min-w-0 flex-1 accent-[var(--accent)] disabled:opacity-40'}
    />
  )
  const readout = <span className={vertical ? 'shrink-0 text-center text-dim' : 'w-10 shrink-0 text-right text-dim'}>{disabled ? (vertical ? '' : '—') : `${Math.round(progress * 100)}%`}</span>
  if (vertical) {
    // LightKey's cuelist Xfade is a vertical fader at the widget's right
    // edge, with tick marks alongside and the % readout at the bottom
    // (Jake's screenshots 5.22.44 / 5.22.25). The input is a native
    // range in vertical writing mode, so the keyboard arrows still work.
    return (
      <div className="flex min-h-0 flex-col items-center gap-1 text-xs" title={disabled ? 'Start playback to use Xfade' : `Crossfade to ${next?.name ?? 'next cue'}`}>
        <div className="flex min-h-0 flex-1 items-stretch gap-0.5">
          {input}
          <span aria-hidden="true" className="w-1 shrink-0 rounded-sm" style={{ background: 'repeating-linear-gradient(to bottom, var(--text-dim) 0 1px, transparent 1px 10%)' }} />
        </div>
        {readout}
      </div>
    )
  }
  return (
    <label className="flex items-center gap-2 text-xs" title={disabled ? 'Start playback to use Xfade' : `Crossfade to ${next?.name ?? 'next cue'}`}>
      <span className="shrink-0 text-dim">Xfade</span>
      {input}
      {readout}
    </label>
  )
}
