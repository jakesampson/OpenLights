// Jake, 27 Nov 2026 — the four main panels resize by dragging the
// dividers between them. Whole-App checks on the rendered workspace
// (jsdom has no layout, so sizes are asserted from the element's inline
// style, and the real-app probe measures pixels).
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { PanelDivider } from '../src/renderer/src/components/PanelDivider'
import { PANEL_SIZES_KEY } from '../src/renderer/src/lib/panelSizes'
import { DMXEngine } from '../src/shared/dmx'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const engine = new DMXEngine()

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setChannels: (values: Record<number, number>) => engine.setChannels(values),
  blackout: () => Promise.resolve(),
  openLiveWindow: () => Promise.resolve(),
  toggleFullscreen: () => Promise.resolve(),
  setTitleBarOverlay: () => Promise.resolve(),
  saveOflCustomProfile: () => Promise.resolve({ success: false, profiles: [] })
}

const minimalShow = (): ShowDef => migrateShow({
  id: 'panel-probe-show',
  name: 'Panel Probe',
  fixtures: [],
  presets: [],
  cues: [],
  livePages: [{ id: 'page-1', name: 'Page 1', controls: [] }]
})

const pointer = (target: Element, type: string, x: number, y: number) => {
  act(() => { target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })) })
}
const key = (target: Element, type: string, k: string, shift = false) => {
  act(() => { target.dispatchEvent(new window.KeyboardEvent(type, { bubbles: true, cancelable: true, key: k, shiftKey: shift })) })
}

let root: Root | null = null
let host: HTMLDivElement | null = null
const renderApp = () => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(<App />) })
  return host
}

describe('PanelDivider', () => {
  it('reports incremental drag deltas and ends on pointerup', () => {
    const onDrag = vi.fn()
    const onDragEnd = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(<PanelDivider orientation="vertical" label="Test" onDrag={onDrag} onDragEnd={onDragEnd} />) })
    const divider = host.querySelector('[role="separator"]')!
    expect(divider.getAttribute('aria-orientation')).toBe('vertical')
    expect(divider.getAttribute('aria-label')).toBe('Test')
    pointer(divider, 'pointerdown', 500, 100)
    pointer(divider, 'pointermove', 480, 100)
    pointer(divider, 'pointermove', 450, 100)
    pointer(divider, 'pointerup', 450, 100)
    // Incremental: -20 then -30, not -50 twice.
    expect(onDrag.mock.calls).toEqual([[-20], [-30]])
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    // A move after pointerup reports nothing.
    pointer(divider, 'pointermove', 400, 100)
    expect(onDrag).toHaveBeenCalledTimes(2)
    act(() => { root.unmount() })
    host.remove()
  })

  it('nudges with arrow keys, Shift for coarse steps', () => {
    const onDrag = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(<PanelDivider orientation="horizontal" label="Test" onDrag={onDrag} />) })
    const divider = host.querySelector('[role="separator"]')!
    key(divider, 'keydown', 'ArrowUp')
    key(divider, 'keydown', 'ArrowDown', true)
    key(divider, 'keydown', 'ArrowLeft')
    expect(onDrag.mock.calls).toEqual([[-10], [50]])
    act(() => { root.unmount() })
    host.remove()
  })
})

describe('panel resizing in the app', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    localStorage.clear()
    const show = minimalShow()
    act(() => {
      useShowStore.getState().setShow(show)
      useShowStore.setState({
        presets: [],
        activePresetIds: [],
        activeLiveValues: {},
        liveActivationOrder: {},
        liveActivationCounter: 0,
        manualOverrides: {},
        activeCueId: null,
        activeLivePageId: 'page-1'
      })
      useShowStore.getState().setWelcomeOpen(false)
      useShowStore.getState().setNewProjectDialogOpen(false)
    })
  })
  afterEach(() => {
    act(() => { root?.unmount() })
    host?.remove()
    root = null
    host = null
    localStorage.clear()
  })

  it('renders three dividers with visible grips at the default sizes', () => {
    const host = renderApp()
    const dividers = [...host.querySelectorAll('[role="separator"]')]
    expect(dividers.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Resize preset palette',
      'Resize Live and Design panel',
      'Resize shortcuts panel'
    ])
    for (const divider of dividers) expect(divider.querySelector('.panel-divider-grip')).not.toBeNull()
    const mainGrid = host.querySelector('.main-grid') as HTMLElement
    expect(mainGrid.style.gridTemplateColumns).toBe('minmax(0px, 1fr) 6px 260px')
    const bottomGrid = host.querySelector('.bottom-grid') as HTMLElement
    expect(bottomGrid.style.gridTemplateColumns).toBe('minmax(0px, 1fr) 6px 260px')
    expect(bottomGrid.style.height).toBe('294px')
  })

  it('dragging the palette divider resizes the palette and persists it', () => {
    const host = renderApp()
    const divider = host.querySelector('[aria-label="Resize preset palette"]')!
    pointer(divider, 'pointerdown', 1000, 200)
    pointer(divider, 'pointermove', 940, 200)
    pointer(divider, 'pointerup', 940, 200)
    const mainGrid = host.querySelector('.main-grid') as HTMLElement
    expect(mainGrid.style.gridTemplateColumns).toBe('minmax(0px, 1fr) 6px 320px')
    expect(JSON.parse(localStorage.getItem(PANEL_SIZES_KEY)!).paletteWidth).toBe(320)
  })

  it('dragging the horizontal divider resizes the bottom panel', () => {
    const host = renderApp()
    const divider = host.querySelector('[aria-label="Resize Live and Design panel"]')!
    pointer(divider, 'pointerdown', 500, 700)
    pointer(divider, 'pointermove', 500, 650)
    pointer(divider, 'pointerup', 500, 650)
    const bottomGrid = host.querySelector('.bottom-grid') as HTMLElement
    expect(bottomGrid.style.height).toBe('344px')
  })

  it('sizes clamp at the minimum instead of collapsing a panel', () => {
    const host = renderApp()
    const divider = host.querySelector('[aria-label="Resize preset palette"]')!
    pointer(divider, 'pointerdown', 1000, 200)
    pointer(divider, 'pointermove', 2000, 200)
    pointer(divider, 'pointerup', 2000, 200)
    const mainGrid = host.querySelector('.main-grid') as HTMLElement
    expect(mainGrid.style.gridTemplateColumns).toBe('minmax(0px, 1fr) 6px 200px')
  })

  it('restores persisted sizes on load', () => {
    localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify({ paletteWidth: 320, shortcutsWidth: 220, bottomHeight: 400 }))
    const host = renderApp()
    const mainGrid = host.querySelector('.main-grid') as HTMLElement
    expect(mainGrid.style.gridTemplateColumns).toBe('minmax(0px, 1fr) 6px 320px')
    const bottomGrid = host.querySelector('.bottom-grid') as HTMLElement
    expect(bottomGrid.style.gridTemplateColumns).toBe('minmax(0px, 1fr) 6px 220px')
    expect(bottomGrid.style.height).toBe('400px')
  })
})
