import { useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { XfadeSlider } from './XfadeSlider'

/**
 * The cue-list transport (Guide ch.11, p.218, "Live control with
 * cuelists": during playback the name of the active cue is shown, Go
 * activates the next cue, Stop deactivates all cues in the cuelist).
 *
 * Two variants share one behaviour:
 * - 'full': the whole section as the separate Live window shows it —
 *   header, Current/Next, Xfade, and every step as a button.
 * - 'compact': the main window's Live tab, where the canvas takes most
 *   of the 294px bottom panel. Only the transport fits above the fold:
 *   the list name, the status line, Stop / Back / Go, and a one-line
 *   Current / Next — the steps and Xfade sit behind a disclosure.
 *   Before this existed the main window showed no trace of the active
 *   cuelist at all, so a Go (context menu, Space) could step onto a cue
 *   like "Full On" with nothing visible to explain it or stop it
 *   (Jake, 27 Nov 2026, "nothing is visible to see that or turn it
 *   off").
 */
export function CueListsSection({ variant = 'full' }: { variant?: 'full' | 'compact' } = {}) {
  const {
    cues,
    cueLists,
    activeCueListId,
    activeCueIndex,
    activeCueId,
    goToCue,
    deactivateCue,
    cueNext,
    cuePrev,
    cuePlaying,
    stopCue,
  } = useShowStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // Compact only: which list the slim transport shows. Defaults to the
  // active (playing) list; the picker lets the operator look at — and
  // start — another list. The transport's own Go starts the displayed
  // list, so picking one and pressing Go never leaves the display stale.
  const [shownListId, setShownListId] = useState<string | null>(null)

  const cueName = (cueId: string | undefined) => cues.find((cue) => cue.id === cueId)?.name ?? 'Missing cue'

  if (variant === 'compact') {
    // ONE slim bar for the displayed list (Jake, 27 Nov 2026 — the
    // per-list boxes squeezed the Live canvas to 2px in the fixed 294px
    // bottom panel: the body is ~260px, two ~105px boxes left nothing
    // for the buttons). A single row — list, status, Current / Next,
    // Stop / Back / Go, steps disclosure — is ~33px, so the canvas
    // keeps ~200px and the buttons render exactly as before. The full
    // per-list sections stay in the separate Live window (LiveTab).
    // The bar takes its own Master-fader inset (the fader column is
    // absolutely positioned over the panel's left edge, right edge at
    // 106px; the body adds 6px of padding, so 102px clears it by 2px).
    // The shared master-overlay-inset class is 98px — tuned for the
    // canvas's 12px section padding, 2px short here — so the compact
    // bar sets its own padding instead of reusing it.
    const compactInset = { paddingLeft: 102 } as const
    const displayed =
      cueLists.find((l) => l.id === (shownListId ?? activeCueListId)) ??
      cueLists[0]
    if (!displayed) {
      return (
        <section style={compactInset} className="flex flex-none flex-col gap-1">
          <p className="py-2 text-xs text-dim">Create or select cue lists from Live Edit.</p>
        </section>
      )
    }
    const isActive = activeCueListId === displayed.id
    const currentStep = isActive && activeCueIndex >= 0 ? displayed.steps[activeCueIndex] : undefined
    const nextStep = displayed.steps[isActive ? activeCueIndex + 1 : 0] ?? (displayed.loop ? displayed.steps[0] : undefined)
    const status = isActive && activeCueIndex >= 0
      ? `Cue ${activeCueIndex + 1} of ${displayed.steps.length}${cuePlaying ? ' · running' : ' · stopped'}`
      : 'Press Go to begin'
    const currentNext = `Current: ${currentStep ? cueName(currentStep.cueId) : 'Not started'} · Next: ${nextStep ? `${cueName(nextStep.cueId)} · ${nextStep.fadeMs / 1000}s fade` : 'End of list'}`
    return (
      <section style={compactInset} className="cue-transport-compact flex flex-none flex-col gap-1">
        <div className="flex flex-col gap-1 rounded border border-line px-2 py-0.5">
          <div className="flex min-w-0 items-center gap-2">
            {cueLists.length > 1 ? (
              <select aria-label="Cue list" value={displayed.id} onChange={(e) => setShownListId(e.target.value)} className="min-w-0 shrink-0 rounded bg-bg p-1 text-xs font-semibold text-text">
                {cueLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            ) : (
              <h4 className="shrink-0 text-xs font-semibold text-text">{displayed.name}</h4>
            )}
            <span className="min-w-0 flex-1 truncate text-[10px] text-dim">{status} · {currentNext}</span>
            <button type="button" className="shrink-0 text-[10px] text-dim underline" onClick={() => setExpanded((prev) => ({ ...prev, [displayed.id]: !prev[displayed.id] }))}>{expanded[displayed.id] ? 'Hide steps ▾' : 'Show steps ▸'}</button>
            <div className="flex shrink-0 gap-1"><button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={!isActive || !cuePlaying} onClick={() => stopCue()}>Stop</button><button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={!isActive || activeCueIndex < 0} onClick={() => cuePrev()}>Back</button><button type="button" className="btn-theme on text-xs disabled:opacity-40" disabled={displayed.steps.length === 0} onClick={() => isActive && activeCueIndex >= 0 ? cueNext() : goToCue(displayed.id, 0)}>Go</button></div>
          </div>
          {expanded[displayed.id] && (
            <>
              <div className="grid grid-cols-2 gap-2 rounded bg-bg/40 p-2 text-xs">
                <div><span className="block text-[10px] uppercase text-dim">Current</span>{currentStep ? cueName(currentStep.cueId) : 'Not started'}</div>
                <div><span className="block text-[10px] uppercase text-dim">Next</span>{nextStep ? `${cueName(nextStep.cueId)} · ${nextStep.fadeMs / 1000}s fade` : 'End of list'}</div>
              </div>
              <XfadeSlider listId={displayed.id} />
              {displayed.steps.length === 0 ? (
                <span className="text-[10px] text-dim">No cues yet</span>
              ) : (
                <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto">
                  {displayed.steps.map((step, index) => {
                    const active = isActive && activeCueIndex === index && activeCueId === step.cueId
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => (active ? deactivateCue() : goToCue(displayed.id, index))}
                        className={`pad rounded border border-line px-2 py-2 text-xs transition-colors ${
                          active
                            ? 'active'
                            : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'
                        }`}
                        title={`${cueName(step.cueId)} · ${step.fadeMs}ms fade`}
                      >
                        <span className="block truncate">{cueName(step.cueId)}</span>
                        <span className="text-[9px] opacity-70">Cue {index + 1}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Cue Lists</h3>
      {cueLists.length === 0 ? (
        <p className="py-2 text-xs text-dim">Create or select cue lists from Live Edit.</p>
      ) : (
        cueLists.map((list) => {
          const isActive = activeCueListId === list.id
          const currentStep = isActive && activeCueIndex >= 0 ? list.steps[activeCueIndex] : undefined
          const nextStep = list.steps[isActive ? activeCueIndex + 1 : 0] ?? (list.loop ? list.steps[0] : undefined)
          const status = isActive && activeCueIndex >= 0
            ? `Cue ${activeCueIndex + 1} of ${list.steps.length}${cuePlaying ? ' · running' : ' · stopped'}`
            : 'Press Go to begin'
          const transport = (
            <div className="flex items-center justify-between gap-2">
              <div><h4 className="text-xs font-semibold text-text">{list.name}</h4><span className="text-[10px] text-dim">{status}</span></div>
              <div className="flex gap-1"><button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={!isActive || !cuePlaying} onClick={() => stopCue()}>Stop</button><button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={!isActive || activeCueIndex < 0} onClick={() => cuePrev()}>Back</button><button type="button" className="btn-theme on text-xs disabled:opacity-40" disabled={list.steps.length === 0} onClick={() => isActive && activeCueIndex >= 0 ? cueNext() : goToCue(list.id, 0)}>Go</button></div>
            </div>
          )
          return (
            <div key={list.id} className="flex flex-col gap-1 rounded border border-line p-2">
              {transport}
              <div className="grid grid-cols-2 gap-2 rounded bg-bg/40 p-2 text-xs">
                <div><span className="block text-[10px] uppercase text-dim">Current</span>{isActive && activeCueIndex >= 0 ? cueName(list.steps[activeCueIndex]?.cueId) ?? 'Missing cue' : 'Not started'}</div>
                <div><span className="block text-[10px] uppercase text-dim">Next</span>{(() => { const index = isActive ? activeCueIndex + 1 : 0; const step = list.steps[index] ?? (list.loop ? list.steps[0] : undefined); return step ? `${cueName(step.cueId)} · ${step.fadeMs / 1000}s fade` : 'End of list' })()}</div>
              </div>
              {isActive && activeCueIndex >= 0 && <p className="text-[10px] text-dim">Next: {(() => { const next = list.steps[activeCueIndex + 1] ?? (list.loop ? list.steps[0] : undefined); return next ? cueName(next.cueId) : 'End of list' })()}</p>}
              <XfadeSlider listId={list.id} />
              {list.steps.length === 0 ? (
                <span className="text-[10px] text-dim">No cues yet</span>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {list.steps.map((step, index) => {
                    const cueNameForStep = cues.find((cue) => cue.id === step.cueId)?.name
                    // Active means this step's cue is the one playing — the
                    // list position alone is not enough: deactivateCue
                    // keeps activeCueListId/activeCueIndex so Go resumes,
                    // so a deactivated step would otherwise still read
                    // as active.
                    const active =
                      isActive && activeCueIndex === index && activeCueId === step.cueId
                    return (
                      <button
                        key={step.id}
                        type="button"
                        // The toggle moved here from the removed cue grid
                        // (Jake, 26 Nov 2026 — Option 2): clicking the
                        // active step turns its cue off again, the same
                        // toggle presets have. Go/Back stay activation-only.
                        onClick={() => (active ? deactivateCue() : goToCue(list.id, index))}
                        className={`pad rounded border border-line px-2 py-2 text-xs transition-colors ${
                          active
                            ? 'active'
                            : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'
                        }`}
                        title={`${cueNameForStep ?? 'Missing cue'} · ${step.fadeMs}ms fade`}
                      >
                        <span className="block truncate">{cueNameForStep ?? 'Missing cue'}</span>
                        <span className="text-[9px] opacity-70">Cue {index + 1}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
