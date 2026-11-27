// Cue-list transport on the canvas widget (Jake, 27 Nov 2026 —
// "Make it LightKey's way — cuelist as a widget on the canvas, no fixed
// bar"): the fixed CueListsSection is gone from both the main Live tab
// and the separate Live window. The cuelist lives ONLY as a placed
// widget on the Live canvas, LightKey's way, carrying the column
// headers (Name | Hold Time | Fade Time | Xfade), its steps (✓, ▶,
// Hold, Fade + −), the transport (Go / Stop, Pause, Next / Previous)
// and the vertical Xfade fader. Step clicks follow the guide (ch.11,
// p.219): single-click selects, double-click activates; the old step
// toggle (clicking the active step turns its cue off again, Jake 26
// Nov 2026 — Option 2) is gone — Stop deactivates instead.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { LiveTab } from '../src/renderer/src/components/LiveTab'
import { activeCueId, useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  onAppQuitting: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setChannels: vi.fn(),
  getChannels: () => Promise.resolve([]),
}
vi.stubGlobal('requestAnimationFrame', () => 1)
vi.stubGlobal('cancelAnimationFrame', vi.fn())

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

const FIXTURES = [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }]
const FULL_ON = { id: 'cue-fullon', name: 'Full On', fixtureValues: { d1: { intensity: 255 } }, fadeMs: 500 }
const WASH_BLUE = { id: 'cue-blue', name: 'Wash Blue', fixtureValues: { d1: { intensity: 128 } }, fadeMs: 500 }

function seedShow(cueLists: unknown[] = [{ id: 'list1', name: 'Sunday Set', steps: [{ id: 's1', cue: FULL_ON, fadeMs: 500, holdMs: 0 }, { id: 's2', cue: WASH_BLUE, fadeMs: 500, holdMs: 0 }] }]) {
  const state = useShowStore.getState()
  state.setShow(migrateShow({
    fixtures: FIXTURES,
    cueLists,
    presets: [],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [], cueListWidgets: cueLists.length ? [{ id: 'w1', cueListId: 'list1', x: 20, y: 20, width: 240, height: 240 }] : [] }],
  } as unknown as ShowDef))
  act(() => { useShowStore.setState({ activeLivePageId: 'page1' }) })
}

