// A Live control without presetIds (old or hand-edited show) must not
// blank the app: LiveWorkspace read control.presetIds unguarded in the
// contents builder, the button label and the inspector contents list,
// so switching to the Live tab threw "control.presetIds is not iterable"
// and — with no error boundary anywhere in the renderer — unmounted
// the whole app (Jake, 27 Nov 2026 — found while probing the Live-panel
// regression; his own show renders, so his controls have it, but any
// older show file can hit it).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore } from '../src/renderer/src/stores/showStore'
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

function seedShow() {
  useShowStore.getState().setShow(migrateShow({
    fixtures: [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }],
    presets: [{ id: 'p-blue', name: 'Blue', category: 'color', fixtureValues: { d1: { blue: 255, intensity: 255 } } }],
    cues: [{ id: 'cue-fullon', name: 'Full On', fixtureValues: { d1: { intensity: 255 } }, fadeMs: 500 }],
    cueLists: [],
    // NOTE: no presetIds key on the control at all — the old shape.
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'btn1', name: 'Old Button', type: 'push', cueId: 'cue-fullon', x: 20, y: 20 },
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
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

describe('live control without presetIds', () => {
  it('renders in the Live tab and opens Get Info without throwing', () => {
    seedShow()
    // Precondition: migration does NOT invent the missing field.
    expect((useShowStore.getState().show?.livePages?.[0].controls[0] as unknown as { presetIds?: string[] }).presetIds).toBeUndefined()
    renderInRoot(<App />)
    switchToLive()
    expect(container!.textContent).toContain('Old Button')
    // Edit mode + double-click opens the contents inspector (the
    // contents builder reads presetIds, and must not throw when it is
    // missing). The cue's ad-hoc values render as the contents row.
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const button = container!.querySelector('[data-project-id="btn1"]')
    expect(button).toBeTruthy()
    act(() => { button!.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })) })
    const dialog = container!.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog!.querySelector('[aria-label="Cue contents"]')).toBeTruthy()
    expect(dialog!.textContent).toContain('Ad hoc properties')
  })
})
