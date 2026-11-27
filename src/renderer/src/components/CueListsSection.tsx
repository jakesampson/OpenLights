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

  const cueName = (cueId: string | undefined) => cues.find((cue) => cue.id === cueId)?.name ?? 'Missing cue'

  return (
    <section className={`flex flex-col gap-1 ${variant === 'compact' ? 'flex-none' : ''}`}>
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
          if (variant === 'compact') {
            return (
              <div key={list.id} className="flex flex-col gap-1 rounded border border-line p-2">
                {transport}
                <p className="text-[10px] text-dim">Current: {currentStep ? cueName(currentStep.cueId) : 'Not started'} · Next: {nextStep ? `${cueName(nextStep.cueId)} · ${nextStep.fadeMs / 1000}s fade` : 'End of list'}</p>
                <div><button type="button" className="text-[10px] text-dim underline" onClick={() => setExpanded((prev) => ({ ...prev, [list.id]: !prev[list.id] }))}>{expanded[list.id] ? 'Hide steps ▾' : 'Show steps ▸'}</button></div>
                {expanded[list.id] && (
                  <>
                    <div className="grid grid-cols-2 gap-2 rounded bg-bg/40 p-2 text-xs">
                      <div><span className="block text-[10px] uppercase text-dim">Current</span>{currentStep ? cueName(currentStep.cueId) : 'Not started'}</div>
                      <div><span className="block text-[10px] uppercase text-dim">Next</span>{nextStep ? `${cueName(nextStep.cueId)} · ${nextStep.fadeMs / 1000}s fade` : 'End of list'}</div>
                    </div>
                    <XfadeSlider listId={list.id} />
                    {list.steps.length === 0 ? (
                      <span className="text-[10px] text-dim">No cues yet</span>
                    ) : (
                      <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto">
                        {list.steps.map((step, index) => {
                          // Active means this step's cue is the one
                          // playing — the list position alone is not
                          // enough: deactivateCue keeps
                          // activeCueListId/activeCueIndex so Go resumes,
                          // so a deactivated step would otherwise still
                          // read as active.
                          const active = isActive && activeCueIndex === index && activeCueId === step.cueId
                          return (
                            <button
                              key={step.id}
                              type="button"
                              onClick={() => (active ? deactivateCue() : goToCue(list.id, index))}
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
            )
          }
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
