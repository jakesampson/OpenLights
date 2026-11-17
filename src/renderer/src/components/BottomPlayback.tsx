import { useRef } from 'react'
import { useShowStore } from '../stores/showStore'
import { getPresetColor } from '../lib/presetColor'
import { calculateTapTempo } from '../lib/tapTempo'
import { bottomPanelMode } from '../lib/bottomPanel'
import { DesignTab } from './DesignTab'
import { frameForCue } from '../lib/liveFrames'

interface Props { view: 'Design' | 'Live' }

export function BottomPlayback({ view }: Props) {
  const state = useShowStore()
  const taps = useRef<number[]>([])
  const page = state.show?.livePages?.find((item) => item.id === state.activeLivePageId) ?? state.show?.livePages?.[0]
  const widget = page?.cueListWidgets?.[0]
  const list = state.cueLists.find((item) => item.id === widget?.cueListId)
  const mode = bottomPanelMode(view, Boolean(list))
  const tap = () => {
    const result = calculateTapTempo(taps.current, performance.now())
    taps.current = result.taps
    if (result.bpm !== null) state.setBpm(result.bpm)
  }

  return <div className="playback-panel" data-testid="bottom-playback">
    <aside className="playback-master" aria-label="Master output">
      <span>Master</span>
      <input aria-label="Master" type="range" min="0" max="255" value={state.master} onChange={(event) => state.setMaster(Number(event.target.value))} />
      <strong>{state.master === 255 ? 'Full' : `${Math.round(state.master / 255 * 100)}%`}</strong>
      <button type="button" onClick={tap} title="Tap tempo">{state.bpm} <small>bpm</small></button>
    </aside>

    <section className="playback-content" aria-label={view === 'Design' ? 'Fixture controls' : 'Live playback'}>
      {mode === 'fixture-controls' ? <div className="fixture-controls-bottom"><DesignTab /></div> : mode === 'cuelist-playback' && list ? <div className="cuelist-playback">
        <div className="cuelist-head"><span>Name</span><span>Hold Time</span><span>Fade Time</span></div>
        {list.steps.map((step, index) => <button key={step.id} type="button" className={state.activeCueListId === list.id && state.activeCueIndex === index ? 'active' : ''} onClick={() => state.goToCue(list.id, index)}>
          <span>{String(index + 1).padStart(3, '0')} {state.scenes.find((scene) => scene.id === step.sceneId)?.name ?? 'Missing scene'}</span>
          <span>{(step.holdMs / 1000).toFixed(1)}s</span><span>{(step.fadeMs / 1000).toFixed(1)}s</span>
        </button>)}
        <div className="cuelist-transport"><input aria-label="Manual crossfade" title="Manual crossfade" type="range" min="0" max="1" step="0.01" value={state.manualCrossfade} onChange={(event) => state.setManualCrossfade(Number(event.target.value))} /><button onClick={state.stopCue} aria-label="Stop">■</button><button onClick={state.cuePrev} aria-label="Previous cue">Ⅱ</button><button onClick={state.cueNext} aria-label="Next cue">»</button></div>
      </div> : <div className="live-playback-stack">
        <div className="scene-playback-grid" aria-label="Scene buttons">
          {state.scenes.map((scene) => <button key={scene.id} type="button" aria-pressed={scene.id === state.activeSceneId}
            className={scene.id === state.activeSceneId ? 'active' : ''}
            style={{ '--scene-colour': getPresetColor(scene) } as React.CSSProperties}
            onClick={() => state.goToScene(scene.id)}>{scene.name}<span>{scene.fadeMs / 1000}s</span></button>)}
        </div>
        <div className="live-playback-grid" aria-label="Custom Live controls">
        {page?.controls.map((control) => {
          const level = state.activeLiveValues[control.id] ?? 0
          return control.type === 'fader' ? <label key={control.id}>{control.name}<input type="range" min="0" max="255" value={level} onChange={(event) => state.setLiveValue(control.id, Number(event.target.value))} /></label> :
            <button key={control.id} type="button" aria-pressed={level > 0} className={level ? 'active' : ''} style={{ backgroundColor: level ? undefined : control.appearance?.color }}
              onClick={control.frameStep ? () => { const frame = page && frameForCue(page, control.id); if (frame) state.stepLiveFrame(frame, control.frameStep === 'next' ? 1 : -1) } : control.type === 'toggle' ? () => state.setLiveValue(control.id, level ? 0 : 255) : undefined}
              onPointerDown={control.type === 'flash' ? () => state.setLiveValue(control.id, 255) : undefined}
              onPointerUp={control.type === 'flash' ? () => state.setLiveValue(control.id, 0) : undefined}
              onPointerCancel={control.type === 'flash' ? () => state.setLiveValue(control.id, 0) : undefined}>{control.name}</button>
        })}
        {!page?.controls.length && <p>Use Edit to add scene buttons or custom controls to this Live page.</p>}
        </div>
      </div>}
    </section>
  </div>
}