function switchToLive() {
  const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes('Live'))
  expect(segment).toBeTruthy()
  act(() => { segment!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
}

function widgetEl() {
  const widget = [...container!.querySelectorAll('div')].find((el) => el.className.includes('absolute') && el.textContent?.includes('Sunday Set'))
  expect(widget, 'cuelist widget on the canvas').toBeTruthy()
  return widget!
}

function clickWidgetButton(label: string) {
  const widget = widgetEl()
  const matches = [...widget.querySelectorAll('button')].filter((b) => b.textContent?.includes(label) || b.getAttribute('aria-label')?.includes(label))
  expect(matches, `widget button containing "${label}"`).toHaveLength(1)
  act(() => { matches[0]!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function stepRow(name: string) {
  const widget = widgetEl()
  const row = [...widget.querySelectorAll('div')].find((el) => el.getAttribute('aria-label') === name)
  expect(row, `step row "${name}"`).toBeTruthy()
  return row!
}

function clickStep(name: string) {
  act(() => { stepRow(name).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function doubleClickStep(name: string) {
  act(() => { stepRow(name).dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })) })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  const state = useShowStore.getState()
  state.setShow(migrateShow({ fixtures: [] } as unknown as ShowDef))
  state.exitSetupWizard()
  state.setWelcomeOpen(false)
  state.setNewProjectDialogOpen(false)
  state.setNewProjectTemplate(null)
  window.localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

describe('cue-list transport on the canvas widget', () => {
  it('widget: shows the LightKey columns, steps and Xfade, and Go steps onto Full On', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    const widget = widgetEl()
    expect(widget.textContent).toContain('Sunday Set')
    for (const header of ['Name', 'Hold Time', 'Fade Time', 'Xfade']) expect(widget.textContent).toContain(header)
    expect(widget.textContent).toContain('Full On')
    expect(widget.textContent).toContain('Wash Blue')
    expect(widget.textContent).toContain('—')
    expect(widget.textContent).toContain('00:00.5')
    expect(widget.querySelector('input[aria-label="Xfade Sunday Set"]')).toBeTruthy()
    expect(widget.querySelector('input[aria-label="Include Full On in playback"]')).toBeTruthy()
    expect(widget.textContent).not.toContain('Current:')
    expect(widget.textContent).not.toContain('Next:')
    clickWidgetButton('Go')
    expect(activeCueId(useShowStore.getState())).toBe('cue-fullon')
    expect(useShowStore.getState().cuePlaying).toBe(true)
    expect(stepRow('Full On').textContent).toContain('▶')
    expect(stepRow('Wash Blue').textContent).not.toContain('▶')
  })

  it('widget: Stop deactivates the playing cue and Go resumes from the same step', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    clickWidgetButton('Go')
    expect(activeCueId(useShowStore.getState())).toBe('cue-fullon')
    clickWidgetButton('Stop')
    expect(activeCueId(useShowStore.getState())).toBeNull()
    expect(useShowStore.getState().cuePlaying).toBe(false)
    clickWidgetButton('Go')
    expect(activeCueId(useShowStore.getState())).toBe('cue-blue')
  })

  it('widget: a step single-click selects it and a double-click jumps to its cue (guide p.219)', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    clickStep('Wash Blue')
    expect(activeCueId(useShowStore.getState())).toBeNull()
    expect(stepRow('Wash Blue').className).toContain('bg-panel')
    expect(stepRow('Full On').className).not.toContain('bg-panel')
    doubleClickStep('Wash Blue')
    expect(activeCueId(useShowStore.getState())).toBe('cue-blue')
    expect(useShowStore.getState().cuePlaying).toBe(true)
    // Clicking the active step again does NOT turn it off any more —
    // Stop deactivates (the old step toggle is gone).
    clickStep('Wash Blue')
    expect(activeCueId(useShowStore.getState())).toBe('cue-blue')
  })

  it('widget: with no cue lists there is no fixed transport bar anywhere', () => {
    seedShow([])
    renderInRoot(<App />)
    switchToLive()
    expect(container!.querySelector('.cue-transport-compact')).toBeNull()
    expect(container!.textContent).not.toContain('Create or select cue lists from Live Edit.')
    expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
  })

  it('main window: with two lists the widget shows its own list and no fixed bar exists', () => {
    seedShow([
      { id: 'list1', name: 'Sunday Set', steps: [{ id: 's1', cue: FULL_ON, fadeMs: 500, holdMs: 0 }, { id: 's2', cue: WASH_BLUE, fadeMs: 500, holdMs: 0 }] },
      { id: 'list2', name: 'Evening Set', steps: [{ id: 's3', cue: WASH_BLUE, fadeMs: 1000, holdMs: 0 }] },
    ])
    renderInRoot(<App />)
    switchToLive()
    expect(container!.querySelector('.cue-transport-compact')).toBeNull()
    const widget = widgetEl()
    expect(widget.textContent).toContain('Sunday Set')
    expect(widget.textContent).not.toContain('Evening Set')
    // The widget sits on the canvas, not below it.
    const canvas = container!.querySelector('[aria-label="Live page canvas"]')
    expect(canvas!.contains(widget)).toBe(true)
    clickWidgetButton('Go')
    expect(activeCueId(useShowStore.getState())).toBe('cue-fullon')
    expect(useShowStore.getState().activeCueListId).toBe('list1')
  })

  it('separate Live window: the widget carries the transport there too', () => {
    seedShow()
    renderInRoot(<LiveTab />)
    expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
    expect(container!.querySelector('.cue-transport-compact')).toBeNull()
    clickWidgetButton('Go')
    expect(activeCueId(useShowStore.getState())).toBe('cue-fullon')
    expect(stepRow('Full On').textContent).toContain('▶')
  })
})
