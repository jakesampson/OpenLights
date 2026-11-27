// Cue-list transport in the main Live tab (Jake, 27 Nov 2026 —
// "nothing is visible to see that or turn it off"): the main window
// used to show no trace of the active cuelist, so a Go (context menu,
// Space) could step onto a cue like "Full On" with nothing visible to
// explain it or stop it. The compact transport below the canvas shows
// the list, the current / next cue, and Stop / Back / Go; the separate
// Live window keeps the full section.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { CueListsSection } from '../src/renderer/src/components/CueListsSection'
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

const FIXTURES = [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }]
const FULL_ON = { id: 'cue-fullon', name: 'Full On', fixtureValues: { d1: { intensity: 255 } }, fadeMs: 500 }
const WASH_BLUE = { id: 'cue-blue', name: 'Wash Blue', fixtureValues: { d1: { intensity: 128 } }, fadeMs: 500 }

function seedShow(cueLists: unknown[] = [{ id: 'list1', name: 'Sunday Set', steps: [{ id: 's1', cueId: 'cue-fullon', fadeMs: 500, holdMs: 0 }, { id: 's2', cueId: 'cue-blue', fadeMs: 500, holdMs: 0 }] }]) {
  const state = useShowStore.getState()
  state.setShow(migrateShow({
    fixtures: FIXTURES,
    cues: [FULL_ON, WASH_BLUE],
    cueLists,
    presets: [],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [] }],
  } as unknown as ShowDef))
  act(() => { useShowStore.setState({ activeLivePageId: 'page1' }) })
}

function switchToLive() {
  const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes('Live'))
  expect(segment).toBeTruthy()
  act(() => { segment!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
}

function clickButton(label: string) {
  const matches = [...(container?.querySelectorAll('button') ?? [])].filter((b) => b.textContent?.includes(label))
  expect(matches, `button containing "${label}"`).toHaveLength(1)
  act(() => { matches[0]!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
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

describe('cue-list transport', () => {
  it('compact: shows the list, current / next cue, and Go steps onto Full On', () => {
    seedShow()
    renderInRoot(<CueListsSection variant="compact" />)
    expect(container!.textContent).toContain('Sunday Set')
    expect(container!.textContent).toContain('Press Go to begin')
    expect(container!.textContent).toContain('Current: Not started')
    expect(container!.textContent).toContain('Next: Full On')
    clickButton('Go')
    expect(useShowStore.getState().activeCueId).toBe('cue-fullon')
    expect(useShowStore.getState().cuePlaying).toBe(true)
    expect(container!.textContent).toContain('Cue 1 of 2 · running')
    expect(container!.textContent).toContain('Current: Full On')
    expect(container!.textContent).toContain('Next: Wash Blue')
  })

  it('compact: Stop deactivates the playing cue and Go resumes from the same step', () => {
    seedShow()
    renderInRoot(<CueListsSection variant="compact" />)
    clickButton('Go')
    expect(useShowStore.getState().activeCueId).toBe('cue-fullon')
    clickButton('Stop')
    expect(useShowStore.getState().activeCueId).toBeNull()
    expect(useShowStore.getState().cuePlaying).toBe(false)
    expect(container!.textContent).toContain('Cue 1 of 2 · stopped')
    clickButton('Go')
    expect(useShowStore.getState().activeCueId).toBe('cue-blue')
  })

  it('compact: the steps and Xfade sit behind a disclosure, and a step click jumps to its cue', () => {
    seedShow()
    renderInRoot(<CueListsSection variant="compact" />)
    expect(container!.textContent).not.toContain('Cue 2')
    clickButton('Show steps ▸')
    expect(container!.textContent).toContain('Cue 2')
    clickButton('Wash Blue')
    expect(useShowStore.getState().activeCueId).toBe('cue-blue')
  })

  it('compact: with no cue lists it says so instead of showing nothing', () => {
    seedShow([])
    renderInRoot(<CueListsSection variant="compact" />)
    expect(container!.textContent).toContain('Create or select cue lists from Live Edit.')
  })

  it('full: shows Current / Next boxes, Xfade and every step (separate Live window)', () => {
    seedShow()
    renderInRoot(<CueListsSection variant="full" />)
    expect(container!.textContent).toContain('Current')
    expect(container!.textContent).toContain('Next')
    expect(container!.textContent).toContain('Cue 2')
    clickButton('Go')
    expect(container!.textContent).toContain('Cue 1 of 2 · running')
  })

  it('compact: with two lists it shows one slim bar for the active list, with a picker to switch', () => {
    seedShow([
      { id: 'list1', name: 'Sunday Set', steps: [{ id: 's1', cueId: 'cue-fullon', fadeMs: 500, holdMs: 0 }, { id: 's2', cueId: 'cue-blue', fadeMs: 500, holdMs: 0 }] },
      { id: 'list2', name: 'Full', steps: [{ id: 's3', cueId: 'cue-blue', fadeMs: 1000, holdMs: 0 }] },
    ])
    renderInRoot(<CueListsSection variant="compact" />)
    // The active (first) list only — two per-list boxes used to squeeze
    // the Live canvas to 2px and hide every button (Jake, 27 Nov 2026).
    expect(container!.querySelectorAll('select[aria-label="Cue list"]')).toHaveLength(1)
    const picker = container!.querySelector('select[aria-label="Cue list"]') as HTMLSelectElement
    expect(picker.value).toBe('list1')
    expect(container!.textContent).toContain('Sunday Set')
    act(() => {
      picker.value = 'list2'
      picker.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    expect(container!.textContent).toContain('Full')
    expect(container!.textContent).toContain('Next: Wash Blue · 1s fade')
    // Go on the displayed (non-active) list starts that list.
    clickButton('Go')
    expect(useShowStore.getState().activeCueListId).toBe('list2')
    expect(useShowStore.getState().activeCueId).toBe('cue-blue')
  })

  it('compact: the bar starts clear of the Master fader (102px inset)', () => {
    seedShow()
    renderInRoot(<CueListsSection variant="compact" />)
    // The fader column ends at 106px from the panel edge and the body
    // adds 6px of padding, so the bar needs 102px to clear it by 2px.
    const section = container!.querySelector('section')
    expect(section).toBeTruthy()
    expect(window.getComputedStyle(section!).paddingLeft).toBe('102px')
  })

  it('main window: the compact transport sits in the Live tab below the canvas', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    const body = container!.querySelector('.live-page-shell')
    expect(body).toBeTruthy()
    expect(body!.textContent).toContain('Sunday Set')
    expect(body!.textContent).toContain('Next: Full On')
    // The canvas is still there, above the transport.
    const canvas = container!.querySelector('[aria-label="Live page canvas"]')
    expect(canvas).toBeTruthy()
    expect(body!.contains(canvas)).toBe(true)
    // DOM order: the canvas wrapper comes before the transport section.
    const transport = [...container!.querySelectorAll('.live-page-shell section')].find((s) => s.textContent?.includes('Sunday Set'))
    expect(transport).toBeTruthy()
    expect(canvas!.compareDocumentPosition(transport!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    clickButton('Go')
    expect(useShowStore.getState().activeCueId).toBe('cue-fullon')
  })
})
