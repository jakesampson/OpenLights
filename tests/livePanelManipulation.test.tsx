// Live panel manipulation (Jake, 27 Nov 2026 — LightKey cue editing,
// Video 2): a selected button in Edit Mode gets a yellow outline with
// eight circular resize handles; (+) opens a dashed button with a name
// input; sequence buttons print their speed; frame Previous/Next
// buttons step the frame; A toggles alignment guides off/on.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { buildShortcutsList } from '../src/renderer/src/lib/shortcuts'
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

function seedShow() {
  useShowStore.getState().setShow(migrateShow({
    fixtures: FIXTURES,
    presets: [{ id: 'p-red', name: 'Red', category: 'color', fixtureValues: { d1: { red: 255, intensity: 255 } } }],
    cues: [
      { id: 'cue-seq', name: 'Rainbow', sequenceIds: ['seq1'], presetIds: [], fixtureValues: {}, fadeMs: 500 },
      { id: 'cue-a', name: 'Song A', presetIds: ['p-red'], sequenceIds: [], fixtureValues: {}, fadeMs: 500 },
      { id: 'cue-b', name: 'Song B', presetIds: ['p-red'], sequenceIds: [], fixtureValues: {}, fadeMs: 500 },
    ],
    sequences: [{ id: 'seq1', name: 'Rainbow', order: 'forward', loop: false, timing: 'manual', stepsPerBeat: 1, timeScale: 0.5, steps: [{ id: 'step1', name: 'Step 1', fixtureValues: { d1: { red: 255 } }, presetIds: [], fadeMs: 0, holdMs: 1000 }] }],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'btn-seq', name: 'Rainbow', type: 'toggle', cueId: 'cue-seq', presetIds: [], x: 20, y: 20 },
      { id: 'btn-a', name: 'Song A', type: 'toggle', cueId: 'cue-a', presetIds: [], x: 20, y: 100 },
      { id: 'btn-b', name: 'Song B', type: 'toggle', cueId: 'cue-b', presetIds: [], x: 160, y: 100 },
      { id: 'btn-next', name: 'Next ›', type: 'flash', frameStep: 'next', presetIds: [], x: 20, y: 180 },
    ], annotations: [
      { id: 'frame1', type: 'frame', text: 'Set', x: 10, y: 90, width: 300, height: 130 },
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

function enterEditMode() {
  const edit = Array.from(container!.querySelectorAll('.live-page-edit')).find((el) => el.textContent?.trim() === 'Edit')
  expect(edit).toBeTruthy()
  act(() => { edit!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(useShowStore.getState().liveEditing).toBe(true)
}

function buttonDiv(buttonId: string) {
  const button = container!.querySelector(`[data-project-id="${buttonId}"]`)
  expect(button).toBeTruthy()
  return button as HTMLElement
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  renderInRoot(<App />)
  seedShow()
  switchToLive()
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  container?.remove()
  container = undefined
  root = undefined
})

describe('Live panel manipulation (Video 2)', () => {
  it('shows eight yellow resize handles and a yellow outline on a selected button in Edit Mode', () => {
    enterEditMode()
    act(() => { useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: 'btn-a' }]) })
    const button = buttonDiv('btn-a')
    // Yellow outline replaces the accent selection border in Edit Mode.
    expect(button.style.borderColor).toBe('rgb(250, 204, 21)')
    for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      expect(button.querySelector(`[aria-label="Resize ${handle}"]`)).toBeTruthy()
    }
    // The handles sit fully inside the button: the control div has
    // overflow:hidden, so a handle centred on the corner would have
    // its centre outside the box and never receive pointer events
    // (found by the real-app probe, 27 Nov 2026). The 120×40 button's
    // south-east handle is at left 112 / top 32.
    const se = button.querySelector('[aria-label="Resize se"]') as HTMLElement
    expect(se.style.left).toBe('112px')
    expect(se.style.top).toBe('32px')
  })

  it('(+) opens a dashed button with a name input; Return commits the typed name', () => {
    enterEditMode()
    const plus = container!.querySelector('[aria-label="New button"]')
    expect(plus).toBeTruthy()
    act(() => { plus!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    const input = container!.querySelector('input[aria-label="Cue name"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.placeholder).toBe('Enter a cue name and press Return')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => { setter.call(input, 'Wash Blue'); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
    act(() => { input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(container!.querySelector('input[aria-label="Cue name"]')).toBeNull()
    expect(Array.from(container!.querySelectorAll('[data-project-id]')).some((el) => el.textContent?.includes('Wash Blue'))).toBe(true)
  })

  it('prints the sequence speed on a sequence-only button', () => {
    expect(buttonDiv('btn-seq').textContent).toContain('Rainbow 0.5x')
  })

  it('a frame Next button steps the frame instead of firing a cue', () => {
    const next = buttonDiv('btn-next').querySelector('[aria-label="Next cue in frame"]')
    expect(next).toBeTruthy()
    act(() => { next!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().activeLiveValues['btn-a']).toBe(255)
    expect(useShowStore.getState().activeLiveValues['btn-b'] ?? 0).toBe(0)
  })

  it('A toggles alignment off in Edit Mode, and the Shortcuts row flips its label', () => {
    enterEditMode()
    expect(useShowStore.getState().liveAlignmentOff).toBe(false)
    act(() => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true })) })
    expect(useShowStore.getState().liveAlignmentOff).toBe(true)
    act(() => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true })) })
    expect(useShowStore.getState().liveAlignmentOff).toBe(false)
    const rows = buildShortcutsList({ tab: 'Live', liveEditing: true, editingPreset: false })
    expect(rows.find((r) => r.key === 'A')?.label).toBe('Disable alignment')
    const offRows = buildShortcutsList({ tab: 'Live', liveEditing: true, editingPreset: false, liveAlignmentOff: true })
    expect(offRows.find((r) => r.key === 'A')?.label).toBe('Enable alignment')
  })
})
