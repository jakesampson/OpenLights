/**
 * NDI Ambience panel — HyperHDR-style ambient lighting from an NDI video
 * feed (Jake, 23 Nov 2026). The feed's screen sits on the Preview as a
 * draggable object; each edge region feeds the fixtures nearest to it.
 *
 * Ambience is an explicit live mode: Start takes over the mapped
 * fixtures, Stop hands the rig back to cues, presets and Live. The
 * session state itself lives in lib/ndiSession, shared with the
 * preset-palette entry and the Live button — the panel, the Settings
 * tab's copy of it and a Live button all read and drive the same
 * session, so two open panels never disagree about whether Ambience is
 * running. Closing the panel stops Ambience — like the DMX test panel,
 * it never leaves output running behind your back — unless
 * `stopOnUnmount` is false: the Settings dialog's NDI Ambience tab
 * (Jake, 23 Nov 2026 — the Windows route to this panel, since the
 * native menu bar is unreachable on a frameless window) embeds the
 * panel with stopOnUnmount={false}, so closing Settings leaves a
 * running session alone. Closing the panel never stops a session a lit
 * Live button owns — the button is the authority there.
 */
import { useEffect, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import {
  DEFAULT_SCREEN_HEIGHT,
  DEFAULT_SCREEN_WIDTH,
  NDI_STALL_WARN_MS,
  edgeRegionAnchors,
  findNdiScreen,
  rgbHex,
  type NdiRegionColour,
  type NdiSourceInfo
} from '@shared/ndiAmbience'
import { configureAmbienceFixtures, getAmbienceStats, type NdiAmbienceStats } from '../lib/ndiAmbience'
import {
  currentNdiSource,
  getNdiSessionState,
  initNdiSession,
  refreshNdiSources,
  selectNdiSource,
  setNdiDirectAddress,
  setSessionActive,
  startNdiSession,
  stopNdiSession,
  useNdiReceiveHealth,
  useNdiRegions,
  useNdiSession
} from '../lib/ndiSession'

function regionLabel(index: number): string {
  const anchor = edgeRegionAnchors()[index]
  if (!anchor) return `Region ${index + 1}`
  if (anchor.y === 0) return anchor.x < 0.5 ? 'Top left' : 'Top right'
  if (anchor.x === 1) return anchor.y < 0.5 ? 'Right top' : 'Right bottom'
  if (anchor.y === 1) return anchor.x > 0.5 ? 'Bottom right' : 'Bottom left'
  return anchor.y < 0.5 ? 'Left top' : 'Left bottom'
}

/** A Live button currently driving Ambience — the panel must not stop it. */
function liveButtonOwnsSession(): boolean {
  const { show, activeLiveValues } = useShowStore.getState()
  return (show?.livePages ?? []).some((page) =>
    page.controls.some((control) => control.ndiAmbience && (activeLiveValues[control.id] ?? 0) > 0)
  )
}

/** True when an address is in Tailscale's 100.64.0.0/10 range — only a
 * machine running Tailscale can reach it. */
function isTailscaleAddress(address: string | undefined): boolean {
  if (!address) return false
  return /^100\.(64|6[5-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(address)
}

export function NdiAmbiencePanel({ stopOnUnmount = true }: { stopOnUnmount?: boolean }) {
  const { show, master, addStageObject, removeStageObjects } = useShowStore()
  const session = useNdiSession()
  const regions = useNdiRegions()
  const health = useNdiReceiveHealth()
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<NdiAmbienceStats>(getAmbienceStats())

  const { sources, selectedName, directAddress, available, version, error } = session
  const running = session.connected && session.active
  const activeSource = currentNdiSource()
  // "Driving" means colours are actually arriving — a session can be
  // connected with zero frames (Mac, 23 Nov 2026), and the old label
  // claimed it was driving with no colours at all.
  const stalled =
    running &&
    !regions &&
    health !== null &&
    health.framesReceived === 0 &&
    Date.now() - health.startedAt > NDI_STALL_WARN_MS

  const screen = findNdiScreen(show?.stageObjects)
  const fixtures = show?.fixtures ?? []

  const stop = async () => {
    // A lit Live button would re-start the session via App's effect —
    // turn the buttons off first, so Stop means stopped everywhere.
    const { show: currentShow, activeLiveValues, setLiveValue } = useShowStore.getState()
    for (const page of currentShow?.livePages ?? []) {
      for (const control of page.controls) {
        if (control.ndiAmbience && (activeLiveValues[control.id] ?? 0) > 0) setLiveValue(control.id, 0)
      }
    }
    await stopNdiSession()
  }

  // Own the ambience session: the shared module subscribes to the worker,
  // and this panel stops everything when it closes (unless it is the
  // Settings tab, or a Live button owns the session).
  useEffect(() => {
    initNdiSession()
    return () => {
      if (!stopOnUnmount || liveButtonOwnsSession()) return
      const current = getNdiSessionState()
      if (current.connected || current.active) void stopNdiSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the mapper in step with the show while the panel is open.
  useEffect(() => {
    configureAmbienceFixtures(fixtures, show?.stageObjects, master)
    setStats(getAmbienceStats())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.fixtures, show?.stageObjects, master])

  // Fresh stats when new edge colours arrive.
  useEffect(() => {
    setStats(getAmbienceStats())
  }, [regions])

  const refreshSources = async () => {
    setBusy(true)
    try {
      await refreshNdiSources()
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
    if (running) await stop()
    removeStageObjects([screen.id])
  }

  const start = async () => {
    setBusy(true)
    try {
      const ok = await startNdiSession(Boolean(screen))
      if (ok) setSessionActive(true, 'panel')
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
              onChange={() => selectNdiSource(source.name)}
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
            onChange={(e) => setNdiDirectAddress(e.target.value)}
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
          {running && regions
            ? 'Ambience is driving the mapped fixtures.'
            : running
              ? `Connected to ${activeSource?.name ?? 'the source'} — waiting for the first video frame…`
              : 'Stopped — cues, presets and Live are in charge.'}
        </span>
      </section>

      {running && !regions && health && (
        <p className="text-dim">
          Frames received: {health.framesReceived} · Receiver connections: {health.connections}
        </p>
      )}

      {stalled && (
        <p className="rounded border border-amber-400/40 bg-amber-500/10 p-2 text-amber-200">
          No video frames have arrived from {activeSource?.name ?? 'the source'}
          {activeSource?.urlAddress ? ` (${activeSource.urlAddress})` : ''} in over{' '}
          {NDI_STALL_WARN_MS / 1000} seconds. Check this computer can reach that address.
          {activeSource?.urlAddress && isTailscaleAddress(activeSource.urlAddress)
            ? ' That address is a Tailscale address — this computer needs Tailscale running to reach it. Otherwise connect directly to the feed machine’s local-network address in the field above.'
            : ''}
        </p>
      )}

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
        {stopOnUnmount
          ? 'Closing this panel stops Ambience and hands the rig back to your cues.'
          : 'Closing Settings leaves Ambience running — stop it here or from the View menu’s NDI Ambience panel.'}
      </p>
    </div>
  )
}
