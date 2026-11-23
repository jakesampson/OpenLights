// Jake, 23 Nov 2026 — NDI Ambience on the Live palette: the preset
// palette's bottom row drags onto a Live page to create an on/off
// button, gated on the NDI connection + the screen on the canvas; the
// button toggles the ambience override layer, and stopping Ambience
// reveals the preset triggered while it was on.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { DMXEngine } from '../src/shared/dmx'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'
import {
  applyLiveDrop, decodeLiveDrop, dropLabel, encodeLiveDrop, NDI_AMBIENCE_BUTTON_COLOR,
  type LiveDropPayload
} from '../src/renderer/src/lib/liveDrops'
import {
  configureLiveOutput, configureOverrideOutput, configurePresetOutput, clearAmbienceOutput,
  sendImmediate, setAmbienceOutput, setEffectBlackout
} from '../src/renderer/src/lib/output'
import { isAmbienceActive, resetAmbienceState } from '../src/renderer/src/lib/ndiAmbience'
import {
  ensureNdiSession, getNdiSessionState, initNdiSession, ndiAmbienceAvailability,
  resetNdiSession, setNdiDirectAddress, setSessionActive, startNdiSession, stopNdiSession
} from '../src/renderer/src/lib/ndiSession'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const engine = new DMXEngine()
const frames = new Map<number, FrameRequestCallback>()
let nextFrameId = 0
const ndiStartMock = vi.fn(() => Promise.resolve({ success: true }))
const ndiStopMock = vi.fn(() => Promise.resolve({ success: true }))

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setChannels: (values: Record<number, number>) => engine.setChannels(values),
  getChannels: () => Promise.resolve([]),
  ndiVersion: () => Promise.resolve({ available: true, version: 'NDI SDK 6.3.2.0' }),
  ndiListSources: () => Promise.resolve({ sources: [] }),
  ndiStart: ndiStartMock,
  ndiStop: ndiStopMock,
  onNdiRegions: () => () => {},
  onNdiStatus: () => () => {}
}
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++nextFrameId, cb); return nextFrameId })
vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })

const flushPromises = async () => { await act(async () => {}) }

function resetOutputLayers() {
  setEffectBlackout(false)
  sendImmediate({})
  configurePresetOutput({})
  configureLiveOutput({})
  configureOverrideOutput({})
  clearAmbienceOutput()
}

describe('NDI session (shared by panel, palette and Live button)', () => {
  beforeEach(async () => {
    resetAmbienceState()
    resetNdiSession()
    ndiStartMock.mockClear()
    ndiStopMock.mockClear()
    initNdiSession()
    await flushPromises()
  })

  it('reports why the palette entry is unusable, and usable once set up', () => {
    const state = getNdiSessionState()
    expect(state.available).toBe(true)
    expect(ndiAmbienceAvailability(state, false)).toEqual({
      usable: false, reason: 'No screen placed yet — ambience has nothing to map the edges to'
    })
    expect(ndiAmbienceAvailability(state, true)).toEqual({
      usable: false, reason: 'Choose a source, or enter an address to connect directly.'
    })
    setNdiDirectAddress('127.0.0.1:5961')
    expect(ndiAmbienceAvailability(getNdiSessionState(), true)).toEqual({ usable: true, reason: null })
    expect(ndiAmbienceAvailability({ ...getNdiSessionState(), available: false }, true)).toEqual({
      usable: false, reason: 'NDI is unavailable in this app.'
    })
  })

  it('refuses to start with nothing to map to, and connects by direct address', async () => {
    expect(await startNdiSession(false)).toBe(false)
    expect(getNdiSessionState().error).toContain('Place the screen on the Preview first')
    expect(ndiStartMock).not.toHaveBeenCalled()
    expect(await startNdiSession(true)).toBe(false)
    expect(getNdiSessionState().error).toContain('Choose a source')
    setNdiDirectAddress('127.0.0.1:5961')
    expect(await startNdiSession(true)).toBe(true)
    expect(ndiStartMock).toHaveBeenCalledWith({ name: 'direct 127.0.0.1:5961', urlAddress: '127.0.0.1:5961' })
    expect(getNdiSessionState().connected).toBe(true)
  })

  it('activates the output layer and stops cleanly', async () => {
    setNdiDirectAddress('127.0.0.1:5961')
    expect(await ensureNdiSession(true)).toBe(true)
    setSessionActive(true, 'live')
    expect(isAmbienceActive()).toBe(true)
    expect(getNdiSessionState().activeBy).toBe('live')
    setSessionActive(false)
    expect(isAmbienceActive()).toBe(false)
    await stopNdiSession()
    expect(ndiStopMock).toHaveBeenCalled()
    expect(getNdiSessionState().connected).toBe(false)
  })
})

