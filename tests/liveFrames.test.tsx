// Frames + exclusive attach (Jake, 27 Nov 2026 — LightKey cue editing,
// Videos 1 + 2, guide pp.184 + 188): the frame inspector's
// Previous/Next select creates and removes the step buttons; Remove
// From Frame moves a button out of its frame; buttons touching each
// other act as an exclusive group — only one can be active at a time.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { frameMembers } from '../src/renderer/src/lib/liveFrames'
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
    cues: [],
    sequences: [],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      // btn-a and btn-b touch edge to edge (140) — an attached group.
      { id: 'btn-a', name: 'Red A', type: 'toggle', presetIds: ['p-red'], x: 20, y: 100, width: 120, height: 40 },
      { id: 'btn-b', name: 'Red B', type: 'toggle', presetIds: ['p-red'], x: 140, y: 100, width: 120, height: 40 },
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

function openFramePopup() {
  // Double-click properties stays edit-gated (Part 1 decision): enter
  // Edit Mode first, then double-click the frame's label.
  enterEditMode()
  const label = Array.from(container!.querySelectorAll('[aria-label="Live page canvas"] div')).find((el) => el.textContent === 'Set' && el.children.length === 0)
  expect(label).toBeTruthy()
  act(() => { label!.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })) })
  const dialog = container!.querySelector('[role="dialog"]')
  expect(dialog).toBeTruthy()
  return dialog as HTMLElement
}

function setSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
  act(() => { setter.call(select, value); select.dispatchEvent(new window.Event('change', { bubbles: true })) })
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

describe('Frames (Video 2 + guide p.188)', () => {
  it('the frame inspector Previous/Next select creates and removes the step buttons', () => {
    const dialog = openFramePopup()
    const select = dialog.querySelector('select[aria-label="Frame Previous/Next buttons"]') as HTMLSelectElement
    expect(select).toBeTruthy()
    expect(select.value).toBe('none')
    setSelect(select, 'both')
    expect(container!.querySelector('[aria-label="Next cue in frame"]')).toBeTruthy()
    expect(container!.querySelector('[aria-label="Previous cue in frame"]')).toBeTruthy()
    setSelect(select, 'none')
    expect(container!.querySelector('[aria-label="Next cue in frame"]')).toBeNull()
    expect(container!.querySelector('[aria-label="Previous cue in frame"]')).toBeNull()
  })

  it('Remove From Frame moves the button below the frame and out of its membership', () => {
    const page = useShowStore.getState().show!.livePages![0]
    expect(frameMembers(page, 'frame1')).toContain('btn-a')
    act(() => { useShowStore.getState().removeFromFrame('btn-a') })
    const next = useShowStore.getState().show!.livePages![0]
    const control = next.controls.find((c) => c.id === 'btn-a')!
    expect(control.y).toBe(90 + 130 + 10)
    expect(frameMembers(next, 'frame1')).not.toContain('btn-a')
    // Not in a frame any more: a second call is a no-op.
    act(() => { useShowStore.getState().removeFromFrame('btn-a') })
    expect(useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn-a')!.y).toBe(230)
  })
})

describe('Exclusive attach (guide pp.183–184)', () => {
  it('activating a touching button releases the other one', () => {
    const state = useShowStore.getState()
    act(() => { state.setLiveValue('btn-a', 255) })
    expect(useShowStore.getState().activeLiveValues['btn-a']).toBe(255)
    act(() => { useShowStore.getState().setLiveValue('btn-b', 255) })
    expect(useShowStore.getState().activeLiveValues['btn-b']).toBe(255)
    expect(useShowStore.getState().activeLiveValues['btn-a'] ?? 0).toBe(0)
  })
})
