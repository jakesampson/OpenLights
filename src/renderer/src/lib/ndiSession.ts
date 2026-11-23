/**
 * Shared NDI Ambience session state (Jake, 23 Nov 2026).
 *
 * The NDI panel, the preset-palette entry and the Live button all need the
 * same view of the session — which source is picked, whether the worker is
 * connected, whether the output layer is on — so the state lives here, in
 * one module, instead of inside the panel's local state. The panel, the
 * palette and App subscribe through `useNdiSession()`; the panel and the
 * Live button both drive the session through the same start/stop/activate
 * functions, so two open panels (tool panel + Settings tab) and a Live
 * button never disagree about whether Ambience is running.
 *
 * Activation has an owner: 'panel' when the NDI panel's Start pressed it,
 * 'live' when a lit Live button did. App's Live-button effect only
 * releases an activation it owns, so a panel-driven session is never
 * killed by a Live button going off — and a Live-driven session is never
 * killed by the panel closing while a button is lit.
 */
import { useSyncExternalStore } from 'react'
import type { NdiReceiveHealth, NdiRegionColour, NdiSourceInfo } from '@shared/ndiAmbience'
import { setAmbienceActive, setAmbienceRegions } from './ndiAmbience'

export type NdiSessionOwner = 'panel' | 'live'

export interface NdiSessionState {
  available: boolean | null
  version: string | null
  sources: NdiSourceInfo[]
  selectedName: string | null
  directAddress: string
  connected: boolean
  /** The output layer is on: ambience colours are driving the rig. */
  active: boolean
  activeBy: NdiSessionOwner | null
  error: string | null
}

const initialState: NdiSessionState = {
  available: null,
  version: null,
  sources: [],
  selectedName: null,
  directAddress: '',
  connected: false,
  active: false,
  activeBy: null,
  error: null
}

let state: NdiSessionState = { ...initialState }
const listeners = new Set<() => void>()

// Sampled edge colours arrive about five times a second while Ambience runs.
// They ride a separate subscription so the ~1 Hz updates only re-render
// the panel's swatches — App and the palette subscribe to the session
// state above and would otherwise re-render every second too.
let regions: NdiRegionColour[] | null = null
const regionListeners = new Set<() => void>()

// Live video preview: the latest JPEG data URL from the worker, at the
// sample cadence (~5 Hz). Separate subscription like regions, so only
// the Screen re-renders. The last frame is kept when Ambience stops —
// it fades out rather than vanishing — and replaced by the next run's
// frames.
let frame: string | null = null
const frameListeners = new Set<() => void>()

export function getNdiFrame(): string | null {
  return frame
}

export function useNdiFrame(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      frameListeners.add(onChange)
      return () => {
        frameListeners.delete(onChange)
      }
    },
    () => frame
  )
}

// Receive health, same pattern as regions: the worker reports it every
// 2 s while a session runs, even when no frames arrive. The panel reads
// it to say whether the feed is actually delivering video — a session
// can be "active" with zero frames (Mac, 23 Nov 2026), and without
// this the panel claims to be driving with no colours at all.
let receiveHealth: NdiReceiveHealth | null = null
const receiveHealthListeners = new Set<() => void>()

export function getNdiReceiveHealth(): NdiReceiveHealth | null {
  return receiveHealth
}

export function useNdiReceiveHealth(): NdiReceiveHealth | null {
  return useSyncExternalStore(
    (onChange) => {
      receiveHealthListeners.add(onChange)
      return () => {
        receiveHealthListeners.delete(onChange)
      }
    },
    () => receiveHealth
  )
}

export function getNdiRegions(): NdiRegionColour[] | null {
  return regions
}

export function useNdiRegions(): NdiRegionColour[] | null {
  return useSyncExternalStore(
    (onChange) => {
      regionListeners.add(onChange)
      return () => {
        regionListeners.delete(onChange)
      }
    },
    () => regions
  )
}

function setState(patch: Partial<NdiSessionState>) {
  const next = { ...state, ...patch }
  const keys = Object.keys(patch) as (keyof NdiSessionState)[]
  // Only notify when something actually changed — the Live-button effect
  // re-runs on every notification, so a no-op notify would re-trigger
  // the session ensure on every render.
  if (keys.every((key) => next[key] === state[key])) return
  state = next
  listeners.forEach((listener) => listener())
}

export function getNdiSessionState(): NdiSessionState {
  return state
}

export function useNdiSession(): NdiSessionState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
      }
    },
    () => state
  )
}

let initialized = false
let unsubscribers: (() => void)[] = []

