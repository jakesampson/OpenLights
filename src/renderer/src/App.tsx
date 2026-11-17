import { useEffect, useRef, useState } from 'react'
import { useShowStore } from './stores/showStore'
import { AutomationPanel } from './components/AutomationPanel'
import { EffectsPanel } from './components/EffectsPanel'
import { MidiPanel } from './components/MidiPanel'
import { PatchPanel } from './components/PatchPanel'
import { ProjectBar } from './components/ProjectBar'
import { DesignTab } from './components/DesignTab'
import { LiveTab } from './components/LiveTab'
import { EditTab } from './components/EditTab'
import { StagePreview } from './components/StagePreview'
import { GroupsPresetsPanel } from './components/GroupsPresetsPanel'
import { DmxConnection } from './components/DmxConnection'
import { configureEffects, configurePresetOutput, configureLiveOutput, configureOverrideOutput } from './lib/output'
import { computeSceneChannels } from './lib/automationRuntime'
import { startCuePlaybackClock } from './lib/cuePlaybackClock'
import { adaptiveBackgroundHue } from './lib/adaptiveBackground'

type Tab = 'Design' | 'Live' | 'Edit'
type ToolPanel = 'Patch' | 'Automation' | 'MIDI'

const bottomTabs: Array<{ id: Tab; label: string }> = [
  { id: 'Design', label: 'Design' },
  { id: 'Live', label: 'Live' },
  { id: 'Edit', label: 'Edit' }
]

const BASE_SHORTCUTS = [
  { key: '1–9', label: 'Recall scene' },
  { key: 'B', label: 'Blackout' },
  { key: 'N / →', label: 'Next cue' },
  { key: 'P / ←', label: 'Previous cue' },
  { key: 'Esc', label: 'Stop' }
]

const TAB_SHORTCUTS: Record<string, Array<{ key: string; label: string }>> = {
  Design: [
    { key: '↑ ↓', label: 'Dimmer step (stub)' },
    { key: 'C', label: 'Colour picker (stub)' },
    { key: 'S', label: 'Shutter toggle (stub)' }
  ],
  Live: [
    { key: 'F1–F8', label: 'Scene bank (stub)' },
    { key: '⇧ 1–9', label: 'Preset recall (stub)' }
  ],
  Edit: [{ key: '⌫', label: 'Delete step (stub)' }],
  Scenes: [{ key: 'Double-click', label: 'Rename scene' }],
  Cues: [{ key: 'Space', label: 'Go to next step' }],
  Effects: [{ key: 'E', label: 'Enable selected (stub)' }],
  Automation: [{ key: 'Space', label: 'Play / pause lane' }],
  Patch: [{ key: 'Del', label: 'Remove fixture' }],
  MIDI: [{ key: 'L', label: 'MIDI learn (stub)' }]
}

