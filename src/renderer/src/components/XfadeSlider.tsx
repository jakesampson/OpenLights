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
export function XfadeSlider({ listId }: { listId: string }) {
  const { cueLists, cues, activeCueListId, activeCueIndex, manualCrossfade, manualCrossfadeAnchor, setManualCrossfade } = useShowStore()
  const list = cueLists.find((item) => item.id === listId)
  if (!list) return null
  const active = activeCueListId === list.id && activeCueIndex >= 0
  const nextIndex = active ? manualCrossfadeNextIndex(list, activeCueIndex) : -1
  const next = nextIndex >= 0 ? cues.find((cue) => cue.id === list.steps[nextIndex]?.cueId) : undefined
  const disabled = !active || !next
  const progress = manualCrossfadeProgress(manualCrossfadeAnchor, manualCrossfade)
  return (
    <label className="flex items-center gap-2 text-xs" title={disabled ? 'Start playback to use Xfade' : `Crossfade to ${next?.name ?? 'next cue'}`}>
      <span className="shrink-0 text-dim">Xfade</span>
      <input
        type="range"
        aria-label={`Xfade ${list.name}`}
        min={0}
        max={1}
        step={0.01}
        value={manualCrossfade}
        disabled={disabled}
        onChange={(event) => setManualCrossfade(Number(event.target.value))}
        className="min-w-0 flex-1 accent-[var(--accent)] disabled:opacity-40"
      />
      <span className="w-10 shrink-0 text-right text-dim">{disabled ? '—' : `${Math.round(progress * 100)}%`}</span>
    </label>
  )
}
