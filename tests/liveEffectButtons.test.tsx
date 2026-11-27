// Jake, 26 Nov 2026 — proven in LightKey by his own test: dragging a
// colour effect onto the Live window creates a button that runs the effect
// while it is active. Whole-App checks on the rendered workspace: the
// palette effect row is draggable with an effect payload, the button
// carries the ∿ mark, and pressing it runs the effect on its fixtures
// (even when the palette had it switched off — the button is the switch),
// pressing again stops it.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { DMXEngine } from '../src/shared/dmx'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { decodeLiveDrop, LIVE_DROP_MIME } from '../src/renderer/src/lib/liveDrops'
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

const FIXTURES = [
  { id: 'p1', name: 'Par 1', type: 'par', channelStart: 1, channels: 4 },
  { id: 'q1', name: 'Q12BT 1', type: 'rgba-4ch', channelStart: 20, channels: 4 }
]
// Deliberately switched OFF in the palette: the Live button must still
// run it when pressed — the button is the switch, not the palette.
const KITT = { id: 'kitt', name: 'K.I.T.T.', fixtureIds: ['p1', 'q1'], attribute: 'intensity', waveform: 'sine', speed: 1, syncToBpm: false, size: 127, offset: 128, enabled: false, phaseSpread: 0 }

function seedShow() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: FIXTURES,
    cues: [],
    fixtureGroups: [],
    presets: [],
    effects: [KITT],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'pad-kitt', name: 'K.I.T.T.', type: 'push', presetIds: [], effectIds: ['kitt'], x: 20, y: 20 }
    ] }]
  } as unknown as ShowDef))
  act(() => {
    useShowStore.setState({
      presets: [],
      selectedFixtureIds: ['p1', 'q1'],
      activePresetIds: [],
      activeLiveValues: {},
      liveActivationOrder: {},
      liveActivationCounter: 0,
      manualOverrides: {},
      activeCueId: null,
      activeLivePageId: 'page1'
    })
  })
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

const s = () => useShowStore.getState()
const frame = () => engine.snapshot()
// p1: idx0 intensity. q1: idx19 red, idx20 green, idx21 blue.
const p1Intensity = () => frame()[0]
const qBlue = () => frame()[21]

function switchToLive() {
  const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes('Live'))
  expect(segment).toBeTruthy()
  act(() => { segment!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
}

function click(target: Element) {
  act(() => { target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
}

// Run every pending rAF callback (the effect loop re-registers each tick).
function runFrames(times = 3) {
  for (let i = 0; i < times; i++) {
    const cbs = [...frames.values()]
    frames.clear()
    act(() => { cbs.forEach((cb) => cb(performance.now())) })
  }
}

const outer = (id: string) => container!.querySelector(`[data-project-id="${id}"]`) as HTMLElement
const innerButton = (id: string) => outer(id).querySelector('button') as HTMLButtonElement

describe('Live effect buttons (Jake, 26 Nov 2026)', () => {
  it('the palette effect row is draggable and its drag writes an effect payload', () => {
    seedShow()
    renderInRoot(<App />)
    const row = container!.querySelector('[data-palette-row="effect:kitt"]') as HTMLElement | null
    expect(row).not.toBeNull()
    expect(row!.draggable).toBe(true)
    const captured: Record<string, string> = {}
    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { setData: (type: string, data: string) => { captured[type] = data }, getData: () => '', setDragImage: () => {}, effectAllowed: 'copy', dropEffect: 'copy', files: [], items: [], types: [] } })
    act(() => { row!.dispatchEvent(event) })
    expect(captured[LIVE_DROP_MIME]).toBeTruthy()
    expect(decodeLiveDrop(captured[LIVE_DROP_MIME])).toMatchObject({ presetIds: [], sequenceIds: [], effectIds: ['kitt'], effectNames: { kitt: 'K.I.T.T.' } })
  })

  it('the effect button shows the ∿ mark', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    expect(innerButton('pad-kitt').textContent).toContain('∿')
    expect(innerButton('pad-kitt').textContent).toContain('K.I.T.T.')
  })

  it('pressing the button runs the effect; pressing again stops it', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    expect(p1Intensity()).toBe(0)
    expect(qBlue()).toBe(0)
    click(innerButton('pad-kitt'))
    expect(s().activeLiveValues['pad-kitt']).toBe(255)
    runFrames()
    // Sine at ~0 phase reads the offset (128): the par's dimmer comes up
    // and the virtual-dimmer Q12BT lifts its default blue.
    expect(p1Intensity()).toBeGreaterThan(0)
    expect(qBlue()).toBeGreaterThan(0)
    click(innerButton('pad-kitt'))
    expect(s().activeLiveValues['pad-kitt']).toBe(0)
    runFrames()
    expect(p1Intensity()).toBe(0)
    expect(qBlue()).toBe(0)
  })
})
