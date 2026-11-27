import { useRef } from 'react'
import { useShowStore } from '../stores/showStore'
import { calculateTapTempo } from '../lib/tapTempo'
import { LiveWorkspace } from './LiveWorkspace'
import { MasterFader } from './MasterFader'

export function LiveTab() {
  const {
    presets,
    activePresetIds,
    togglePreset,
    clearPresets,
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
    <div className="flex gap-3 p-1">
      {/* Master fader column (LightKey): a flex-row sibling of the Live
          workspace, OUTSIDE the canvas scroll container — the separate Live
          window has no bottom panel to anchor an overlay to, so the column
          sits beside the workspace instead of on top of it, and canvas
          pan/zoom/edit cannot move it. It stretches to the workspace
          height, so the rail fills the window like LightKey's tall bar. */}
      <MasterFader master={master} setMaster={setMaster} bpm={bpm} onTap={tapTempo} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
      <LiveWorkspace />
      {/* No cue grid here any more (Jake, 26 Nov 2026 — Option 2), and no
          fixed cue-list bar (Jake, 27 Nov 2026 — LightKey's way): a
          cuelist is a placed object on the Live page, arranged freely
          with the buttons (Guide ch.11: "You can freely arrange buttons,
          text labels, and cuelists in the Live view"). The cuelist widget
          on the canvas carries the transport and the steps; the toggle
          lives on the widget's step rows — clicking the active step
          turns its cue off. */}
      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between"><h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim">Preset layers</h3>{activePresetIds.length > 0 && <button type="button" className="text-xs text-dim underline" onClick={() => clearPresets()}>Clear presets</button>}</div>
        {presets.length === 0 ? <p className="text-xs text-dim">Capture reusable presets in Edit.</p> : <div className="grid grid-cols-4 gap-1.5">{presets.map((preset) => <button key={preset.id} type="button" aria-pressed={activePresetIds.includes(preset.id)} onClick={() => togglePreset(preset.id)} className={`pad rounded border border-line px-2 py-2 text-xs ${activePresetIds.includes(preset.id) ? 'active' : 'bg-panel2 text-text hover:bg-accent hover:text-[#111]'}`}><span className="block truncate">{preset.name}</span><span className="text-[9px] opacity-70">{preset.category}</span></button>)}</div>}
      </section>

      </div>
    </div>
  )
}
