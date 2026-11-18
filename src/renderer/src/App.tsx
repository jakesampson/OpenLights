import { useEffect, useRef, useState } from 'react'
import { useShowStore } from './stores/showStore'
import { AutomationPanel } from './components/AutomationPanel'
import { MidiPanel } from './components/MidiPanel'
import { PatchPanel } from './components/PatchPanel'
import { ProjectBar } from './components/ProjectBar'
import { isLiveWindow, startLiveWindowBridge } from './lib/liveWindowBridge'
import { WorkspaceToolbar } from './components/WorkspaceToolbar'
import { ProjectSearch } from './components/ProjectSearch'
import { SHORTCUTS, matchShortcut } from './lib/shortcuts'
import { LiveTab } from './components/LiveTab'
import { LiveWorkspace } from './components/LiveWorkspace'
import { StagePreview } from './components/StagePreview'
import { GroupsPresetsPanel } from './components/GroupsPresetsPanel'
import { DmxConnection } from './components/DmxConnection'
import { ViewSwitch } from './components/ViewSwitch'
import { BottomPlayback } from './components/BottomPlayback'
import { configureSequences, configureEffects, configurePresetOutput, configureLiveOutput, configureOverrideOutput } from './lib/output'
import { computeSceneChannels } from './lib/automationRuntime'
import { startCuePlaybackClock } from './lib/cuePlaybackClock'
import { adaptiveBackgroundHue } from './lib/adaptiveBackground'
import { liveFadeMs, liveOutputLevels } from './lib/liveFrames'
import { activeCueSequenceIds } from './lib/liveDrops'
import { orderedLiveControls } from './lib/cuePriority'
import { activeOwnedEffects } from './lib/effectOwnership'
import { ContextMenu } from './components/ContextMenu'

type Tab = 'Design' | 'Live'
type ToolPanel = 'Patch' | 'Automation' | 'MIDI'

