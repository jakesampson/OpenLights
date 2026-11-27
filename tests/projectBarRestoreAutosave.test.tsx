// @vitest-environment jsdom
// Startup restore (Jake, 27 Nov 2026, "Full On keeps activating with
// nothing selected"): with the startup mode set to restore the last
// looks, pressing or releasing a Live button must reach the file —
// otherwise the restore snapshot goes stale and a look the operator
// turned off comes back lit on the next open. Live-state changes
// never touch `show`, so the plain show-dirty autosave never fired
// for them; the autosave must also watch the live state.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { ProjectBar, startupSnapshotJson } from '../src/renderer/src/components/ProjectBar'
import { useShowStore, defaultShow } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const saveShow = vi.fn(async () => ({ success: true, path: '/tmp/Demo Show.json' }))

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

function setupShow(mode: 'none' | 'restore') {
  const state = useShowStore.getState()
  const show = structuredClone(state.show ?? defaultShow)
  show.name = 'Demo Show'
  show.presets = [{ id: 'preset-fullon', name: 'Full On', category: 'intensity', fixtureValues: {} }]
  show.livePages = [{ id: 'page', name: 'Page', controls: [{ id: 'btn-fullon', name: 'Full On', type: 'toggle', presetIds: ['preset-fullon'] }] }]
  show.startup = { mode, presetIds: [], liveValues: {}, pageId: 'page', cueId: null }
  state.setShow(show)
}

async function renderBar() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(<ProjectBar />) })
  await act(async () => {})
  return el
}

async function advance(ms: number) {
  await act(async () => { vi.advanceTimersByTime(ms) })
  await act(async () => {})
}

function savedStartups() {
  return saveShow.mock.calls.map((call) => (call[0] as { startup?: unknown }).startup)
}

beforeEach(() => {
  vi.useFakeTimers()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    listShows: async () => [],
    saveShow,
    saveShowAs: async () => ({ success: false, canceled: true }),
    loadShow: async () => ({ success: false, error: 'No path' }),
    openShow: async () => ({ canceled: true }),
    renameShow: async () => ({ success: false }),
    deleteShow: async () => ({ success: true }),
    duplicateShow: async () => ({ success: false }),
    closeWindow: vi.fn(),
    onAppQuitting: () => () => {},
    setChannels: () => {},
  }
  vi.clearAllMocks()
  const state = useShowStore.getState()
  state.unlockApp('')
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
  useShowStore.getState().unlockApp('')
  vi.useRealTimers()
})

describe('restore autosave', () => {
  it('saves the restore snapshot when a Live button is pressed and when it is released', async () => {
    setupShow('restore')
    await renderBar()
    expect(saveShow).not.toHaveBeenCalled()
    act(() => { useShowStore.getState().setLiveValue('btn-fullon', 255) })
    await advance(1600)
    expect(saveShow).toHaveBeenCalled()
    expect(savedStartups().at(-1)).toEqual({ mode: 'restore', presetIds: [], liveValues: { 'btn-fullon': 255 }, pageId: 'page', cueId: null })
    act(() => { useShowStore.getState().setLiveValue('btn-fullon', 0) })
    await advance(1600)
    expect(savedStartups().at(-1)).toEqual({ mode: 'restore', presetIds: [], liveValues: {}, pageId: 'page', cueId: null })
  })

  it('does not autosave live state when the startup mode is none', async () => {
    setupShow('none')
    await renderBar()
    act(() => { useShowStore.getState().setLiveValue('btn-fullon', 255) })
    await advance(1600)
    expect(saveShow).not.toHaveBeenCalled()
  })

  it('startupSnapshotJson canonicalises key order', () => {
    expect(startupSnapshotJson({ mode: 'restore', presetIds: ['b', 'a'], liveValues: { y: 255, x: 90 }, pageId: 'p', cueId: null }))
      .toBe(startupSnapshotJson({ mode: 'restore', presetIds: ['a', 'b'], liveValues: { x: 90, y: 255 }, pageId: 'p', cueId: null }))
  })
})
