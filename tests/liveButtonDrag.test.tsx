// Jake, 22 Nov 2026 — Live buttons are LightKey-sized (120x40), take on
// their light colour (Red red, Green green, dimmer white), and drag by
// grabbing anywhere on the button: a press only arms the drag, movement
// past 4px starts it, and a plain click still fires. Whole-App checks on
// the rendered workspace (jsdom has no layout, so sizes are asserted from
// the element's inline style, and the real-app probe measures pixels).
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
const GREEN = { id: 'green', name: 'Green', fixtureValues: { p1: { green: 255 }, q1: { green: 255 } } }
const FULL = { id: 'full', name: 'Full On', fixtureValues: { p1: { intensity: 255 }, q1: { intensity: 255 } } }

function seedShow() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: FIXTURES,
    cues: [],
    fixtureGroups: [],
    presets: [RED, GREEN, FULL],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'pad-red', name: 'Red', type: 'push', presetIds: ['red'], x: 20, y: 20 },
      { id: 'pad-green', name: 'Green', type: 'push', presetIds: ['green'], x: 160, y: 20 },
      { id: 'pad-full', name: 'Full On', type: 'push', presetIds: ['full'], x: 300, y: 20 }
    ] }]
  } as unknown as ShowDef))
  act(() => {
    useShowStore.setState({
      presets: [RED, GREEN, FULL],
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
// q1: idx19 red, idx20 green, idx21 blue. p1: idx0 intensity, idx1 red, idx2 green.
const qRed = () => frame()[19]
const qBlue = () => frame()[21]

function switchToLive() {
  const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes('Live'))
  expect(segment).toBeTruthy()
  act(() => { segment!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
}

function setEditing(editing: boolean) {
  act(() => { s().setLiveEditing(editing) })
}

const outer = (id: string) => container!.querySelector(`[data-project-id="${id}"]`) as HTMLElement
const innerButton = (id: string) => outer(id).querySelector('button') as HTMLButtonElement

function pointer(type: string, target: Element, x: number, y: number) {
  act(() => { target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })) })
}
function click(target: Element) {
  act(() => { target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
}

describe('Live buttons: size, colour, drag-anywhere (whole App)', () => {
  it('renders at the LightKey size with no drag bar', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    setEditing(true)
    expect(container!.textContent).not.toContain('↕ drag')
    for (const id of ['pad-red', 'pad-green', 'pad-full']) {
      expect(outer(id).style.width).toBe('120px')
      expect(outer(id).style.height).toBe('40px')
    }
  })

  it('colours off buttons as a translucent tint: Red red, Green green, dimmer white', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    expect(outer('pad-red').style.backgroundColor).toBe('rgba(220, 0, 0, 0.28)')
    expect(outer('pad-green').style.backgroundColor).toBe('rgba(0, 220, 0, 0.28)')
    expect(outer('pad-full').style.backgroundColor).toBe('rgba(255, 255, 255, 0.28)')
    // The border carries the solid colour even while the fill is a tint.
    expect(outer('pad-red').style.borderColor).toBe('rgb(220, 0, 0)')
    expect(outer('pad-full').style.borderColor).toBe('rgb(255, 255, 255)')
    // Off, the text is white on every tint (the tint over the dark panel is dark).
    for (const id of ['pad-red', 'pad-green', 'pad-full']) {
      expect(outer(id).style.color).toBe('rgb(255, 255, 255)')
    }
  })

  it('lit buttons go solid, with readable text: red keeps white text, white takes dark text', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { s().setLiveValue('pad-red', 255) })
    expect(outer('pad-red').style.backgroundColor).toBe('rgb(220, 0, 0)')
    expect(outer('pad-red').style.color).toBe('rgb(255, 255, 255)')
    act(() => { s().setLiveValue('pad-full', 255) })
    expect(outer('pad-full').style.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(outer('pad-full').style.color).toBe('rgb(17, 17, 17)')
  })

  it('a click in Live mode fires the pad, and a second click toggles it off', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    click(innerButton('pad-red'))
    expect(s().activeLiveValues['pad-red']).toBe(255)
    // The Red preset carries no dimmer, so on a virtual-dimmer fixture it
    // lights nothing on its own — the dimmer pad lifts it (batch 6/7).
    expect(qRed()).toBe(0)
    click(innerButton('pad-full'))
    expect(qRed()).toBe(255)
    expect(qBlue()).toBe(0)
    click(innerButton('pad-red'))
    expect(s().activeLiveValues['pad-red']).toBe(0)
    // Red off, Full On still on: the dimmer alone raises the default blue.
    expect(qRed()).toBe(0)
    expect(qBlue()).toBe(255)
    click(innerButton('pad-full'))
    expect(s().activeLiveValues['pad-full']).toBe(0)
    expect(qBlue()).toBe(0)
  })

  it('dragging by the middle of the button in Edit mode moves it; the click after the drag does not fire', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    setEditing(true)
    const button = innerButton('pad-red')
    pointer('pointerdown', button, 100, 100)
    pointer('pointermove', button, 150, 100)
    pointer('pointermove', button, 150, 150)
    pointer('pointerup', button, 150, 150)
    // Moved 50 right and 50 down from (20, 20), snapped to the 10px grid.
    expect(s().show!.livePages![0].controls.find((c) => c.id === 'pad-red')).toMatchObject({ x: 70, y: 70 })
    expect(outer('pad-red').style.left).toBe('70px')
    // The click that follows the drag is swallowed — the pad did not fire.
    click(button)
    expect(s().activeLiveValues['pad-red'] ?? 0).toBe(0)
  })

  it('a press with only a 2px wobble is a click, not a drag: it fires and does not move', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    setEditing(true)
    const button = innerButton('pad-red')
    pointer('pointerdown', button, 100, 100)
    pointer('pointermove', button, 102, 100)
    pointer('pointerup', button, 102, 100)
    click(button)
    expect(s().activeLiveValues['pad-red']).toBe(255)
    expect(s().show!.livePages![0].controls.find((c) => c.id === 'pad-red')).toMatchObject({ x: 20, y: 20 })
  })

  it('dragging a pad in Live mode does nothing — drag is edit-only', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    const button = innerButton('pad-red')
    pointer('pointerdown', button, 100, 100)
    pointer('pointermove', button, 150, 150)
    pointer('pointerup', button, 150, 150)
    expect(s().show!.livePages![0].controls.find((c) => c.id === 'pad-red')).toMatchObject({ x: 20, y: 20 })
  })
})