export default function App() {
  const {
    show,
    scenes,
    effects,
    presets,
    activePresetIds,
    activeLiveValues,
    manualOverrides,
    bpm,
    activeSceneId,
    master,
    blackout,
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
      effects,
      fixtures: show?.fixtures ?? [],
      bpm,
      master,
      blackout
    })
  }, [effects, show?.fixtures, bpm, master, blackout])

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
    for (const page of show?.livePages ?? []) for (const control of page.controls) {
      const level = activeLiveValues[control.id] ?? 0
      if (!level && !(control.type === 'fader' && control.id in activeLiveValues)) continue
      const scaledMaster = master * level / 255
      const scene = scenes.find((item) => item.id === control.sceneId)
      if (scene && !scene.blackout) Object.assign(patch, computeSceneChannels(show?.fixtures ?? [], scene, scaledMaster))
      for (const id of control.presetIds) {
        const preset = presets.find((item) => item.id === id)
        if (preset) Object.assign(patch, computeSceneChannels(show?.fixtures ?? [], { id, name: preset.name, fadeMs: 0, fixtureValues: preset.fixtureValues }, scaledMaster))
      }
    }
    configureLiveOutput(patch)
  }, [show?.livePages, show?.fixtures, scenes, presets, activeLiveValues, master])

  useEffect(() => {
    configureOverrideOutput(computeSceneChannels(show?.fixtures ?? [], { id: 'manual', name: 'Manual', fadeMs: 0, fixtureValues: manualOverrides }, master))
  }, [manualOverrides, show?.fixtures, master])

  useEffect(() => startCuePlaybackClock(), [])

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
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'Escape') {
        if (toolPanel) {
          setToolPanel(null)
          return
        }
        if (settingsOpen) {
          setSettingsOpen(false)
          return
        }
        stopCue()
        return
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        if (toolPanel === 'Automation') window.dispatchEvent(new Event('openlights-toggle-play'))
        else cueNext()
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'b') {
        event.preventDefault()
        toggleBlackout()
        return
      }
      if (key === 'n' || event.key === 'ArrowRight') {
        event.preventDefault()
        cueNext()
        return
      }
      if (key === 'p' || event.key === 'ArrowLeft') {
        event.preventDefault()
        cuePrev()
        return
      }
      if (/^[1-9]$/.test(event.key)) {
        const scene = scenes[Number(event.key) - 1]
        if (scene) {
          event.preventDefault()
          goToScene(scene.id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolPanel, settingsOpen, scenes, goToScene, cueNext, cuePrev, stopCue, toggleBlackout])

  const renderPanel = () => {
    switch (tab) {
      case 'Design':
        return (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="min-h-0 flex-1">
              <DesignTab />
            </div>
            <details className="shrink-0 rounded-lg border border-line bg-panel p-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-dim">
                Effects
              </summary>
              <div className="pt-3">
                <EffectsPanel />
              </div>
            </details>
          </div>
        )
      case 'Live':
        return <LiveTab />
      case 'Edit':
        return <EditTab />
      default:
        return null
    }
  }

  const shortcuts = [...(TAB_SHORTCUTS[tab] ?? []), ...BASE_SHORTCUTS].filter(
    (shortcut) => !shortcut.label.toLowerCase().includes('(stub)')
  )
  const closeToolPanel = () => setToolPanel(null)

  return (
    <div className="app">
      {/* Top bar */}
      <header className="top-bar">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-[10px] font-bold text-[#111]">
            OL
          </div>
          <ProjectBar />
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
                <div className="my-1 border-t border-line" />
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
          <DmxConnection />
          <button
            onClick={handleBlackout}
            className={`btn-panic rounded px-5 py-2 text-xs font-bold uppercase tracking-wider ${
              blackout ? 'bg-amber-500 border-amber-400 text-black' : ''
            }`}
          >
            {blackout ? 'RESTORE' : 'BLACKOUT'}
          </button>
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

      {/* Main row */}
      <div className="main-grid">
        <StagePreview />

        <div className="panel side-panel overflow-hidden p-2 min-h-0 flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-dim">
              Groups & Presets
            </div>
            <div className="text-[9px] uppercase tracking-wider text-dim">fixture tree</div>
          </div>
          <GroupsPresetsPanel />
        </div>
      </div>

      {/* Bottom row */}
      <div className="bottom-grid">
        <div className="panel overflow-hidden p-2 min-h-0 flex flex-col">
          <div className="relative flex h-7 shrink-0 items-center justify-center px-1" role="tablist" aria-label="Lighting workspace">
            <div className="flex items-center gap-1 rounded-full bg-bg/40 p-0.5">
              {bottomTabs.filter((item) => item.id !== 'Edit').map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`rounded-full px-3 py-0.5 text-[11px] font-semibold transition-colors ${tab === item.id ? 'bg-text text-bg shadow-sm' : 'text-dim hover:text-text'}`}>
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" role="tab" aria-selected={tab === 'Edit'} onClick={() => setTab('Edit')} className={`absolute right-1 rounded-full px-3 py-1 text-[10px] font-semibold transition-colors ${tab === 'Edit' ? 'bg-text text-bg' : 'bg-panel2 text-dim hover:text-text'}`}>
              Edit
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">{renderPanel()}</div>
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
