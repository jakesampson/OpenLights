/**
 * NDI Ambience worker — runs as an Electron UtilityProcess, so a crash in
 * the native NDI code cannot take the lighting app down with it.
 *
 * It is deliberately dumb: discover sources, connect to a chosen one,
 * receive BGRA frames at Normal latency and sample the EDGES of each
 * frame into per-region colours (see src/shared/ndiAmbience.ts). Only
 * the small colour set — plus a 360p thumbnail for the live video
 * preview on the Screen — leaves this process, about five times a
 * second. The main process forwards messages between this worker and
 * the renderer; the renderer owns the mapping of regions to fixtures
 * and the output.
 *
 * Protocol (parentPort messages):
 *   in  { type: 'list' }                        → out { type: 'sources', sources }
 *   in  { type: 'start', source }               → out { type: 'started', source } / { type: 'error', message }
 *   in  { type: 'stop' }                        → out { type: 'stopped' }
 *   out { type: 'ready', version }              on load (grandi initialised)
 *   out { type: 'regions', regions, at }        ~five times a second while receiving
 *   out { type: 'frame', width, height, data }  ~five times a second while receiving —
 *                                               a 360p BGRA thumbnail for the live
 *                                               video preview on the Screen (Jake,
 *                                               23 Nov 2026); never a full frame
 *   out { type: 'receive-status', framesReceived, connections, lastFrameAt, startedAt }
 *                                               every 2 s while receiving — even
 *                                               when no frames arrive, so a
 *                                               stalled receiver is visible
 *                                               instead of silently "driving"
 *   out { type: 'error', message }              on any failure
 */
import { NDI_STALL_WARN_MS, downscaleFrame, sampleEdgeRegions, type NdiRegionColour, type NdiSourceInfo } from '../shared/ndiAmbience'
import type { Finder, Receiver } from 'grandi'

// The forked script runs as a Node process, not an Electron module, so
// `process.parentPort` is the only channel back to main. It is not on
// Node's Process type — cast rather than pretend it is typed.
const parentPort = (process as unknown as { parentPort?: { postMessage: (message: unknown) => void; on: (event: string, listener: (message: unknown) => void) => void } }).parentPort

function post(message: unknown) {
  try {
    parentPort?.postMessage(message)
  } catch { /* Parent gone — nothing to report to. */ }
}

const DISCOVERY_WAIT_MS = 5_000
const FRAME_TIMEOUT_MS = 1_000
/** Region sets are posted ~5 times a second (Jake, 23 Nov 2026): fast
 * enough to follow a slide change promptly, slow enough that the
 * renderer-side smoothing has time to glide between samples. */
const POST_INTERVAL_MS = 200
const STATUS_INTERVAL_MS = 2_000

type GrandiApi = Awaited<ReturnType<typeof loadGrandi>>

async function loadGrandi() {
  // Dynamic import, as in the standalone spike's load-grandi.js: grandi
  // ships ESM (dist/index.mjs) and this file is bundled to CommonJS, so
  // a static import would rely on require(esm) working in the built
  // worker. A failed load means the install itself is broken — grandi
  // bundles the NDI runtime inside its per-platform package, so there is
  // no separate runtime download to blame.
  const grandi = (await import('grandi')).default
  if (!grandi.isSupportedCPU()) throw new Error('This CPU is not supported by the NDI SDK.')
  if (!grandi.initialize()) throw new Error('NDI failed to initialise.')
  return grandi
}

