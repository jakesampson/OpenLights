// Edit Ad Hoc Properties from the plain Live view (Jake, 27 Nov 2026):
// "I am clicking a cue in live mode, without edit enabled, you test it
// for yourself the adhoc properties only opens if edit mode is on."
// The guide's first route (ch.11, p.201) is "Control-click a button in
// the Live view … and choose Edit Ad Hoc Properties", with no edit-mode
// qualifier — but the properties popup was gated on liveEditing, so the
// item silently did nothing in Live mode. A cue button edits its cue's
// ad-hoc layer (Design tab, "Ad hoc ·" pill); a standalone button opens
// its properties popup over the Live canvas.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore, activeCueId } from '../src/renderer/src/stores/showStore'
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

function seedShow() {
  const state = useShowStore.getState()
  state.setShow(migrateShow({
    fixtures: FIXTURES,
    cues: [FULL_ON],
    presets: [{ id: 'preset-fullon', name: 'Full On', category: 'intensity', fixtureValues: {} }],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'pad-full', name: 'Full On', type: 'push', presetIds: ['preset-fullon'], x: 20, y: 20 },
      { id: 'pad-cue', name: 'Full On cue', type: 'push', cueId: 'cue-fullon', presetIds: [], x: 160, y: 20 },
    ] }],
  } as unknown as ShowDef))
  act(() => { useShowStore.setState({ activeLivePageId: 'page1' }) })
}

function switchToLive() {
  const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes('Live'))
  expect(segment).toBeTruthy()
  act(() => { segment!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
}

function selectButton(id: string) {
  act(() => { useShowStore.getState().setPageObjectSelection([{ type: 'cue', id }]) })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  const state = useShowStore.getState()
  state.setShow(migrateShow({ fixtures: [], cues: [] } as unknown as ShowDef))
  state.exitSetupWizard()
  state.setWelcomeOpen(false)
  state.setNewProjectDialogOpen(false)
  state.setNewProjectTemplate(null)
  window.localStorage.clear()
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

describe('Edit Ad Hoc Properties in Live mode', () => {
  it('opens the properties popup for a standalone button without edit mode', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    expect(useShowStore.getState().liveEditing).toBe(false)
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
    selectButton('pad-full')
    act(() => { window.dispatchEvent(new Event('openlights-open-live-properties')) })
    const dialog = container!.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    // The floating inspector is titled after the control (LightKey,
    // Jake 27 Nov 2026) — "Full On inspector", not "cue properties".
    expect(dialog!.getAttribute('aria-label')).toBe('Full On inspector')
    expect(dialog!.textContent).toContain('Ad hoc properties')
  })

  it('a cue button starts the cue ad-hoc session and switches to Design', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    expect(useShowStore.getState().liveEditing).toBe(false)
    selectButton('pad-cue')
    act(() => {
      window.dispatchEvent(new CustomEvent('openlights-menu-command', { detail: { command: 'editAdHocProperties' } }))
    })
    expect(useShowStore.getState().editingCueAdHocId).toBe('cue-fullon')
    expect(activeCueId(useShowStore.getState())).toBe('cue-fullon')
    expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeNull()
    expect(container!.textContent).toContain('Ad hoc · Full On')
  })

  it('the Live menu item reads "Return to Live" in edit mode and "Edit Live View" when off', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const canvas = container!.querySelector('[aria-label="Live page canvas"]')!
    act(() => { canvas.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })) })
    const menu = container!.querySelector('[role="menu"][aria-label="Live edit actions"]')
    expect(menu).toBeTruthy()
    const item = [...menu!.querySelectorAll('button')].find((b) => b.textContent?.includes('Live View') || b.textContent?.includes('Return to Live'))!
    expect(item).toBeTruthy()
    expect(item.textContent).toBe('✓ Return to Live')
    act(() => { item.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().liveEditing).toBe(false)
    // The menu stays mounted when edit mode flips off without a
    // pointerdown (e.g. Done via keyboard) — the label flips back.
    act(() => { useShowStore.getState().setLiveEditing(true) })
    act(() => { canvas.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })) })
    act(() => { useShowStore.getState().setLiveEditing(false) })
    const menu2 = container!.querySelector('[role="menu"][aria-label="Live edit actions"]')
    const item2 = [...menu2!.querySelectorAll('button')].find((b) => b.textContent?.includes('Live View') || b.textContent?.includes('Return to Live'))!
    expect(item2.textContent).toBe('Edit Live View')
    act(() => { item2.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().liveEditing).toBe(true)
  })
})