export default function App() {
  const {
    show,
    scenes,
    effects,
    presets,
    activePresetIds,
    activeSequenceIds,
    activeLiveValues,
    liveActivationOrder,
    activeLivePageId,
    manualOverrides,
    bpm,
    activeSceneId,
    master,
    blackout,
    blind,
    freeze,
    toggleBlackout,
    goToScene,
    cueNext,
    cuePrev,
    stopCue
  } = useShowStore()
  const [tab, setTab] = useState<Tab>('Design')
  const [windowMaximized, setWindowMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adaptiveBackground, setAdaptiveBackground] = useState(() => localStorage.getItem('openlights.adaptiveBackground') !== 'false')
  const [toolPanel, setToolPanel] = useState<ToolPanel | null>(null)
  const titleClickTimeout = useRef<number | null>(null)
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  useEffect(() => {
    document.documentElement.dataset.theme = show?.preferences?.theme ?? 'dark'
  }, [show?.preferences?.theme])

  const previousLivePage = useRef<string | null>(null)
  useEffect(() => {
    localStorage.setItem('openlights.adaptiveBackground', String(adaptiveBackground))
    const root = document.documentElement
    if (!adaptiveBackground) { root.style.removeProperty('--adaptive-hue'); root.removeAttribute('data-adaptive'); return }
    root.dataset.adaptive = 'true'
    let alive = true
    let pending = false
    const refresh = async () => {
      if (pending || !window.electronAPI?.getChannels) return
      pending = true
      try {
        const channels = await window.electronAPI.getChannels()
        if (!alive) return
        const state = useShowStore.getState()
        const scene = state.scenes.find((item) => item.id === state.activeSceneId)
        const hue = adaptiveBackgroundHue(state.show?.fixtures ?? [], channels, scene)
        root.style.setProperty('--adaptive-hue', String(hue ?? 283))
      } catch { /* Keep the previous appearance if output is unavailable. */ }
      finally { pending = false }
    }
    void refresh()
    const timer = window.setInterval(refresh, 200)
    return () => { alive = false; window.clearInterval(timer); root.style.removeProperty('--adaptive-hue'); root.removeAttribute('data-adaptive') }
  }, [adaptiveBackground])

  useEffect(() => {
    let active = true
    window.electronAPI
      .getWindowMaximized()
      .then((maximized) => {
        if (active) setWindowMaximized(maximized)
      })
      .catch((error) => console.error('Failed to get window state', error))
    const unsubscribe = window.electronAPI.onWindowMaximized(setWindowMaximized)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    configureEffects({
      effects: activeOwnedEffects(effects, { presets: activePresetIds, sequences: activeSequenceIds, cues: activeLiveValues }),
      fixtures: show?.fixtures ?? [],
      bpm,
      master,
      blackout
    })
  }, [effects, activePresetIds, activeSequenceIds, activeLiveValues, show?.fixtures, bpm, master, blackout])

  useEffect(() => {
    // Sequences can be started globally or dropped onto a live cue; an active
    // cue's sequences run for as long as that cue is lit.
    const ids = new Set([...activeSequenceIds, ...activeCueSequenceIds(show?.livePages, activeLiveValues)])
    configureSequences([...ids].flatMap((id) => (show?.sequences ?? []).filter((s) => s.id === id)), presets)
  }, [show?.sequences, show?.livePages, activeSequenceIds, activeLiveValues, presets])

  useEffect(() => {
    const patch: Record<number, number> = {}
    for (const id of activePresetIds) {
      const preset = presets.find((item) => item.id === id)
      if (!preset) continue
      Object.assign(patch, computeSceneChannels(show?.fixtures ?? [], { id: preset.id, name: preset.name, fadeMs: 0, fixtureValues: preset.fixtureValues }, master))
    }
    configurePresetOutput(patch)
  }, [presets, activePresetIds, show?.fixtures, master])

  useEffect(() => {
    const patch: Record<number, number> = {}
    const outputLevels = liveOutputLevels(show?.livePages, activeLiveValues)
    for (const control of orderedLiveControls(show?.livePages, outputLevels, liveActivationOrder)) {
      const level = outputLevels[control.id] ?? 0
      if (!level && !(control.type === 'fader' && control.id in outputLevels)) continue
      const scaledMaster = master * level / 255
      const scene = scenes.find((item) => item.id === control.sceneId)
      if (scene && !scene.blackout) Object.assign(patch, computeSceneChannels(show?.fixtures ?? [], scene, scaledMaster))
      for (const id of control.presetIds) {
        const preset = presets.find((item) => item.id === id)
        if (preset) Object.assign(patch, computeSceneChannels(show?.fixtures ?? [], { id, name: preset.name, fadeMs: 0, fixtureValues: preset.fixtureValues }, scaledMaster))
      }
      if (control.adHocValues) Object.assign(patch, computeSceneChannels(show?.fixtures ?? [], { id: control.id, name: control.name, fadeMs: 0, fixtureValues: control.adHocValues }, scaledMaster))
    }
    const changed = previousLivePage.current !== activeLivePageId
    previousLivePage.current = activeLivePageId
    const activePage = show?.livePages?.find((page) => page.id === activeLivePageId)
    const pageFade = liveFadeMs(activePage, outputLevels, activePage?.fadeMs ?? 0)
    configureLiveOutput(patch, changed ? pageFade : 0)
  }, [show?.livePages, show?.fixtures, scenes, presets, activeLiveValues, liveActivationOrder, activeLivePageId, master])

  useEffect(() => {
    configureOverrideOutput(computeSceneChannels(show?.fixtures ?? [], { id: 'manual', name: 'Manual', fadeMs: 0, fixtureValues: manualOverrides }, master))
  }, [manualOverrides, show?.fixtures, master])

  useEffect(() => isLiveWindow() ? undefined : startCuePlaybackClock(), [])
  useEffect(() => startLiveWindowBridge(), [])


  const blackoutDMX = async () => {
    try {
      if (!window.electronAPI) return
      await window.electronAPI.blackout()
    } catch (e) {
      console.error('DMX blackout error', e)
    }
  }

  const handleBlackout = async () => {
    if (!blackout) await blackoutDMX()
    toggleBlackout()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const binding = matchShortcut(event, event.target as HTMLElement | null)
      if (!binding) return
      event.preventDefault()
      const state = useShowStore.getState()
      const command = binding.command
      if (command === 'undo' || command === 'redo') state[command]()
      else if (['save', 'saveAs', 'open', 'new', 'close'].includes(command)) window.dispatchEvent(new CustomEvent('openlights-project-command', { detail: command }))
      else if (command === 'design') { if (!state.locked) setTab('Design') }
      else if (command === 'live') setTab('Live')
      else if (command.startsWith('zoom')) window.dispatchEvent(new CustomEvent('openlights-preview-zoom', { detail: ({ zoomIn: 'in', zoomOut: 'out', zoomFit: 'fit', zoomSelection: 'selection' } as Record<string, string>)[command] }))
      else if (command === 'fullscreen') void window.electronAPI.toggleFullscreen()
      else if (command === 'blackout') state.toggleBlackout()
      else if (command === 'next') state.cueNext()
      else if (command === 'previous') state.cuePrev()
      else if (command === 'go') { if (toolPanel === 'Automation') window.dispatchEvent(new Event('openlights-toggle-play')); else state.cueNext() }
      else if (command === 'escape') { if (toolPanel) setToolPanel(null); else if (settingsOpen) setSettingsOpen(false); else state.stopCue() }
      else if (command.startsWith('scene')) { const scene = state.scenes[Number(command.slice(5)) - 1]; if (scene) state.goToScene(scene.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolPanel, settingsOpen, scenes, goToScene, cueNext, cuePrev, stopCue, toggleBlackout])

  useEffect(() => window.electronAPI.onMenuCommand((command) => {
    const binding = SHORTCUTS.find((item) => item.command === command)
    if (binding) window.dispatchEvent(new KeyboardEvent('keydown', { key: binding.code, ctrlKey: binding.ctrl, shiftKey: binding.shift, altKey: binding.alt }))
  }), [])

  const shortcuts = SHORTCUTS
  const closeToolPanel = () => setToolPanel(null)

  if (isLiveWindow()) return <div className="app overflow-auto p-3"><LiveTab /></div>
  return (
    <div className="app">
      <ContextMenu />
      {/* Top bar */}
      <header className="top-bar">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[10px] font-bold text-[#111]">
            OL
          </div>
          <ProjectBar />
          <ProjectSearch onReveal={(result) => {
            const state = useShowStore.getState()
            if (result.type === 'fixture' || result.type === 'group') { state.selectFixtures(result.type === 'fixture' ? [result.id] : (state.show?.fixtures ?? []).filter((f) => f.group === result.id).map((f) => f.id)); setTab('Design') }
            else if (result.type === 'page' || result.pageId) { state.selectLivePage(result.pageId ?? result.id); setTab('Live') }
            else if (result.listId || result.type === 'cueList') { state.setActiveCueList(result.listId ?? result.id); setTab('Live') }
            requestAnimationFrame(() => {
              const target = document.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(result.id)}"]`)
              if (!target) return
              let parent = target.parentElement
              while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement }
              target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.tabIndex = -1; target.focus({ preventScroll: true })
            })
          }} />
          <details className="relative text-xs"><summary className="btn-theme cursor-pointer">Edit</summary><div className="absolute left-0 top-full z-50 flex w-44 flex-col rounded border border-line bg-panel p-1 shadow-xl"><button type="button" disabled={!useShowStore.getState().undoStack.length} onClick={() => useShowStore.getState().undo()} className="px-3 py-2 text-left disabled:opacity-40">Undo · Ctrl+Z</button><button type="button" disabled={!useShowStore.getState().redoStack.length} onClick={() => useShowStore.getState().redo()} className="px-3 py-2 text-left disabled:opacity-40">Redo · Ctrl+Y</button></div></details>
          <button
            type="button"
            className="btn-theme text-xs"
            onClick={() => setToolPanel('Patch')}
          >
            Patch
          </button>
          <div className="relative">
            <button
              type="button"
              className={`btn-theme text-xs ${settingsOpen ? 'on' : ''}`}
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              Settings
            </button>
            {settingsOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 flex w-56 flex-col rounded-lg border border-line bg-panel p-1 shadow-xl">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-xs text-text hover:bg-panel2">
                  <span>Adaptive background colour</span>
                  <input type="checkbox" checked={adaptiveBackground} onChange={(event) => setAdaptiveBackground(event.target.checked)} />
                </label>
                <label className="px-3 py-2 text-xs">On project open<select aria-label="Project startup state" value={show?.startup?.mode ?? 'none'} onChange={(event) => useShowStore.getState().setStartupMode(event.target.value as 'none' | 'restore')} className="mt-1 w-full rounded bg-panel2 p-1"><option value="none">No active looks</option><option value="restore">Restore saved looks</option></select></label>
                <label className="px-3 py-2 text-xs">Default fade (ms)<input aria-label="Default fade milliseconds" type="number" min="0" value={show?.preferences?.defaultFadeMs ?? 1000} onChange={(event) => useShowStore.getState().updatePreferences({ defaultFadeMs: Math.max(0, Number(event.target.value)) })} className="mt-1 w-full rounded bg-panel2 p-1" /></label>
                <label className="px-3 py-2 text-xs">Page fade (ms)<input aria-label="Page fade milliseconds" type="number" min="0" value={show?.preferences?.pageFadeMs ?? 500} onChange={(event) => useShowStore.getState().updatePreferences({ pageFadeMs: Math.max(0, Number(event.target.value)) })} className="mt-1 w-full rounded bg-panel2 p-1" /></label>
                <label className="px-3 py-2 text-xs">Appearance<select aria-label="Application appearance" value={show?.preferences?.theme ?? 'dark'} onChange={(event) => useShowStore.getState().updatePreferences({ theme: event.target.value as 'dark' | 'system' })} className="mt-1 w-full rounded bg-panel2 p-1"><option value="dark">Dark</option><option value="system">System</option></select></label>
                <label className="px-3 py-2 text-xs">Default USB DMX interface<select aria-label="Default USB DMX interface" value={show?.preferences?.dmxProtocol ?? 'open-dmx-usb'} onChange={(event) => useShowStore.getState().updatePreferences({ dmxProtocol: event.target.value as 'open-dmx-usb' | 'enttec-usb-pro' })} className="mt-1 w-full rounded bg-panel2 p-1"><option value="open-dmx-usb">Open DMX USB</option><option value="enttec-usb-pro">DMX USB Pro</option></select></label>
                <label className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span>Deactivate cues on page switch</span><input type="checkbox" checked={show?.deactivateOnPageSwitch === true} onChange={(event) => useShowStore.getState().setPageSwitchMode(event.target.checked)} /></label>
                <div className="my-1 border-t border-line" />
                <button className="btn-theme text-xs" onClick={() => void window.electronAPI.openLiveWindow(useShowStore.getState().activeLivePageId)}>Open Live window</button>
                <button className="btn-theme text-xs" onClick={() => void window.electronAPI.toggleFullscreen()}>Full screen · F11</button>
                {(['preview', 'palette', 'inspector'] as const).map((panel) => <label key={panel} className="flex items-center justify-between px-3 py-1 text-xs capitalize">{panel}<input type="checkbox" aria-label={`Show ${panel}`} checked={show?.layout?.[panel] ?? true} onChange={(event) => useShowStore.getState().updateProject({ layout: { preview: true, palette: true, inspector: true, ...show?.layout, [panel]: event.target.checked } })} /></label>)}
                <button
                  type="button"
                  className="rounded px-3 py-2 text-left text-xs text-text hover:bg-panel2"
                  onClick={() => {
                    setToolPanel('Automation')
                    setSettingsOpen(false)
                  }}
                >
                  Automation
                </button>
                <button
                  type="button"
                  className="rounded px-3 py-2 text-left text-xs text-text hover:bg-panel2"
                  onClick={() => {
                    setToolPanel('MIDI')
                    setSettingsOpen(false)
                  }}
                >
                  MIDI
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 text-center font-semibold tracking-tight text-base truncate">
          <span
            className="window-title"
            onClick={() => {
              if (titleClickTimeout.current !== null) {
                window.clearTimeout(titleClickTimeout.current)
                titleClickTimeout.current = null
                window.electronAPI.toggleWindowMaximize()
              } else {
                titleClickTimeout.current = window.setTimeout(() => {
                  titleClickTimeout.current = null
                }, 500)
              }
            }}
          >
            {show?.name ?? 'OpenLights'}
            <span className="ml-2 text-[10px] font-normal text-dim">
              {blackout ? '· Blackout' : activeScene ? `· ${activeScene.name}` : '· No scene'}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="window-controls">
            <button
              type="button"
              className="window-control"
              aria-label="Minimize window"
              title="Minimize"
              onClick={() => window.electronAPI.minimizeWindow()}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h10" />
              </svg>
            </button>
            <button
              type="button"
              className="window-control"
              aria-label={windowMaximized ? 'Restore window' : 'Maximize window'}
              title={windowMaximized ? 'Restore' : 'Maximize'}
              onClick={() => window.electronAPI.toggleWindowMaximize()}
            >
              {windowMaximized ? (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5 5h8v8H5zM3 11H2V2h9v1" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 3h10v10H3z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="window-control window-control-close"
              aria-label="Close window"
              title="Close"
              onClick={() => window.electronAPI.closeWindow()}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 4 8 8m0-8-8 8" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <WorkspaceToolbar view={tab} onView={setTab} onBlackout={handleBlackout} />
      {/* Main row */}
      <div className="main-grid" style={{ display: show?.layout?.preview === false && show?.layout?.palette === false ? 'none' : undefined, gridTemplateColumns: show?.layout?.preview === false || show?.layout?.palette === false ? '1fr' : undefined }}>
        {show?.layout?.preview !== false && <div className="preview-stack relative"><StagePreview />{blind && <div role="status" className="absolute left-3 top-3 z-40 rounded bg-amber-400 px-2 py-1 text-xs font-bold text-black">BLIND · preview only</div>}{freeze && <div role="status" className="absolute right-3 top-3 z-40 rounded bg-sky-400 px-2 py-1 text-xs font-bold text-black">FROZEN · output held</div>}</div>}

        <div className="panel side-panel overflow-hidden p-2 min-h-0 flex flex-col gap-1" style={{ display: show?.layout?.palette === false ? 'none' : undefined }}>
          <div className="flex items-center justify-between px-2 py-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-dim">
              Groups & Presets
            </div>
            <div className="text-[9px] uppercase tracking-wider text-dim">fixture tree</div>
          </div>
          <GroupsPresetsPanel />
        </div>
      </div>

      {/* Design/Live view switch — bottom centre, on the divider between preview and bottom panel */}
      <ViewSwitch view={tab} onView={(view) => { if (view !== 'Edit') setTab(view) }} />

      {/* Bottom row */}
      <div className="bottom-grid">
        <div className={`panel ${tab === 'Live' ? 'live-page-shell' : 'playback-shell'}`}>
          {tab === 'Live' ? <LiveWorkspace /> : <BottomPlayback />}
        </div>

        <div className="panel overflow-hidden p-2 min-h-0 flex flex-col">
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
            Shortcuts · {tab}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {shortcuts.map((s) => (
              <div
                key={s.key + s.label}
                className="flex items-center justify-between gap-2 px-1 py-1 text-xs border-b border-line/40 last:border-0"
              >
                <kbd className="rounded bg-panel2 border border-line px-1.5 py-0.5 text-zinc-300 shrink-0">
                  {s.key}
                </kbd>
                <span className="text-dim truncate text-right">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {toolPanel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeToolPanel()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={toolPanel}
            className="panel flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-dim">
                {toolPanel === 'Patch' ? 'Fixture Patch' : toolPanel}
              </h2>
              <button type="button" className="btn-theme text-xs" onClick={closeToolPanel}>
                Close
              </button>
            </header>
            <div className="min-h-0 overflow-auto p-4">
              {toolPanel === 'Patch' && <PatchPanel />}
              {toolPanel === 'Automation' && <AutomationPanel />}
              {toolPanel === 'MIDI' && <MidiPanel />}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
