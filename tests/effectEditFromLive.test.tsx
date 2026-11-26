// Jake, 27 Nov 2026 — clicking Edit on a palette effect row from the
// Live tab did nothing: the effect editor lives in the Design panel
// only, so the session opened with nowhere to render. Edit from Live
// now switches to Design with the editor open (direct setTab, not
// goTab — goTab exits the editor, which would cancel the edit).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'
import { initNdiSession, resetNdiSession } from '../src/renderer/src/lib/ndiSession'
import { resetAmbienceState } from '../src/renderer/src/lib/ndiAmbience'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  onAppQuitting: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setChannels: () => {},
  getChannels: () => Promise.resolve([]),
  ndiVersion: () => Promise.resolve({ available: true, version: 'NDI SDK 6.3.2.0' }),
  ndiListSources: () => Promise.resolve({ sources: [] }),
  ndiStart: () => Promise.resolve({ success: true }),
  ndiStop: () => Promise.resolve({ success: true }),
  onNdiRegions: () => () => {},
  onNdiStatus: () => () => {},
  onNdiReceiveStatus: () => () => {},
  onNdiFrame: () => () => {}
}
vi.stubGlobal('requestAnimationFrame', () => 1)
vi.stubGlobal('cancelAnimationFrame', vi.fn())

const flushPromises = async () => { await act(async () => {}) }

let container: HTMLElement | null = null
let root: Root | null = null

function seedShow() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [
      { id: 'pb1', name: 'PB1', type: 'par', profileId: 'pan-4x1x30-17ch', channelStart: 1, channels: 17 },
      { id: 'q1', name: 'Q1', type: 'par', profileId: 'simger-q12bt-rgba-4ch', channelStart: 18, channels: 4 },
    ],
    cues: [],
    fixtureGroups: [],
    presets: [],
    stageObjects: [],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [] }],
    effects: [{
      id: 'kitt', name: 'K.I.T.T.', fixtureIds: ['pb1', 'q1'], attribute: 'color',
      waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 128,
      phaseSpread: 0, enabled: true, kind: 'pattern', pattern: 'scanner',
      samples: [{ id: 'bg', color: '#000000' }, { id: 'fg', color: '#ff0000' }],
      durationMs: 2000, timingMode: 'fixed',
    }],
  } as unknown as ShowDef))
  act(() => {
    useShowStore.setState({ activeLivePageId: 'page1', selectedFixtureIds: [] })
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
const click = (target: Element) => {
  act(() => { target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
}
function switchTab(name: 'Design' | 'Live') {
  const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes(name))
  expect(segment).toBeTruthy()
  click(segment!)
}

describe('editing an effect from the Live tab (Jake, 27 Nov 2026)', () => {
  beforeEach(async () => {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    resetAmbienceState()
    resetNdiSession()
    const state = useShowStore.getState()
    state.setShow(migrateShow({ fixtures: [], cues: [] } as unknown as ShowDef))
    state.exitSetupWizard()
    state.setWelcomeOpen(false)
    state.setNewProjectDialogOpen(false)
    state.setNewProjectTemplate(null)
    window.localStorage.clear()
    initNdiSession()
    seedShow()
    renderApp()
    await flushPromises()
  })

  afterEach(() => {
    act(() => { root?.unmount() })
    container?.remove()
    container = null
    root = null
  })

  it('opens the effect editor on the Design tab', () => {
    switchTab('Live')
    expect(container!.querySelector('.live-page-shell')).toBeTruthy()
    expect(container!.querySelector('[data-testid="effect-editor"]')).toBeNull()
    // The yellow Edit button on a palette effect row (and double-click).
    act(() => { s().startEditingLiveEffect('kitt') })
    expect(container!.querySelector('.live-page-shell')).toBeNull()
    expect(container!.querySelector('.playback-shell')).toBeTruthy()
    expect(container!.querySelector('[data-testid="effect-editor"]')).toBeTruthy()
    expect(container!.querySelector('[aria-label="Effect fixtures"]')).toBeTruthy()
  })
})
