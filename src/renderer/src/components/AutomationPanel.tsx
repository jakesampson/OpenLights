import { useCallback, useEffect, useRef, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { computeAutomationChannels, fixtureAttributes } from '../lib/automationRuntime'
import { sendImmediate } from '../lib/output'
import { detectBpm } from '../lib/bpm'
import type { AutomationDef } from '@shared/types'

const LANE_HEIGHT = 56
const LANE_COLORS = ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#60a5fa', '#fb7185']

interface DragState {
  autoId: string
  index: number
}

export function AutomationPanel() {
  const {
    show,
    master,
    bpm,
    setBpm,
    setAudioPath,
    isPlaying,
    setIsPlaying,
    automations,
    addAutomation,
    updateAutomation,
    removeAutomation
  } = useShowStore()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const laneCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const loadedPathRef = useRef<string>('')
  const playPauseRef = useRef<() => void>(() => undefined)
  const [audioName, setAudioName] = useState<string>('')
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [peaks, setPeaks] = useState<number[]>([])
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [newAutomationFixture, setNewAutomationFixture] = useState('f1')
  const [newAutomationAttr, setNewAutomationAttr] = useState('intensity')

  // Keep the fixture selector valid when a different show is loaded
  useEffect(() => {
    const fixtures = show?.fixtures ?? []
    if (fixtures.length > 0 && !fixtures.some((f) => f.id === newAutomationFixture)) {
      setNewAutomationFixture(fixtures[0].id)
    }
  }, [show, newAutomationFixture])

  // Drive DMX from automations during playback
  const driveDmx = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !show) return
    if (automations.length > 0) {
      sendImmediate(computeAutomationChannels(show, automations, audio.currentTime, master))
    }
    setCurrentTime(audio.currentTime)
    rafRef.current = requestAnimationFrame(driveDmx)
  }, [automations, show, master])

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(driveDmx)
    } else if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [isPlaying, driveDmx])

  // Leaving the tab unmounts the <audio> element; don't leave the transport
  // stuck in a "playing" state when it does.
  useEffect(() => {
    return () => setIsPlaying(false)
  }, [setIsPlaying])

  const loadAudioFile = useCallback(
    async (path?: string, persist = true) => {
      if (!window.electronAPI) return
      const result = await window.electronAPI.loadAudio(path)
      if (!result.success || !result.dataUrl) {
        if (path && !result.canceled) {
          console.error('Failed to load audio', result.error)
        }
        return
      }
      setAudioName(result.name ?? 'Audio')
      setAudioUrl(result.dataUrl)
      setIsPlaying(false)
      setCurrentTime(0)
      if (result.path) {
        loadedPathRef.current = result.path
        if (persist) setAudioPath(result.path)
      }
      try {
        const ctx = new AudioContext()
        const binary = atob(result.dataUrl.split(',')[1])
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0))
        const data = buffer.getChannelData(0)
        const bucketCount = 1200
        const bucketSize = Math.floor(data.length / bucketCount)
        const computed: number[] = []
        for (let b = 0; b < bucketCount; b++) {
          let max = 0
          const start = b * bucketSize
          for (let i = 0; i < bucketSize; i++) {
            const v = Math.abs(data[start + i])
            if (v > max) max = v
          }
          computed.push(max)
        }
        setPeaks(computed)
        setDuration(buffer.duration)

        // Real BPM detection via autocorrelation
        const detected = detectBpm(buffer)
        if (detected) {
          setBpm(Math.round(detected))
        }

        await ctx.close()
      } catch (e) {
        console.error('Failed to decode audio', e)
      }
    },
    [setAudioPath, setBpm, setIsPlaying]
  )

  // Restore the show's saved track when the panel opens or a show is loaded.
  useEffect(() => {
    const path = show?.audioPath
    if (!path) {
      loadedPathRef.current = ''
      return
    }
    if (loadedPathRef.current === path) return
    loadedPathRef.current = path
    void loadAudioFile(path, false)
  }, [show?.audioPath, loadAudioFile])

  const handleLoadAudio = () => void loadAudioFile()

  // Draw waveform + beat grid + playhead
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const trackLength = duration || 1
    const xFor = (t: number) => (t / trackLength) * rect.width

    // Beat grid
    if (bpm > 0) {
      const beat = 60 / bpm
      ctx.lineWidth = 1
      for (let t = 0, i = 0; t <= trackLength; t += beat, i++) {
        const x = xFor(t)
        ctx.strokeStyle = i % 4 === 0 ? 'rgba(129,140,248,0.22)' : 'rgba(255,255,255,0.06)'
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, rect.height)
        ctx.stroke()
      }
    }

    if (peaks.length === 0) return

    const mid = rect.height / 2
    const barWidth = rect.width / peaks.length
    ctx.fillStyle = 'rgb(99, 102, 241)'
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1, peaks[i] * rect.height * 0.9)
      ctx.fillRect(i * barWidth, mid - h / 2, Math.max(barWidth * 0.7, 1), h)
    }

    ctx.strokeStyle = '#f87171'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xFor(currentTime), 0)
    ctx.lineTo(xFor(currentTime), rect.height)
    ctx.stroke()
  }, [peaks, currentTime, duration, bpm])

  // Draw automation lanes + points + playhead
  useEffect(() => {
    const canvas = laneCanvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const height = Math.max(1, automations.length) * LANE_HEIGHT
    canvas.width = rect.width * dpr
    canvas.height = height * dpr
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, height)

    const trackLength = duration || 300
    const xFor = (t: number) => (t / trackLength) * rect.width

    automations.forEach((auto, laneIndex) => {
      const top = laneIndex * LANE_HEIGHT
      ctx.fillStyle = laneIndex % 2 === 0 ? 'rgba(24,24,27,0.7)' : 'rgba(39,39,42,0.55)'
      ctx.fillRect(0, top, rect.width, LANE_HEIGHT)

      const color = LANE_COLORS[laneIndex % LANE_COLORS.length]
      const fixtureName =
        show?.fixtures.find((f) => f.id === auto.fixtureId)?.name ?? auto.fixtureId
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(`${fixtureName} · ${auto.attribute}`, 8, top + 13)

      // Midline
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, top + LANE_HEIGHT / 2)
      ctx.lineTo(rect.width, top + LANE_HEIGHT / 2)
      ctx.stroke()

      const yFor = (v: number) =>
        top + LANE_HEIGHT - (Math.max(0, Math.min(255, v)) / 255) * (LANE_HEIGHT - 14) - 4

      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      auto.points.forEach((point, i) => {
        const x = xFor(point.t)
        const y = yFor(point.v)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      auto.points.forEach((point) => {
        ctx.beginPath()
        ctx.arc(xFor(point.t), yFor(point.v), 4, 0, Math.PI * 2)
        ctx.fill()
      })
    })

    if (automations.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText('Add an automation lane to draw points here.', 10, 30)
    }

    ctx.strokeStyle = '#f87171'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xFor(currentTime), 0)
    ctx.lineTo(xFor(currentTime), height)
    ctx.stroke()
  }, [automations, currentTime, duration, show])

  const lanePointFromEvent = (
    event: React.PointerEvent<HTMLCanvasElement>
  ): { laneIndex: number; t: number; v: number; x: number; y: number } | null => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (automations.length === 0) return null
    const laneIndex = Math.min(automations.length - 1, Math.max(0, Math.floor(y / LANE_HEIGHT)))
    const laneTop = laneIndex * LANE_HEIGHT
    const trackLength = duration || 300
    const t = Math.max(0, Math.min(trackLength, (x / rect.width) * trackLength))
    const v = Math.max(
      0,
      Math.min(255, Math.round(255 * (1 - (y - laneTop - 4) / (LANE_HEIGHT - 14))))
    )
    return { laneIndex, t, v, x, y }
  }

  const handleLanePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const hit = lanePointFromEvent(event)
    if (!hit) return
    const auto = automations[hit.laneIndex]
    const rect = event.currentTarget.getBoundingClientRect()
    const trackLength = duration || 300
    const pxPerSecond = rect.width / trackLength
    const laneTop = hit.laneIndex * LANE_HEIGHT
    const yFor = (v: number) =>
      laneTop + LANE_HEIGHT - (Math.max(0, Math.min(255, v)) / 255) * (LANE_HEIGHT - 14) - 4

    const nearIndex = auto.points.findIndex(
      (point) =>
        Math.abs(point.t - hit.t) * pxPerSecond < 10 &&
        Math.abs(yFor(point.v) - hit.y) < 12
    )

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* synthetic events may not own the pointer */
    }

    if (nearIndex >= 0) {
      dragRef.current = { autoId: auto.id, index: nearIndex }
      return
    }

    const point = { t: Number(hit.t.toFixed(3)), v: hit.v }
    const points = [...auto.points, point].sort((a, b) => a.t - b.t)
    updateAutomation(auto.id, { points })
    dragRef.current = { autoId: auto.id, index: points.indexOf(point) }
  }

  const handleLanePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const hit = lanePointFromEvent(event)
    if (!hit) return
    const auto = automations.find((a) => a.id === drag.autoId)
    if (!auto) return
    const points = [...auto.points]
    if (drag.index < 0 || drag.index >= points.length) return
    const updated = { t: Number(hit.t.toFixed(3)), v: hit.v }
    points[drag.index] = updated
    points.sort((a, b) => a.t - b.t)
    updateAutomation(auto.id, { points })
    dragRef.current = { autoId: auto.id, index: points.indexOf(updated) }
  }

  const handleLanePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handleLaneContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (automations.length === 0) return
    const laneIndex = Math.min(automations.length - 1, Math.max(0, Math.floor(y / LANE_HEIGHT)))
    const auto = automations[laneIndex]
    const trackLength = duration || 300
    const t = (x / rect.width) * trackLength
    const laneTop = laneIndex * LANE_HEIGHT
    const pxPerSecond = rect.width / trackLength
    const yFor = (v: number) =>
      laneTop + LANE_HEIGHT - (Math.max(0, Math.min(255, v)) / 255) * (LANE_HEIGHT - 14) - 4
    const index = auto.points.findIndex(
      (point) => Math.abs(point.t - t) * pxPerSecond < 10 && Math.abs(yFor(point.v) - y) < 12
    )
    if (index >= 0) {
      updateAutomation(auto.id, { points: auto.points.filter((_, i) => i !== index) })
    }
  }

  const handlePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.error('Playback failed', e))
    }
  }

  // Space toggles the transport while this tab is open.
  playPauseRef.current = handlePlayPause
  useEffect(() => {
    const toggle = () => playPauseRef.current()
    window.addEventListener('openlights-toggle-play', toggle)
    return () => window.removeEventListener('openlights-toggle-play', toggle)
  }, [])

  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioRef.current || duration === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = ratio * duration
    setCurrentTime(ratio * duration)
  }

  const handleAddAutomation = () => {
    const auto: AutomationDef = {
      id: crypto.randomUUID(),
      name: `Automation ${automations.length + 1}`,
      fixtureId: newAutomationFixture,
      attribute: newAutomationAttr,
      points: [
        { t: 0, v: 0 },
        { t: Math.max(duration, 4), v: 255 }
      ]
    }
    addAutomation(auto)
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
          Audio Automation
        </h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">BPM</label>
          <input
            type="number"
            min={30}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-16 rounded bg-zinc-800 px-2 py-1 text-center text-sm text-white"
          />
          <button
            onClick={handleLoadAudio}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            Load Audio
          </button>
        </div>
      </div>

      <div className="relative h-40 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <canvas ref={canvasRef} onClick={handleSeek} className="w-full h-full cursor-crosshair" />
        {!audioUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm pointer-events-none">
            Load a track to see its waveform
          </div>
        )}
        {audioName && (
          <div className="absolute top-2 left-3 text-xs text-zinc-400 pointer-events-none">
            {audioName}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          className="rounded-full bg-indigo-600 h-12 w-12 flex items-center justify-center text-white font-bold hover:bg-indigo-500 disabled:opacity-40"
          disabled={!audioUrl}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
        <div className="text-xs text-zinc-500 font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
          {isPlaying ? ' — running' : ''}
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Automation Lanes
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={newAutomationFixture}
              onChange={(e) => {
                setNewAutomationFixture(e.target.value)
                const fixture = show?.fixtures.find((f) => f.id === e.target.value)
                if (fixture) {
                  const attrs = fixtureAttributes(fixture)
                  if (!attrs.includes(newAutomationAttr)) setNewAutomationAttr(attrs[0] ?? 'intensity')
                }
              }}
              className="rounded bg-zinc-800 px-2 py-1 text-xs text-white"
            >
              {show?.fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              value={newAutomationAttr}
              onChange={(e) => setNewAutomationAttr(e.target.value)}
              className="rounded bg-zinc-800 px-2 py-1 text-xs text-white"
            >
              {fixtureAttributes(
                show?.fixtures.find((f) => f.id === newAutomationFixture)?.type ?? 'par'
              ).map((attr) => (
                <option key={attr} value={attr}>
                  {attr}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddAutomation}
              disabled={!show?.fixtures.length}
              className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
            >
              + Lane
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <canvas
            ref={laneCanvasRef}
            className="w-full cursor-crosshair touch-none"
            onPointerDown={handleLanePointerDown}
            onPointerMove={handleLanePointerMove}
            onPointerUp={handleLanePointerUp}
            onPointerCancel={handleLanePointerUp}
            onContextMenu={handleLaneContextMenu}
          />
        </div>
        <div className="mt-1 text-[10px] text-zinc-500">
          Click a lane to add a point · drag points to move · right-click a point to delete
        </div>

        <div className="mt-2 flex flex-col gap-2 max-h-48 overflow-y-auto">
          {automations.map((auto) => (
            <div
              key={auto.id}
              className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 p-2"
            >
              <div className="flex-1">
                <div className="text-xs font-medium text-zinc-300">{auto.name}</div>
                <div className="text-[10px] text-zinc-500">
                  {show?.fixtures.find((f) => f.id === auto.fixtureId)?.name} — {auto.attribute} ·{' '}
                  {auto.points.length} points
                </div>
              </div>
              <button
                onClick={() => removeAutomation(auto.id)}
                className="text-[10px] text-zinc-500 hover:text-red-400"
              >
                Remove
              </button>
            </div>
          ))}
          {automations.length === 0 && (
            <div className="text-[11px] text-zinc-600 py-2 text-center">
              No automation lanes yet — add one above
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
