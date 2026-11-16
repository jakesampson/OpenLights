import { useEffect, useState } from 'react'
import { useShowStore } from './stores/showStore'
import { AutomationPanel } from './components/AutomationPanel'
import { CueListPanel } from './components/CueListPanel'
import { EffectsPanel } from './components/EffectsPanel'
import { MidiPanel } from './components/MidiPanel'
import { PatchPanel } from './components/PatchPanel'
import { ProjectBar } from './components/ProjectBar'
import { SceneGrid } from './components/SceneGrid'
import { configureEffects } from './lib/output'
import type { DmxStatus } from '@shared/types'

type Mode = 'scenes' | 'cues' | 'effects' | 'automation' | 'patch' | 'midi'

const TABS: Array<{ id: Mode; label: string }> = [
  { id: 'scenes', label: 'Scenes' },
  { id: 'cues', label: 'Cue Lists' },
  { id: 'effects', label: 'Effects' },
  { id: 'automation', label: 'Automation' },
  { id: 'patch', label: 'Patch' },
  { id: 'midi', label: 'MIDI' }
]

export default function App() {
  const {
    show,
    scenes,
    effects,
    bpm,
    activeSceneId,
    master,
    setMaster,
    blackout,
    toggleBlackout,
    goToScene,
    cueNext,
    cuePrev,
    stopCue
  } = useShowStore()
  const [mode, setMode] = useState<Mode>('scenes')
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

  // Feed the output engine the current effect context. It keeps running its
  // own animation loop only while at least one effect is enabled.
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

  const disconnectDMX = async () => {    if (!window.electronAPI?.disconnectDmx) return
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

  // Show-control keyboard shortcuts. Ignored while typing in a field.
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
        if (mode === 'automation') window.dispatchEvent(new Event('openlights-toggle-play'))
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
  }, [mode, scenes, goToScene, cueNext, cuePrev, stopCue, toggleBlackout])

  const connected = status?.connected ?? false
  const activeScene = scenes.find((scene) => scene.id === activeSceneId)

  return (
    <div className="min-h-screen p-8 text-zinc-100 selection:bg-indigo-500/30">
      <header className="mb-6 flex items-center gap-4 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 text-xs font-bold text-white">
            OL
          </div>
          <h1 className="text-2xl font-bold tracking-tighter">OpenLights</h1>
        </div>
        <nav className="ml-auto flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                mode === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded bg-zinc-900 p-1">
          <button
            onClick={() => setOutputMode('usb')}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              outputMode === 'usb' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            USB · ENTTEC
          </button>
          <button
            onClick={() => setOutputMode('artnet')}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              outputMode === 'artnet' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Art-Net
          </button>
        </div>

        {outputMode === 'usb' ? (
          <div className="flex items-center gap-2">
            <div className="text-sm text-zinc-400">Port:</div>
            <select
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="rounded bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              <option value="">Select port</option>
              {ports.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              onClick={scanPorts}
              className="rounded bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
            >
              Scan
            </button>
            <button
              onClick={connectDMX}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-40"
              disabled={!port}
            >
              Connect
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Node IP</label>
            <input
              value={artnetHost}
              onChange={(e) => setArtnetHost(e.target.value)}
              placeholder="192.168.1.50 or 255.255.255.255"
              className="w-56 rounded bg-zinc-800 px-3 py-2 font-mono text-xs text-white placeholder-zinc-600"
            />
            <label className="text-xs text-zinc-500">Universe</label>
            <input
              type="number"
              min={0}
              max={32767}
              value={artnetUniverse}
              onChange={(e) => setArtnetUniverse(Number(e.target.value))}
              className="w-20 rounded bg-zinc-800 px-2 py-2 text-center font-mono text-xs text-white"
            />
            <button
              onClick={connectArtNet}
              className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
            >
              Connect
            </button>
            <span className="text-[10px] text-zinc-600">
              Art-Net 4 · UDP 6454 · continuous 40 Hz
            </span>
          </div>
        )}

        {connected && (
          <button
            onClick={disconnectDMX}
            className="rounded bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            Disconnect
          </button>
        )}

        <div className="flex items-center gap-1 text-xs text-zinc-500">
          {connected ? '●' : '○'}{' '}
          {connected
            ? status?.mode === 'artnet'
              ? `Art-Net · ${status.artnet?.host ?? ''} · universe ${status.artnet?.universe ?? 0}`
              : `Connected · ${status?.port ?? ''}`
            : 'Virtual mode'}
          {status?.error && <span className="text-red-400">· {status.error}</span>}
        </div>
      </div>

      {dmxError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {dmxError}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Master
          </span>
          <input
            type="range"
            min={0}
            max={255}
            value={master}
            onChange={(e) => setMaster(Number(e.target.value))}
            className="w-56 accent-indigo-500"
          />
          <span className="w-10 font-mono text-xs text-zinc-400">
            {Math.round((master / 255) * 100)}%
          </span>
        </div>
        <div className="text-xs text-zinc-500">
          Active:{' '}
          <span className="text-zinc-300">
            {blackout ? 'Blackout' : (activeScene?.name ?? 'None')}
          </span>
        </div>
        <button
          onClick={handleBlackout}
          className={`ml-auto rounded-lg px-6 py-3 font-bold text-white transition-colors ${
            blackout ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-red-600 hover:bg-red-500'
          }`}
        >
          {blackout ? 'RESTORE' : 'PANIC / BLACKOUT'}
        </button>
      </div>

      {mode === 'scenes' && <SceneGrid />}
      {mode === 'cues' && <CueListPanel />}
      {mode === 'effects' && <EffectsPanel />}
      {mode === 'automation' && <AutomationPanel />}
      {mode === 'patch' && <PatchPanel />}
      {mode === 'midi' && <MidiPanel />}

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-zinc-600">
        <span className="uppercase tracking-wider text-zinc-500">Shortcuts</span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">1–9</kbd> scenes
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">B</kbd> blackout
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">N</kbd> /{' '}
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">P</kbd> next / prev cue
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">Space</kbd>{' '}
          {mode === 'automation' ? 'play / pause' : 'next cue'}
        </span>
        <span>
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">Esc</kbd> stop
        </span>
      </div>

      <div className="mt-4">
        <ProjectBar />
      </div>
    </div>
  )
}