describe('NDI Ambience live drop', () => {
  const page = () => ({
    id: 'page', name: 'Page',
    controls: [{ id: 'c1', name: 'Cue one', type: 'toggle' as const, presetIds: ['p-old'], x: 600, y: 20 }],
    annotations: []
  })
  let counter = 0
  const makeId = () => `ndi-${++counter}`
  const payload: LiveDropPayload = { presetIds: [], sequenceIds: [], ndiAmbience: true }

  it('round-trips the ambience flag through encode/decode', () => {
    expect(decodeLiveDrop(encodeLiveDrop(payload))).toEqual({ presetIds: [], sequenceIds: [], ndiAmbience: true })
    expect(dropLabel(payload)).toBe('NDI Ambience')
  })

  it('creates a standalone toggle button with the NDI blue, no presets', () => {
    const { page: next, refs } = applyLiveDrop(page(), payload, { kind: 'page', x: 100, y: 100 }, makeId)
    expect(refs).toHaveLength(1)
    const control = next.controls.find((item) => item.id === refs[0].id)
    expect(control).toMatchObject({
      name: 'NDI Ambience', type: 'toggle', presetIds: [], ndiAmbience: true,
      appearance: { color: NDI_AMBIENCE_BUTTON_COLOR, releaseOthers: false }
    })
    expect(control?.cueId).toBeUndefined()
    expect(control?.sequenceIds ?? []).toEqual([])
  })

  it('ignores a drop onto an existing cue instead of corrupting it', () => {
    const before = page()
    const { page: next, refs } = applyLiveDrop(before, payload, { kind: 'cue', cueId: 'c1' }, makeId)
    expect(refs).toEqual([])
    expect(next).toEqual(before)
  })
})

describe('Ambience as an override layer', () => {
  beforeEach(() => {
    resetAmbienceState()
    resetOutputLayers()
  })

  it('stopping ambience reveals the preset triggered while it was on', () => {
    // Preset A on channel 1, then ambience takes over channel 2.
    configurePresetOutput({ 1: 255 })
    expect(engine.snapshot()[0]).toBe(255)
    setAmbienceOutput({ 2: 200 })
    expect(engine.snapshot()[1]).toBe(200)
    // Preset B triggered while ambience is on: the underlying layers
    // keep updating underneath it.
    configurePresetOutput({ 1: 100, 3: 50 })
    expect(engine.snapshot()[0]).toBe(100)
    expect(engine.snapshot()[1]).toBe(200)
    // Stop ambience: the output must match preset B exactly — the
    // ambience-only channel goes to zero, not left latched.
    clearAmbienceOutput()
    expect(Array.from(engine.snapshot().slice(0, 4))).toEqual([100, 0, 50, 0])
  })
})

