// Jake, 22 Nov 2026 — Live pads lift palette presets, and a dimmer
// alone raises the default colour (LightKey behaviour). Whole-App
// checks on the composed DMX frame (DMXEngine snapshot):
//   A1. Palette Red on + Live Full On pad pressed → red at full.
//   A2. Same, plus a manual Design override → Clear Overrides clears
//       the manual tweak only; the palette Red stays on and lit, and
//       with no manual override there is no brush button at all.
//   A3. Same, then the Live pad off → red goes dark again (the palette
//       preset is still on, but unlit).
//   B1. Live Full On pad alone → default blue at full.
//   B1b. Palette Full On preset alone → default blue at full.
//   B2. Hardware-dimmer fixture: same blue-at-full outcome as before
//       (its dimmer alone already raised blue via the defaults layer).
//   R.  Regressions: palette Red + Full On (no Live) still red at
//       full; Live pads alone still combine; a Live Red pad alone
//       stays dark.
// Channels (snapshot is 0-based, index = channel − 1): p1 par ch1
// intensity, ch2 red, ch3 green, ch4 blue; q1 Q12BT ch20 red, ch21
// green, ch22 blue, ch23 amber.
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
const RED = { id: 'red', name: 'Red', fixtureValues: { p1: { red: 255 }, q1: { red: 255 } } }
const FULL = { id: 'full', name: 'Full On', fixtureValues: { p1: { intensity: 255 }, q1: { intensity: 255 } } }

function seedShow() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: FIXTURES,
    cues: [],
    fixtureGroups: [],
    presets: [RED, FULL],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'pad-red', name: 'Red', type: 'toggle', presetIds: ['red'] },
      { id: 'pad-full', name: 'Full On', type: 'toggle', presetIds: ['full'] }
    ] }]
  } as unknown as ShowDef))
  act(() => {
    useShowStore.setState({
      presets: [RED, FULL],
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

const frame = () => engine.snapshot()
// p1: idx0 intensity, idx1 red, idx3 blue. q1: idx19 red, idx21 blue.
const qRed = () => frame()[19]
const qBlue = () => frame()[21]
const pRed = () => frame()[1]
const pIntensity = () => frame()[0]
const pBlue = () => frame()[3]

/** Run every pending animation frame to the end of the fade — the base
 *  look now fades over the global Default fade instead of snapping
 *  (Jake, 24 Nov 2026), so a test asserting the settled look must let
 *  the fade land first. */
function finishFade() {
  const t = performance.now() + 5000
  let guard = 0
  while (frames.size && guard++ < 10) {
    for (const [id, cb] of [...frames]) { frames.delete(id); cb(t) }
  }
}

describe('Live pads lift palette presets (whole App)', () => {
  it('A1: palette Red + Live Full On pad gives red at full', () => {
    seedShow()
    renderInRoot(<App />)
    const s = () => useShowStore.getState()
    act(() => { s().togglePreset('red') })
    act(() => { s().setLiveValue('pad-full', 255) })
    expect(qRed()).toBe(255)
    expect(qBlue()).toBe(0)
    expect(pRed()).toBe(255)
    expect(pBlue()).toBe(0)
    expect(pIntensity()).toBe(255)
  })

  it('A2: Clear Overrides clears a manual tweak but the palette Red stays on', () => {
    seedShow()
    renderInRoot(<App />)
    const s = () => useShowStore.getState()
    act(() => { s().togglePreset('red') })
    act(() => { s().setLiveValue('pad-full', 255) })
    expect(qRed()).toBe(255)
    // With only the palette preset on and no manual override, there
    // is no brush to press — it renders only while manual overrides
    // exist (Jake, 22 Nov 2026 correction).
    expect(container?.querySelector('button[title="Clear overridden fixture properties"]')).toBeNull()
    // Playing with the colour controls in Design on one fixture: a
    // manual green override on the Q fixture shows up on top of the
    // red (its green channel, snapshot idx 20).
    act(() => { useShowStore.setState({ manualOverrides: { q1: { green: 200 } } }) })
    expect(frame()[20]).toBe(200)
    const brush = container?.querySelector('button[title="Clear overridden fixture properties"]') as HTMLElement | null
    expect(brush).not.toBeNull()
    act(() => { brush!.click() })
    // The manual tweak is gone, but the palette preset is still on
    // and still lighting the fixture (lifted by the pressed Live pad).
    expect(s().manualOverrides).toEqual({})
    expect(s().activePresetIds).toContain('red')
    expect(qRed()).toBe(255)
    expect(frame()[20]).toBe(0)
    expect(qBlue()).toBe(0)
  })

  it('A3: releasing the Live pad drops the palette Red back to dark', () => {
    seedShow()
    renderInRoot(<App />)
    const s = () => useShowStore.getState()
    act(() => { s().togglePreset('red') })
    act(() => { s().setLiveValue('pad-full', 255) })
    expect(qRed()).toBe(255)
    act(() => { s().setLiveValue('pad-full', 0) })
    expect(qRed()).toBe(0)
    expect(qBlue()).toBe(0)
    // The par's frame red stays 255 — the still-active Red preset
    // writes it — but its intensity channel is 0, so the fixture
    // itself goes dark in hardware.
    expect(pIntensity()).toBe(0)
    // The palette preset is still on, just unlit.
    expect(s().activePresetIds).toContain('red')
  })

  it('B1: Live Full On pad alone brings up the default blue', () => {
    seedShow()
    renderInRoot(<App />)
    const s = () => useShowStore.getState()
    act(() => { s().setLiveValue('pad-full', 255) })
    expect(qBlue()).toBe(255)
    expect(qRed()).toBe(0)
    expect(pBlue()).toBe(255)
    expect(pIntensity()).toBe(255)
  })

  it('B1b: palette Full On preset alone brings up the default blue', () => {
    seedShow()
    renderInRoot(<App />)
    const s = () => useShowStore.getState()
    act(() => { s().togglePreset('full') })
    // The blue comes from the base look, which fades in over the
    // global Default fade (Jake, 24 Nov 2026).
    finishFade()
    expect(qBlue()).toBe(255)
    expect(qRed()).toBe(0)
    expect(pBlue()).toBe(255)
    expect(pIntensity()).toBe(255)
  })

  it('R1: palette Red + Full On (no Live) still gives red at full', () => {
    seedShow()
    renderInRoot(<App />)
    const s = () => useShowStore.getState()
    act(() => { s().togglePreset('red') })
    act(() => { s().togglePreset('full') })
    expect(qRed()).toBe(255)
    expect(qBlue()).toBe(0)
    expect(pRed()).toBe(255)
    expect(pBlue()).toBe(0)
  })

  it('R2: Live pads alone still combine to red at full', () => {
    seedShow()
    renderInRoot(<App />)
    const s = () => useShowStore.getState()
    act(() => { s().setLiveValue('pad-red', 255) })
    act(() => { s().setLiveValue('pad-full', 255) })
    expect(qRed()).toBe(255)
    expect(pRed()).toBe(255)
  })

  it('R3: a Live Red pad alone stays dark', () => {
    seedShow()
    renderInRoot(<App />)
    const s = () => useShowStore.getState()
    act(() => { s().setLiveValue('pad-red', 255) })
    expect(qRed()).toBe(0)
    expect(qBlue()).toBe(0)
  })
})
