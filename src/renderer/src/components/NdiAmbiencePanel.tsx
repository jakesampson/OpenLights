/**
 * NDI Ambience panel — HyperHDR-style ambient lighting from an NDI video
 * feed (Jake, 23 Nov 2026). The feed's screen sits on the Preview as a
 * draggable object; each edge region feeds the fixtures nearest to it.
 *
 * Ambience is an explicit live mode owned by this panel: Start takes
 * over the mapped fixtures, Stop hands the rig back to cues, presets
 * and Live. Closing the panel stops Ambience — like the DMX test panel,
 * it never leaves output running behind your back.
 */
import { useEffect, useRef, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import {
  DEFAULT_SCREEN_HEIGHT,
  DEFAULT_SCREEN_WIDTH,
  edgeRegionAnchors,
  findNdiScreen,
  rgbHex,
  type NdiRegionColour,
  type NdiSourceInfo
} from '@shared/ndiAmbience'
import {
  configureAmbienceFixtures,
  getAmbienceStats,
  setAmbienceActive,
  setAmbienceRegions,
  type NdiAmbienceStats
} from '../lib/ndiAmbience'

function regionLabel(index: number): string {
  const anchor = edgeRegionAnchors()[index]
  if (!anchor) return `Region ${index + 1}`
  if (anchor.y === 0) return anchor.x < 0.5 ? 'Top left' : 'Top right'
  if (anchor.x === 1) return anchor.y < 0.5 ? 'Right top' : 'Right bottom'
  if (anchor.y === 1) return anchor.x > 0.5 ? 'Bottom right' : 'Bottom left'
  return anchor.y < 0.5 ? 'Left top' : 'Left bottom'
}

export function NdiAmbiencePanel() {
  const { show, master, addStageObject, removeStageObjects } = useShowStore()
  const [sources, setSources] = useState<NdiSourceInfo[]>([])
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [directAddress, setDirectAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [regions, setRegions] = useState<NdiRegionColour[] | null>(null)
  const [running, setRunning] = useState(false)
  const [stats, setStats] = useState<NdiAmbienceStats>(getAmbienceStats())
  const runningRef = useRef(false)

  const screen = findNdiScreen(show?.stageObjects)
  const fixtures = show?.fixtures ?? []

  const stop = async () => {
    runningRef.current = false
    setRunning(false)
    setAmbienceActive(false)
    try {
      await window.electronAPI?.ndiStop()
    } catch { /* Worker already gone — output is already cleared. */ }
  }

  // Own the ambience session: subscribe to the worker, feed the mapper,
  // and stop everything when the panel closes.
  useEffect(() => {
    let alive = true
    const offRegions = window.electronAPI?.onNdiRegions?.((next) => {
      if (!alive) return
      setAmbienceRegions(next)
      setRegions(next)
      setStats(getAmbienceStats())
    })
    const offStatus = window.electronAPI?.onNdiStatus?.((status) => {
      if (!alive) return
      if (status.state === 'error') {
        setError(status.message ?? 'NDI error')
        runningRef.current = false
        setRunning(false)
        setAmbienceActive(false)
      }
    })
    void window.electronAPI
      ?.ndiVersion()
      .then((result) => {
        if (!alive) return
        setAvailable(result.available)
        setVersion(result.version ?? null)
        if (!result.available) setError(result.error ?? 'NDI is unavailable.')
      })
      .catch((e: unknown) => {
        if (alive) {
          setAvailable(false)
          setError(e instanceof Error ? e.message : String(e))
        }
      })
    void window.electronAPI
      ?.ndiListSources()
      .then((result) => {
        if (!alive) return
        setSources(result.sources)
        if (result.error) setError(result.error)
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
      offRegions?.()
      offStatus?.()
      if (runningRef.current) {
        runningRef.current = false
        setAmbienceActive(false)
        void window.electronAPI?.ndiStop().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the mapper in step with the show while the panel is open.
  useEffect(() => {
    configureAmbienceFixtures(fixtures, show?.stageObjects, master)
    setStats(getAmbienceStats())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.fixtures, show?.stageObjects, master])

  const refreshSources = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.electronAPI.ndiListSources()
      setSources(result.sources)
      if (result.error) setError(result.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const placeScreen = () => {
    addStageObject({
      id: crypto.randomUUID(),
      kind: 'screen',
      name: 'Screen',
      x: 400,
      y: 170,
      width: DEFAULT_SCREEN_WIDTH,
      height: DEFAULT_SCREEN_HEIGHT,
      rotation: 0,
      fill: 'rgba(10,132,255,0.10)',
      stroke: '#0A84FF',
      opacity: 1
    })
  }

  const removeScreen = async () => {
    if (!screen) return
    if (runningRef.current) await stop()
    removeStageObjects([screen.id])
  }

  const start = async () => {
    const address = directAddress.trim()
    const source: NdiSourceInfo | undefined = address
      ? { name: `direct ${address}`, urlAddress: address }
      : sources.find((s) => s.name === selectedName) ?? sources[0]
    if (!source) {
      setError('Choose a source, or enter an address to connect directly.')
      return
    }
    if (!screen) {
      setError('Place the screen on the Preview first — ambience has nothing to map to without it.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await window.electronAPI.ndiStart(source)
      if (!result.success) {
        setError(result.error ?? 'Could not connect to the NDI source.')
        return
      }
      runningRef.current = true
      setRunning(true)
      setAmbienceActive(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-dim">
        Ambient lighting from an NDI video feed, like HyperHDR for a TV: the colours around the edge of the
        screen drive the lights nearest to each edge. Slow is fine — regions update about once a second.
      </p>

      {available === false && (
        <p className="rounded border border-red-400/40 bg-red-500/10 p-2 text-red-200">
          NDI is unavailable in this app: {error ?? 'the NDI worker could not start.'}
        </p>
      )}
      {version && <p className="text-dim">NDI runtime: {version}</p>}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-dim">Screen on the Preview</h3>
        {!screen && (
          <>
            <p>
              No screen placed yet — ambience has nothing to map the edges to. Place one, then drag it into
              position in Preview edit mode (header Edit button).
            </p>
            <div>
              <button type="button" className="btn-theme" onClick={placeScreen}>
                Place screen on Preview
              </button>
            </div>
          </>
        )}
        {screen && (
          <>
            <p>
              Screen at ({Math.round(screen.x)}, {Math.round(screen.y)}), {Math.round(screen.width)} ×{' '}
              {Math.round(screen.height)} — drag it in Preview edit mode to move it, resize it from the
              Preview edit panel. Each edge feeds the fixtures nearest to it.
            </p>
            <div>
              <button type="button" className="btn-theme" onClick={() => void removeScreen()}>
                Remove screen
              </button>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-dim">NDI source</h3>
        {sources.length === 0 && <p className="text-dim">No sources found on this network yet.</p>}
        {sources.map((source) => (
          <label key={source.name} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="ndi-source"
              checked={(selectedName ?? sources[0]?.name) === source.name}
              onChange={() => {
                setSelectedName(source.name)
                setDirectAddress('')
              }}
            />
            <span>
              {source.name}
              {source.urlAddress ? <span className="text-dim"> ({source.urlAddress})</span> : null}
            </span>
          </label>
        ))}
        <div className="flex items-center gap-2">
          <button type="button" className="btn-theme" onClick={() => void refreshSources()} disabled={busy}>
            {busy ? 'Searching…' : 'Refresh sources'}
          </button>
          <span className="text-dim">Discovery needs the feed on the same network.</span>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-dim">Or connect directly by address (when discovery cannot see a source):</span>
          <input
            type="text"
            value={directAddress}
            placeholder="127.0.0.1:5961"
            onChange={(e) => setDirectAddress(e.target.value)}
            className="w-64 rounded bg-panel2 p-1.5"
          />
        </label>
      </section>

      <section className="flex items-center gap-2">
        {running ? (
          <button type="button" className="btn-theme" onClick={() => void stop()} disabled={busy}>
            Stop Ambience
          </button>
        ) : (
          <button type="button" className="btn-theme" onClick={() => void start()} disabled={busy || !screen || available === false}>
            Start Ambience
          </button>
        )}
        <span className="text-dim">
          {running ? 'Ambience is driving the mapped fixtures.' : 'Stopped — cues, presets and Live are in charge.'}
        </span>
      </section>

      {error && (
        <p className="rounded border border-red-400/40 bg-red-500/10 p-2 text-red-200">{error}</p>
      )}

      {regions && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dim">Sampled edge colours</h3>
          <div className="flex flex-wrap gap-1">
            {regions.map((region) => {
              const hex = rgbHex(region.rgb)
              return (
                <div
                  key={region.index}
                  title={`${regionLabel(region.index)} — ${hex ?? 'no colour'}`}
                  className="flex h-10 w-10 items-center justify-center rounded border border-line text-[10px]"
                  style={{ backgroundColor: hex ?? 'transparent', color: hex ? '#fff' : 'var(--dim)' }}
                >
                  {region.index + 1}
                </div>
              )
            })}
          </div>
          <p className="text-dim">
            {stats.mapped} fixture{stats.mapped === 1 ? '' : 's'} following an edge
            {stats.colourless > 0 ? ` · ${stats.colourless} without colour (no RGB channels)` : ''}
            {stats.disabled > 0 ? ` · ${stats.disabled} disabled` : ''}
            {stats.inStorage > 0 ? ` · ${stats.inStorage} in storage` : ''}
          </p>
        </section>
      )}
      <p className="text-dim">
        Closing this panel stops Ambience and hands the rig back to your cues.
      </p>
    </div>
  )
}
