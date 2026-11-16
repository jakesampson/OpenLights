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
import { configureEffects } from './lib/output'
import type { DmxStatus } from '@shared/types'

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

const sideItems = [
  { id: 'groups', label: 'Groups', active: true, color: '#c24bd6' },
  { id: 'presets', label: 'Presets', active: false, color: '#8ad3e8' },
  { id: 'colors', label: 'Colors', active: false, color: '#d393ee' },
  { id: 'effects', label: 'Effects', active: false, color: '#a4f4a6' },
  { id: 'shutter', label: 'Shutter/Strobe', active: false, color: '#ffa07a' },
  { id: 'movement', label: 'Movement Speed', active: false, color: '#b19cd9' },
  { id: 'devices', label: 'Devices', active: false, color: '#ffd700' },
  { id: 'mapping', label: 'MIDI Mapping', active: false, color: '#c24bd6' }
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
  const [port, setPort] = useState<string>('')
  const [ports, setPorts] = useState<string[]>([])
  const [status, setStatus] = useState<DmxStatus | null>(null)
  const [dmxError, setDmxError] = useState<string | null>(null)
  const [outputMode, setOutputMode] = useState<'usb' | 'artnet'>('usb')
  const [artnetHost, setArtnetHost] = useState('255.255.255.255')
  const [artnetUniverse, setArtnetUniverse] = useState(0)

  useEffect(() => {
    const host = window.localStorage.getItem('openlights.artnetHost')
    const universe = Number(window.localStorage.getItem('openlights.artnetUniverse'))
    if (host) setArtnetHost(host)
    if (Number.isFinite(universe) && universe >= 0) setArtnetUniverse(universe)
  }, [])

  const refreshStatus = async () => {
    if (!window.electronAPI?.getDmxStatus) return
    try {
      setStatus(await window.electronAPI.getDmxStatus())
    } catch {
      /* main process not ready */
    }
  }

  useEffect(() => {
    refreshStatus()
    const timer = window.setInterval(refreshStatus, 1000)
    return () => window.clearInterval(timer)
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

  const scanPorts = async () => {
    if (!window.electronAPI) return
    try {
      const result = (await window.electronAPI.getDmxPorts()) || []
      setPorts(result)
      setDmxError(null)
      if (result.length > 0 && !result.includes(port)) setPort(result[0])
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }

  const connectDMX = async () => {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.setDmxPort(port, 57600)
      if (result.status) setStatus(result.status)
      if (result.success) setDmxError(null)
      else setDmxError(result.error ?? 'Could not open DMX port')
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }

  const connectArtNet = async () => {
    if (!window.electronAPI) return
    try {
      window.localStorage.setItem('openlights.artnetHost', artnetHost)
      window.localStorage.setItem('openlights.artnetUniverse', String(artnetUniverse))
      const result = await window.electronAPI.connectArtNet(artnetHost, artnetUniverse)
      if (result.status) setStatus(result.status)
      if (result.success) setDmxError(null)
      else setDmxError(result.error ?? 'Could not start Art-Net output')
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }

  const disconnectDMX = async () => {
    if (!window.electronAPI?.disconnectDmx) return
    try {
      const result = await window.electronAPI.disconnectDmx()
      if (result.status) setStatus(result.status)
      setDmxError(null)
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }

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

  const connected = status?.connected ?? false
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
        <div className="panel stage">
          <div className="stage-frame">
            <span>Stage preview</span>
          </div>
        </div>

        <div className="panel side-panel overflow-auto p-2 min-h-0 flex flex-col gap-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
            Groups & Presets
          </div>
          <div className="flex flex-col gap-1 py-1 overflow-y-auto min-h-0 flex-1">
            {sideItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer ${
                  item.active ? 'selected' : 'hover:bg-panel2'
                }`}
              >
                <span className="dot" style={{ backgroundColor: item.color }} />
                {item.label}
              </div>
            ))}
          </div>

          <div className="mt-1 pt-2 border-t border-line">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
              DMX Connection
            </div>
            <div className="flex gap-1 px-2 pb-2">
              <button
                onClick={() => setOutputMode('usb')}
                className={`btn-theme flex-1 text-[10px] ${outputMode === 'usb' ? 'on' : ''}`}
              >
                USB
              </button>
              <button
                onClick={() => setOutputMode('artnet')}
                className={`btn-theme flex-1 text-[10px] ${outputMode === 'artnet' ? 'on' : ''}`}
              >
                Art-Net
              </button>
            </div>

            {outputMode === 'usb' ? (
              <div className="flex flex-col gap-1 px-2">
                <select
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="rounded bg-panel2 px-2 py-1 text-xs text-white border border-line"
                >
                  <option value="">Select port</option>
                  {ports.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <button onClick={scanPorts} className="btn-theme flex-1 text-xs">
                    Scan
                  </button>
                  <button
                    onClick={connectDMX}
                    className="btn-theme flex-1 text-xs disabled:opacity-40"
                    disabled={!port}
                  >
                    Connect
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 px-2">
                <label className="text-[9px] text-dim uppercase">Node IP</label>
                <input
                  value={artnetHost}
                  onChange={(e) => setArtnetHost(e.target.value)}
                  placeholder="192.168.1.50"
                  className="rounded bg-panel2 px-2 py-1 text-xs text-white border border-line"
                />
                <label className="text-[9px] text-dim uppercase">Universe</label>
                <input
                  type="number"
                  min={0}
                  max={32767}
                  value={artnetUniverse}
                  onChange={(e) => setArtnetUniverse(Number(e.target.value))}
                  className="rounded bg-panel2 px-2 py-1 text-center font-mono text-xs text-white border border-line"
                />
                <button onClick={connectArtNet} className="btn-theme text-xs">
                  Connect
                </button>
              </div>
            )}

            {connected && (
              <button onClick={disconnectDMX} className="btn-theme text-xs mt-1 mx-2 mb-2">
                Disconnect
              </button>
            )}

            <div className="flex items-center gap-1 px-2 pb-1 text-[9px] text-dim">
              <span>{connected ? '●' : '○'}</span>
              <span className="truncate">
                {connected
                  ? status?.mode === 'artnet'
                    ? `Art-Net · u${status.artnet?.universe ?? 0}`
                    : 'Connected'
                  : 'Virtual mode'}
              </span>
            </div>
            {status?.error && (
              <div className="px-2 pb-1 text-[9px] text-red-400">{status.error}</div>
            )}
          </div>
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

      {dmxError && (
        <div className="mx-3 mb-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">
          {dmxError}
        </div>
      )}

      <div className="px-3 pb-2">
        <ProjectBar />
      </div>
    </div>
  )
}