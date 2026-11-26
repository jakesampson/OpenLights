// @vitest-environment jsdom
// Live page fade time ignored (Jake, 20 Nov 2026, voice call): a 10 s
// fade set in Manage Live Pages was not respected — cues swapped
// instantly. Two wiring defects in App's live-output effect, both fixed
// here and locked in by rendering the whole App:
//   1. The effect only faded on a page switch (`changed ? pageFade : 0`)
//      — toggling a cue on the SAME page always passed 0, whatever the
//      fade time was.
//   2. The page fade fell back to 0 instead of the project's Page fade
//      preference, so a page with no per-page value faded over 0 ms even
//      though Manage Live Pages displays the preference as its default.
// Faders and flash buttons deliberately stay immediate: a fader drag
// would otherwise restart a 10 s fade on every input, and a flash must
// follow its press and release.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { DMXEngine } from '../src/shared/dmx'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const engine = new DMXEngine()
const frames = new Map<number, FrameRequestCallback>()
let nextFrameId = 0

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setChannels: (values: Record<number, number>) => engine.setChannels(values),
  getChannels: () => Promise.resolve([])
}
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++nextFrameId, cb); return nextFrameId })
vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })

let container: HTMLDivElement | undefined
let root: Root | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  root = createRoot(el)
  act(() => { root.render(node) })
  return el
}

function runFrames(now: number) {
  // Run every pending frame once at `now` (the fade tick re-schedules
  // itself; one-shot callbacks do not).
  for (const [id, cb] of [...frames.entries()]) {
    frames.delete(id)
    act(() => { cb(now) })
  }
}

const PAR = { id: 'par', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }
const RED_CUE = { id: 'cueA', name: 'Red', fadeMs: 0, fixtureValues: { par: { intensity: 255, red: 255, green: 0, blue: 0 } } }

function showWithPage(page: Record<string, unknown>, pageFadeMs?: number): ShowDef {
  return migrateShow({
    fixtures: [PAR],
    cues: [RED_CUE],
    preferences: { pageFadeMs },
    livePages: [page]
  } as unknown as ShowDef)
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  frames.clear()
  const state = useShowStore.getState()
  state.setShow(migrateShow({ fixtures: [], cues: [] } as unknown as ShowDef))
  state.exitSetupWizard()
  state.setWelcomeOpen(false)
  state.setNewProjectDialogOpen(false)
  state.setNewProjectTemplate(null)
  window.localStorage.clear()
  engine.setChannels({})
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

describe('Live page fade wiring (whole App)', () => {
  it('fades a same-page cue toggle over the page fade time instead of swapping instantly', () => {
    const s = () => useShowStore.getState()
    s().setShow(showWithPage({
      id: 'p1', name: 'Page', fadeMs: 10000,
      controls: [{ id: 'cA', name: 'Red', type: 'toggle', cueId: 'cueA', presetIds: [] }]
    }))
    renderInRoot(<App />)
    expect(engine.snapshot()[1]).toBe(0)
    const start = performance.now()
    act(() => { s().setLiveValue('cA', 255) })
    // Halfway through the 10 s fade the red channel is part-way up —
    // before the fix this was already 255 (instant swap).
    runFrames(start + 5000)
    const mid = engine.snapshot()[1]
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(255)
    runFrames(start + 10000)
    expect(engine.snapshot()[1]).toBe(255)
  })

  it('falls back to the project Page fade when the page has no per-page value', () => {
    const s = () => useShowStore.getState()
    s().setShow(showWithPage({
      id: 'p1', name: 'Page',
      controls: [{ id: 'cA', name: 'Red', type: 'toggle', cueId: 'cueA', presetIds: [] }]
    }, 10000))
    renderInRoot(<App />)
    const start = performance.now()
    act(() => { s().setLiveValue('cA', 255) })
    runFrames(start + 5000)
    const mid = engine.snapshot()[1]
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(255)
    runFrames(start + 10000)
    expect(engine.snapshot()[1]).toBe(255)
  })

  it('a fader drag stays immediate — it must not start a 10 s fade', () => {
    const s = () => useShowStore.getState()
    s().setShow(showWithPage({
      id: 'p1', name: 'Page', fadeMs: 10000,
      controls: [{ id: 'cA', name: 'Red', type: 'fader', cueId: 'cueA', presetIds: [] }]
    }))
    renderInRoot(<App />)
    act(() => { s().setLiveValue('cA', 255) })
    // Exactly one frame stays pending: StagePreview's persistent
    // ~60fps output loop (Jake, 26 Nov 2026). A fader drag must not
    // start a fade loop on top of it — before that change this count
    // was 0, and the loop is the only difference.
    expect(frames.size).toBe(1)
    expect(engine.snapshot()[1]).toBe(255)
  })

  it('a flash press stays immediate — it must not fade in or lag its release', () => {
    const s = () => useShowStore.getState()
    s().setShow(showWithPage({
      id: 'p1', name: 'Page', fadeMs: 10000,
      controls: [{ id: 'cA', name: 'Red', type: 'flash', cueId: 'cueA', presetIds: [] }]
    }))
    renderInRoot(<App />)
    act(() => { s().setLiveValue('cA', 255) })
    expect(frames.size).toBe(1)
    expect(engine.snapshot()[1]).toBe(255)
    act(() => { s().setLiveValue('cA', 0) })
    expect(engine.snapshot()[1]).toBe(0)
  })
})
