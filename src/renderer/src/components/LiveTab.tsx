import { useRef } from 'react'
import { useShowStore } from '../stores/showStore'
import { getPresetColor } from '../lib/presetColor'
import { calculateTapTempo } from '../lib/tapTempo'
import { LiveWorkspace } from './LiveWorkspace'

export function LiveTab() {
  const {
    cues,
    presets,
    activePresetIds,
    togglePreset,
    clearPresets,
    cueLists,
    activeCueId,
    activeCueListId,
    activeCueIndex,
    activateCue,
    goToCue,
    cueNext,
    cuePrev,
    cuePlaying,
    stopCue,
    master,
    setMaster,
    bpm,
    setBpm
  } = useShowStore()

  const taps = useRef<number[]>([])
  const tapTempo = () => {
    const result = calculateTapTempo(taps.current, performance.now())
    taps.current = result.taps
    if (result.bpm !== null) setBpm(result.bpm)
  }
  return (
    <div className="flex flex-col gap-3 p-1">
      <LiveWorkspace />
      <section className="flex flex-col gap-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Cues</h3>
        {cues.length === 0 ? (
          <p className="py-2 text-xs text-dim">No cues yet — edit fixtures in Design to start a new cue, then add it in Live Edit.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {cues.map((cue) => (
              <button
                key={cue.id}
                type="button"
                onClick={() => activateCue(cue.id)}
                className={`pad rounded border border-line px-2 py-2 text-xs transition-colors ${
                  cue.id === activeCueId
                    ? 'active'
                    : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'
                }`}
              >
                <span className="flex items-center justify-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getPresetColor(cue) }} />{cue.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between"><h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Preset layers</h3>{activePresetIds.length > 0 && <button type="button" className="text-xs text-dim underline" onClick={clearPresets}>Clear presets</button>}</div>
        {presets.length === 0 ? <p className="text-xs text-dim">Capture reusable presets in Edit.</p> : <div className="grid grid-cols-4 gap-1.5">{presets.map((preset) => <button key={preset.id} type="button" aria-pressed={activePresetIds.includes(preset.id)} onClick={() => togglePreset(preset.id)} className={`pad rounded border border-line px-2 py-2 text-xs ${activePresetIds.includes(preset.id) ? 'active' : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'}`}><span className="block truncate">{preset.name}</span><span className="text-[9px] opacity-70">{preset.category}</span></button>)}</div>}
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Cue Lists</h3>
        {cueLists.length === 0 ? (
          <p className="py-2 text-xs text-dim">Create or select cue lists from Live Edit.</p>
        ) : (
          cueLists.map((list) => (
            <div key={list.id} className="flex flex-col gap-1 rounded border border-line p-2">
              <div className="flex items-center justify-between gap-2">
                <div><h4 className="text-xs font-semibold text-text">{list.name}</h4><span className="text-[10px] text-dim">{activeCueListId === list.id && activeCueIndex >= 0 ? `Cue ${activeCueIndex + 1} of ${list.steps.length}${cuePlaying ? ' · running' : ' · stopped'}` : 'Press Go to begin'}</span></div>
                <div className="flex gap-1"><button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={activeCueListId !== list.id || !cuePlaying} onClick={stopCue}>Stop</button><button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={activeCueListId !== list.id || activeCueIndex < 0} onClick={cuePrev}>Back</button><button type="button" className="btn-theme on text-xs disabled:opacity-40" disabled={list.steps.length === 0} onClick={() => activeCueListId === list.id && activeCueIndex >= 0 ? cueNext() : goToCue(list.id, 0)}>Go</button></div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded bg-bg/40 p-2 text-xs">
                <div><span className="block text-[10px] uppercase text-dim">Current</span>{activeCueListId === list.id && activeCueIndex >= 0 ? cues.find((cue) => cue.id === list.steps[activeCueIndex]?.cueId)?.name ?? 'Missing cue' : 'Not started'}</div>
                <div><span className="block text-[10px] uppercase text-dim">Next</span>{(() => { const index = activeCueListId === list.id ? activeCueIndex + 1 : 0; const step = list.steps[index] ?? (list.loop ? list.steps[0] : undefined); return step ? `${cues.find((cue) => cue.id === step.cueId)?.name ?? 'Missing cue'} · ${step.fadeMs / 1000}s fade` : 'End of list' })()}</div>
              </div>
              {activeCueListId === list.id && activeCueIndex >= 0 && <p className="text-[10px] text-dim">Next: {(() => { const next = list.steps[activeCueIndex + 1] ?? (list.loop ? list.steps[0] : undefined); return next ? cues.find((cue) => cue.id === next.cueId)?.name ?? 'Missing cue' : 'End of list' })()}</p>}
              {list.steps.length === 0 ? (
                <span className="text-[10px] text-dim">No cues yet</span>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {list.steps.map((step, index) => {
                    const cueName = cues.find((cue) => cue.id === step.cueId)?.name
                    const active =
                      activeCueListId === list.id && activeCueIndex === index
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => goToCue(list.id, index)}
                        className={`pad rounded border border-line px-2 py-2 text-xs transition-colors ${
                          active
                            ? 'active'
                            : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'
                        }`}
                        title={`${cueName ?? 'Missing cue'} · ${step.fadeMs}ms fade`}
                      >
                        <span className="block truncate">{cueName ?? 'Missing cue'}</span>
                        <span className="text-[9px] opacity-70">Cue {index + 1}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </section>


    </div>
  )
}