describe('preset palette NDI row and Live button', () => {
  let container: HTMLDivElement | undefined
  let root: Root | undefined
  let defaultShow: ReturnType<typeof useShowStore.getState>['show']

  const FIXTURES = [
    { id: 'p1', name: 'Par 1', type: 'par', channelStart: 1, channels: 4 },
    { id: 'q1', name: 'Q12BT 1', type: 'rgba-4ch', channelStart: 20, channels: 4 }
  ]
  const RED = { id: 'red', name: 'Red', fixtureValues: { p1: { red: 255 }, q1: { red: 255 } } }
  const SCREEN = {
    id: 'screen1', kind: 'screen' as const, name: 'Screen', x: 400, y: 170,
    width: 320, height: 180, rotation: 0, fill: 'rgba(10,132,255,0.10)', stroke: '#0A84FF', opacity: 1
  }

  function seedShow() {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: FIXTURES,
      cues: [],
      fixtureGroups: [],
      presets: [RED],
      stageObjects: [SCREEN],
      livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [] }]
    } as unknown as ShowDef))
    act(() => {
      useShowStore.setState({
        presets: [RED],
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

  function renderApp() {
    const el = document.createElement('div')
    document.body.appendChild(el)
    container = el
    root = createRoot(el)
    act(() => { root.render(<App />) })
    return el
  }

  const s = () => useShowStore.getState()
  const ndiRow = () => container?.querySelector('[data-palette-row="ndi-ambience"]') as HTMLElement | null
  const click = (target: Element) => {
    act(() => { target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  function switchToLive() {
    const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes('Live'))
    expect(segment).toBeTruthy()
    click(segment!)
    expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
  }

  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    frames.clear()
    defaultShow = useShowStore.getState().show
    resetAmbienceState()
    resetNdiSession()
    resetOutputLayers()
    ndiStartMock.mockClear()
    ndiStopMock.mockClear()
    const state = useShowStore.getState()
    state.setShow(migrateShow({ fixtures: [], cues: [] } as unknown as ShowDef))
    state.exitSetupWizard()
    state.setWelcomeOpen(false)
    state.setNewProjectDialogOpen(false)
    state.setNewProjectTemplate(null)
    window.localStorage.clear()
    seedShow()
    renderApp()
  })

  afterEach(() => {
    act(() => { root?.unmount() })
    container?.remove()
    root = undefined
    container = undefined
    act(() => { useShowStore.setState({ show: defaultShow }) })
    resetAmbienceState()
    resetNdiSession()
  })

  it('shows the row at the bottom of the palette, unavailable until set up', async () => {
    await flushPromises()
    const row = ndiRow()
    expect(row).not.toBeNull()
    expect(row?.textContent).toContain('NDI Ambience')
    // Screen is placed but no source is known: not draggable, with the reason.
    expect(row?.textContent).toContain('Choose a source')
    expect(row?.querySelector('[draggable]')?.getAttribute('draggable')).toBe('false')
  })

  it('says the screen is missing, and becomes draggable once set up', async () => {
    await flushPromises()
    act(() => { s().removeStageObjects(['screen1']) })
    expect(ndiRow()?.textContent).toContain('No screen placed yet')
    expect(ndiRow()?.querySelector('[draggable]')?.getAttribute('draggable')).toBe('false')
    act(() => { s().addStageObject(SCREEN) })
    act(() => { setNdiDirectAddress('127.0.0.1:5961') })
    expect(ndiRow()?.textContent).not.toContain('No screen placed yet')
    expect(ndiRow()?.textContent).not.toContain('Choose a source')
    expect(ndiRow()?.querySelector('[draggable]')?.getAttribute('draggable')).toBe('true')
  })

  it('clicking the row opens the NDI Ambience panel', async () => {
    await flushPromises()
    // The click handler lives on the inner draggable row (as with preset
    // rows) — the outer div only marks the row for the tree.
    const inner = ndiRow()?.querySelector('[role="treeitem"]') as HTMLElement | null
    expect(inner).not.toBeNull()
    click(inner!)
    expect(container?.textContent).toContain('NDI source')
  })

  it('dropping it on a Live page creates the button, and the button toggles ambience', async () => {
    await flushPromises()
    act(() => { setNdiDirectAddress('127.0.0.1:5961') })
    let controlId = ''
    act(() => {
      s().dropOnLivePage({ presetIds: [], sequenceIds: [], ndiAmbience: true }, { kind: 'page', x: 100, y: 100 })
      controlId = s().show?.livePages?.find((page) => page.id === 'page1')?.controls[0]?.id ?? ''
    })
    expect(controlId).not.toBe('')
    const control = s().show?.livePages?.find((page) => page.id === 'page1')?.controls[0]
    expect(control?.ndiAmbience).toBe(true)
    switchToLive()
    const button = container!.querySelector(`[data-project-id="${controlId}"] button`) as HTMLButtonElement
    expect(button).not.toBeNull()
    expect(button.getAttribute('aria-pressed')).toBe('false')
    click(button)
    await flushPromises()
    expect(ndiStartMock).toHaveBeenCalledWith({ name: 'direct 127.0.0.1:5961', urlAddress: '127.0.0.1:5961' })
    expect(isAmbienceActive()).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    click(button)
    await flushPromises()
    expect(isAmbienceActive()).toBe(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })
})
