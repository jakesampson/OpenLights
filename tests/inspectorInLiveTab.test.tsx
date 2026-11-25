// Jake, 24 Nov 2026 — the Inspector disappeared after clicking NDI
// Ambience in edit mode: in the Live tab, with Preview edit mode on and
// a fixture selected, the side panel stayed the Preset Palette instead of
// becoming the Inspector (fixture properties). Root cause: the side
// panel only became the Inspector when `tab === 'Design' &&
// previewEditing`, but since the 20 Nov split the header Edit button
// toggles Preview editing in the Live tab too — and previewEditing
// deliberately survives leaving Design. The NDI click itself only opens
// the tool panel; it never touched the tab, edit mode or selection.
// The fix: the Inspector follows Preview edit mode in either tab.
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

const FIXTURES = [
  { id: 'p1', name: 'P1', type: 'rgba-4ch', channelStart: 1, channels: 4 },
  { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 20, channels: 4 }
]

function seedShow() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: FIXTURES,
    cues: [],
    fixtureGroups: [],
    presets: [],
    stageObjects: [],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [] }]
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
function headerEditButton() {
  return container!.querySelector('.header-edit-button') as HTMLElement | null
}
function sidePanel() {
  return container!.querySelector('.side-panel') as HTMLElement | null
}
function selectFixture(id: string) {
  act(() => { s().selectFixtures([id]) })
}

describe('Inspector in edit mode, either tab (Jake, 24 Nov 2026)', () => {
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

  it('shows the Inspector in the Live tab when edit mode is on and a fixture is selected', () => {
    switchTab('Live')
    expect(headerEditButton()?.textContent).toBe('Edit')
    click(headerEditButton()!)
    expect(headerEditButton()?.textContent).toBe('Done')
    expect(s().previewEditing).toBe(true)
    // Before any selection the Inspector is there with its hint…
    expect(sidePanel()?.getAttribute('aria-label')).toBe('Preview inspector')
    // …and once a fixture is selected its properties show.
    selectFixture('p1')
    expect(sidePanel()?.textContent).toContain('Beam Direction…')
    expect(sidePanel()?.textContent).not.toContain('Preset Palette')
  })

  it('shows the palette again in the Live tab once edit mode is off', () => {
    switchTab('Live')
    click(headerEditButton()!)
    selectFixture('p1')
    expect(sidePanel()?.getAttribute('aria-label')).toBe('Preview inspector')
    click(headerEditButton()!)
    expect(headerEditButton()?.textContent).toBe('Edit')
    expect(sidePanel()?.getAttribute('aria-label')).toBe('Preset palette sidebar')
    expect(sidePanel()?.textContent).toContain('Preset Palette')
    expect(container!.querySelector('[data-palette-row="ndi-ambience"]')).toBeTruthy()
  })

  it('keeps the Inspector in the Design tab too (existing behaviour)', () => {
    // Starts on Design.
    click(headerEditButton()!)
    selectFixture('p1')
    expect(sidePanel()?.getAttribute('aria-label')).toBe('Preview inspector')
    expect(sidePanel()?.textContent).toContain('Beam Direction…')
  })

  it("Jake's sequence: NDI click in the Live tab does not lose the Inspector", async () => {
    switchTab('Live')
    // Edit mode off, so the palette (and its NDI row) is showing —
    // exactly as in Jake's screenshot.
    expect(container!.querySelector('[data-palette-row="ndi-ambience"]')).toBeTruthy()
    const row = container!.querySelector('[data-palette-row="ndi-ambience"] [role="treeitem"]') as HTMLElement
    expect(row).toBeTruthy()
    click(row)
    await flushPromises()
    // The NDI panel opened…
    const dialog = container!.querySelector('[role="dialog"][aria-label="NDI Ambience"]') as HTMLElement | null
    expect(dialog).toBeTruthy()
    // …and closing it leaves the tab, edit mode and selection alone.
    const close = Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent === 'Close')!
    click(close)
    await flushPromises()
    expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
    expect(s().previewEditing).toBe(false)
    // Now edit mode on + a fixture selected → the Inspector is back.
    click(headerEditButton()!)
    selectFixture('p1')
    expect(sidePanel()?.getAttribute('aria-label')).toBe('Preview inspector')
    expect(sidePanel()?.textContent).toContain('Beam Direction…')
  })
})
