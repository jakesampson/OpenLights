import { useRef } from 'react'
import { useShowStore } from '../stores/showStore'
import { getPresetColor } from '../lib/presetColor'
import { calculateTapTempo } from '../lib/tapTempo'

export function LiveTab() {
  const {
    scenes,
    presets,
    activePresetIds,
    togglePreset,
    clearPresets,
    cueLists,
    activeSceneId,
    activeCueListId,
    activeCueIndex,
    goToScene,
    goToCue,
    cueNext,
    cuePrev,
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-bg/30 px-3 py-2">
        <div><span className="block text-[10px] font-semibold uppercase tracking-wider text-dim">Live output</span><span className="text-xs text-text">{scenes.find((scene) => scene.id === activeSceneId)?.name ?? 'No scene selected'}</span></div>
        <label className="flex items-center gap-2 text-xs text-dim">Master <input aria-label="Master intensity" type="range" min={0} max={255} value={master} onChange={(event) => setMaster(Number(event.target.value))} className="w-32 accent-[var(--accent)]" /><span className="w-10 text-right font-mono text-text">{Math.round(master / 255 * 100)}%</span></label>
      </div>
      <div className="flex items-center gap-2 text-xs text-dim"><span>Tempo</span><input aria-label="Tempo in BPM" type="number" min={30} max={240} value={bpm} onChange={(event) => setBpm(Number(event.target.value))} className="w-16 rounded border border-line bg-panel2 px-2 py-1 text-center text-text" /><span>BPM</span><button type="button" onClick={tapTempo} className="btn-theme text-xs">Tap tempo</button><span className="text-[10px]">Syncs beat-based effects</span></div>
      <section className="flex flex-col gap-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Scenes</h3>
        {scenes.length === 0 ? (
          <p className="py-2 text-xs text-dim">Create scenes in the Edit tab.</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => goToScene(scene.id)}
                className={`pad rounded border border-line px-2 py-2 text-xs transition-colors ${
                  scene.id === activeSceneId
                    ? 'active'
                    : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'
                }`}
              >
                <span className="flex items-center justify-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getPresetColor(scene) }} />{scene.name}</span>
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
          <p className="py-2 text-xs text-dim">Create cue lists in the Edit tab.</p>
        ) : (
          cueLists.map((list) => (
            <div key={list.id} className="flex flex-col gap-1 rounded border border-line p-2">
              <div className="flex items-center justify-between gap-2">
                <div><h4 className="text-xs font-semibold text-text">{list.name}</h4><span className="text-[10px] text-dim">{activeCueListId === list.id && activeCueIndex >= 0 ? `Cue ${activeCueIndex + 1} of ${list.steps.length}` : 'Select a cue to begin'}</span></div>
                <div className="flex gap-1"><button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={activeCueListId !== list.id || activeCueIndex < 0} onClick={cuePrev}>Back</button><button type="button" className="btn-theme on text-xs disabled:opacity-40" disabled={list.steps.length === 0} onClick={() => activeCueListId === list.id && activeCueIndex >= 0 ? cueNext() : goToCue(list.id, 0)}>Go</button></div>
              </div>
              {list.steps.length === 0 ? (
                <span className="text-[10px] text-dim">No cues yet</span>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {list.steps.map((step, index) => {
                    const sceneName = scenes.find((scene) => scene.id === step.sceneId)?.name
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
                        title={`${sceneName ?? 'Missing scene'} · ${step.fadeMs}ms fade`}
                      >
                        <span className="block truncate">{sceneName ?? 'Missing scene'}</span>
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