/** Subscribe to the worker and fetch the runtime version + sources once. */
export function initNdiSession() {
  if (initialized) return
  initialized = true
  const api = window.electronAPI
  const offRegions = api?.onNdiRegions?.((next) => {
    setAmbienceRegions(next)
    regions = next
    regionListeners.forEach((listener) => listener())
  })
  const offReceiveHealth = api?.onNdiReceiveStatus?.((next) => {
    receiveHealth = next
    receiveHealthListeners.forEach((listener) => listener())
  })
  const offFrame = api?.onNdiFrame?.((next) => {
    frame = next
    frameListeners.forEach((listener) => listener())
  })
  const offStatus = api?.onNdiStatus?.((status) => {
    if (status.state === 'error') {
      setAmbienceActive(false)
      setState({ error: status.message ?? 'NDI error', active: false, activeBy: null })
    } else if (status.state === 'stopped') {
      // Another route to this panel stopped the session — follow it, so
      // two open panels never disagree about the running state.
      setAmbienceActive(false)
      setState({ connected: false, active: false, activeBy: null })
    } else if (status.state === 'receiving') {
      setState({ connected: true })
    }
  })
  unsubscribers = [offRegions, offReceiveHealth, offFrame, offStatus].filter((fn): fn is () => void => typeof fn === 'function')
  void api
    ?.ndiVersion?.()
    ?.then((result) => {
      setState({ available: result.available, version: result.version ?? null })
      if (!result.available) setState({ error: result.error ?? 'NDI is unavailable.' })
    })
    ?.catch((e: unknown) => {
      setState({ available: false, error: e instanceof Error ? e.message : String(e) })
    })
  void refreshNdiSources()
}

/** Test-only reset: drop the session state and the worker subscriptions. */
export function resetNdiSession() {
  for (const off of unsubscribers) off()
  unsubscribers = []
  initialized = false
  state = { ...initialState }
  regions = null
  frame = null
  receiveHealth = null
}

export async function refreshNdiSources(): Promise<void> {
  const listSources = window.electronAPI?.ndiListSources
  if (!listSources) return
  try {
    const result = await listSources()
    setState({ sources: result.sources })
    if (result.error) setState({ error: result.error })
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : String(e) })
  }
}

export function selectNdiSource(name: string | null) {
  setState({ selectedName: name, directAddress: '' })
}

export function setNdiDirectAddress(address: string) {
  setState({ directAddress: address })
}

function pickSource(): NdiSourceInfo | undefined {
  const address = state.directAddress.trim()
  if (address) return { name: `direct ${address}`, urlAddress: address }
  return state.sources.find((source) => source.name === state.selectedName) ?? state.sources[0]
}

/** The source a start would connect to right now (direct address wins). */
export function currentNdiSource(): NdiSourceInfo | undefined {
  return pickSource()
}

/**
 * Connect the worker to the picked source. Returns false (and records the
 * reason in state.error) when there is nothing to connect to: no screen
 * on the canvas, no source chosen, or NDI unavailable. Never touches the
 * output layer — the caller activates it with setSessionActive once the
 * connection is up.
 */
export async function startNdiSession(hasScreen: boolean): Promise<boolean> {
  if (state.available === false) {
    setState({ error: 'NDI is unavailable in this app.' })
    return false
  }
  if (!hasScreen) {
    setState({ error: 'Place the screen on the Preview first — ambience has nothing to map to without it.' })
    return false
  }
  const source = pickSource()
  if (!source) {
    setState({ error: 'Choose a source, or enter an address to connect directly.' })
    return false
  }
  setState({ error: null })
  const ndiStart = window.electronAPI?.ndiStart
  if (!ndiStart) {
    setState({ error: 'NDI is unavailable in this app.' })
    return false
  }
  try {
    const result = await ndiStart(source)
    if (!result.success) {
      setState({ error: result.error ?? 'Could not connect to the NDI source.' })
      return false
    }
    setState({ connected: true })
    return true
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : String(e) })
    return false
  }
}

/** Connect if not already connected; a no-op when the worker is up. */
export async function ensureNdiSession(hasScreen: boolean): Promise<boolean> {
  if (state.connected) return true
  return startNdiSession(hasScreen)
}

/**
 * Turn the ambience output layer on or off, recording who owns the
 * activation. Turning it off lifts the override: the rig goes back to
 * whatever the cues, presets and Live buttons underneath are doing now
 * (Jake, 23 Nov 2026) — including presets triggered while Ambience was
 * on, because the layers underneath keep updating while it runs.
 */
export function setSessionActive(on: boolean, by: NdiSessionOwner | null = null) {
  setAmbienceActive(on)
  setState({ active: on, activeBy: on ? by : null })
}

/** Full stop: output off, worker stopped, connection forgotten. */
export async function stopNdiSession(): Promise<void> {
  setSessionActive(false)
  try {
    await window.electronAPI?.ndiStop?.()
  } catch {
    /* Worker already gone — output is already cleared. */
  }
  setState({ connected: false })
}

/**
 * Whether the palette entry can be dragged onto the Live panel, and why
 * not when it cannot. The entry is only usable once the NDI connection
 * is set up (a source picked, or a direct address entered) AND the
 * screen is on the canvas — never start ambience with nothing to map to.
 */
export function ndiAmbienceAvailability(
  session: NdiSessionState,
  hasScreen: boolean
): { usable: boolean; reason: string | null } {
  if (session.available === false) return { usable: false, reason: 'NDI is unavailable in this app.' }
  if (!hasScreen) {
    return { usable: false, reason: 'No screen placed yet — ambience has nothing to map the edges to' }
  }
  if (!session.directAddress.trim() && session.sources.length === 0) {
    return { usable: false, reason: 'Choose a source, or enter an address to connect directly.' }
  }
  return { usable: true, reason: null }
}