async function main() {
  if (!parentPort) {
    // No parent to talk to — nothing useful this process can do.
    process.exit(1)
  }
  let grandi: GrandiApi
  try {
    grandi = await loadGrandi()
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
    // Give the message a tick to flush, then exit — main reports the
    // failure and the panel shows it instead of hanging on "starting…".
    setTimeout(() => process.exit(1), 100)
    return
  }
  post({ type: 'ready', version: grandi.version() })

  let finder: Finder | null = null
  let receiver: Receiver | null = null
  let receiving = false
  let receiveRun = 0

  async function listSources(): Promise<NdiSourceInfo[]> {
    if (!finder) finder = await grandi.find({ showLocalSources: true })
    const deadline = Date.now() + DISCOVERY_WAIT_MS
    let sources: NdiSourceInfo[] = []
    while (Date.now() < deadline) {
      sources = finder.sources()
      if (sources.length > 0) break
      await finder.wait(Math.min(250, deadline - Date.now()))
      sources = finder.sources()
    }
    return sources
  }

  async function receiveLoop(run: number) {
    let lastPostAt = 0
    let lastStatusAt = 0
    let framesReceived = 0
    let lastFrameAt: number | null = null
    const startedAt = Date.now()
    let stallWarned = false
    const postStatus = () => {
      // How many connections the receiver holds to the sender (0 when
      // the video connection never established) — grandi's Receiver API.
      let connections = 0
      try {
        connections = receiver?.connections() ?? 0
      } catch { /* Receiver gone — report 0. */ }
      post({ type: 'receive-status', framesReceived, connections, lastFrameAt, startedAt })
    }
    while (receiving && run === receiveRun) {
      const now = Date.now()
      // Heartbeat even when no frames arrive — silence is the symptom
      // this exists to make visible.
      if (now - lastStatusAt >= STATUS_INTERVAL_MS) {
        lastStatusAt = now
        postStatus()
      }
      if (framesReceived === 0 && !stallWarned && now - startedAt >= NDI_STALL_WARN_MS) {
        stallWarned = true
        console.warn(`[ndi-worker] No video frames received in ${NDI_STALL_WARN_MS / 1000}s — the receiver may not be able to reach the source.`)
      }
      let frame: Awaited<ReturnType<Receiver['video']>> | null = null
      try {
        frame = await receiver!.video(FRAME_TIMEOUT_MS)
      } catch {
        frame = null
      }
      if (!frame || !receiving || run !== receiveRun) continue
      framesReceived++
      lastFrameAt = Date.now()
      // Drop stale queued frames so the next sample is fresh — ambient
      // lighting follows the screen, not a backlog of old frames.
      for (let i = 0; i < 8; i++) {
        try {
          await receiver!.video(0)
        } catch {
          break
        }
      }
      if (now - lastPostAt < POST_INTERVAL_MS) continue
      lastPostAt = now
      let regions: NdiRegionColour[]
      try {
        regions = sampleEdgeRegions(frame)
      } catch (error) {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
        continue
      }
      post({ type: 'regions', regions, at: now })
      // Live video preview on the Screen (Jake, 23 Nov 2026): a 360p
      // thumbnail at the same cadence — never a full frame. A thumbnail
      // failure must not break the regions above, so it is guarded.
      try {
        const thumb = downscaleFrame(frame)
        post({ type: 'frame', width: thumb.width, height: thumb.height, data: Buffer.from(thumb.data) })
      } catch { /* Regions already posted; the preview just stays still. */ }
    }
  }

  async function start(source: NdiSourceInfo) {
    stopReceiving()
    try {
      // BGRA at Normal latency, as in the spike: the picture arrives
      // ready to sample, with no colour conversion on this side.
      receiver = await grandi.receive({
        source,
        colorFormat: grandi.ColorFormat.BGRX_BGRA,
        bandwidth: grandi.Bandwidth.Highest,
        allowVideoFields: false,
        name: 'OpenLights NDI Ambience'
      })
    } catch (error) {
      post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      return
    }
    receiving = true
    receiveRun++
    post({ type: 'started', source })
    void receiveLoop(receiveRun)
  }

  function stopReceiving() {
    receiving = false
    receiveRun++
    if (receiver) {
      try {
        receiver.destroy()
      } catch { /* Already gone. */ }
      receiver = null
    }
  }

  function shutdown() {
    stopReceiving()
    try {
      finder?.destroy()
    } catch { /* Already gone. */ }
    finder = null
    try {
      grandi.destroy()
    } catch { /* Already gone. */ }
  }

  parentPort.on('message', (event: unknown) => {
    const message = (event as { data?: unknown }).data ?? event
    if (!message || typeof message !== 'object') return
    const { type } = message as { type?: string }
    if (type === 'list') {
      listSources()
        .then((sources) => post({ type: 'sources', sources }))
        .catch((error: unknown) => post({ type: 'error', message: error instanceof Error ? error.message : String(error) }))
    } else if (type === 'start') {
      const { source } = message as { source?: NdiSourceInfo }
      if (!source || typeof source.name !== 'string') {
        post({ type: 'error', message: 'No NDI source was chosen.' })
        return
      }
      void start(source)
    } else if (type === 'stop') {
      stopReceiving()
      post({ type: 'stopped' })
    } else if (type === 'shutdown') {
      shutdown()
      process.exit(0)
    }
  })
  parentPort.on('close', () => {
    shutdown()
    process.exit(0)
  })
}

void main()
