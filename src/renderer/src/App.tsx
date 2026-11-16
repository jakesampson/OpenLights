import { useEffect, useState } from 'react'
import { useShowStore } from './stores/showStore'
import { AutomationPanel } from './components/AutomationPanel'
import { CueListPanel } from './components/CueListPanel'
import { EffectsPanel } from './components/EffectsPanel'
import { MidiPanel } from './components/MidiPanel'
import { PatchPanel } from './components/PatchPanel'
import { ProjectBar } from './components/ProjectBar'
import { SceneGrid } from './components/SceneGrid'
import { DesignTab } from './components/DesignTab'
import { LiveTab } from './components/LiveTab'
import { EditTab } from './components/EditTab'
import { StagePreview } from './components/StagePreview'
import { GroupsPresetsPanel } from './components/GroupsPresetsPanel'
import { DmxConnection } from './components/DmxConnection'
import { configureEffects } from './lib/output'

type Tab =
  | 'Design'
  | 'Live'
  | 'Edit'
  | 'Scenes'
  | 'Cues'
  | 'Effects'
  | 'Automation'
  | 'Patch'
  | 'MIDI'

const bottomTabs: Array<{ id: Tab; label: string; stub?: boolean }> = [
  { id: 'Design', label: 'Design', stub: true },
  { id: 'Live', label: 'Live', stub: true },
  { id: 'Edit', label: 'Edit', stub: true },
  { id: 'Scenes', label: 'Scenes' },
  { id: 'Cues', label: 'Cues' },
  { id: 'Effects', label: 'Effects' },
  { id: 'Automation', label: 'Automation' },
  { id: 'Patch', label: 'Patch' },
  { id: 'MIDI', label: 'MIDI' }
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

  useEffect(() => {
    configureEffects({
      effects,
      fixtures: show?.fixtures ?? [],
      bpm,
      master,
      blackout
    })
  }, [effects, show?.fixtures, bpm, master, blackout])

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
        stopCue()
        return
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        if (tab === 'Automation') window.dispatchEvent(new Event('openlights-toggle-play'))
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
  }, [tab, scenes, goToScene, cueNext, cuePrev, stopCue, toggleBlackout])

  const activeScene = scenes.find((scene) => scene.id === activeSceneId)

  const renderPanel = () => {
    switch (tab) {
      case 'Design':
        return <DesignTab />
      case 'Live':
        return <LiveTab />
      case 'Edit':
        return <EditTab />
      case 'Scenes':
        return <SceneGrid />
      case 'Cues':
        return <CueListPanel />
      case 'Effects':
        return <EffectsPanel />
      case 'Automation':
        return <AutomationPanel />
      case 'Patch':
        return <PatchPanel />
      case 'MIDI':
        return <MidiPanel />
      default:
        return null
    }
  }

  const shortcuts = [...(TAB_SHORTCUTS[tab] ?? []), ...BASE_SHORTCUTS]

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
            className="btn-theme text-xs opacity-50 cursor-not-allowed"
            disabled
            title="Search is not implemented yet"
          >
            Search…
          </button>
        </div>

        <div className="flex-1 text-center font-semibold tracking-tight text-base truncate">
          {show?.name ?? 'OpenLights'}
          <span className="ml-2 text-[10px] font-normal text-dim">
            {blackout ? '· Blackout' : activeScene ? `· ${activeScene.name}` : '· No scene'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <DmxConnection />
          <button
            type="button"
            className="btn-theme text-xs opacity-50 cursor-not-allowed"
            disabled
            title="Overrides are not implemented yet"
          >
            Overrides
          </button>
          <button
            onClick={handleBlackout}
            className={`btn-panic rounded px-5 py-2 text-xs font-bold uppercase tracking-wider ${
              blackout ? 'bg-amber-500 border-amber-400 text-black' : ''
            }`}
          >
            {blackout ? 'RESTORE' : 'BLACKOUT'}
          </button>
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
          <div className="flex flex-wrap gap-1 min-w-0 overflow-x-auto">
            {bottomTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`btn-theme text-xs font-medium flex-shrink-0 ${tab === t.id ? 'on' : ''}`}
                title={t.stub ? 'Mockup view' : undefined}
              >
                {t.label}
              </button>
            ))}
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
    </div>
  )
}