// Cue button menu in Edit Mode (Jake, 27 Nov 2026 — LightKey cue
// editing, Video 1): right-clicking a button in Edit Mode shows
// LightKey's button menu instead of the canvas menu; Get Info opens
// the contents inspector, Rename opens the name input, Remove From
// Frame moves the button out of its frame. Right-clicking empty canvas
// still shows the canvas menu.
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

function seedShow() {
  useShowStore.getState().setShow(migrateShow({
    fixtures: [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }],
    presets: [{ id: 'p-red', name: 'Red', category: 'color', fixtureValues: { d1: { red: 255, intensity: 255 } } }],
    cues: [{ id: 'cue1', name: 'Song 1', presetIds: ['p-red'], sequenceIds: [], fixtureValues: {}, fadeMs: 500 }],
    sequences: [],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'btn1', name: 'Song 1', type: 'toggle', cueId: 'cue1', presetIds: [], x: 20, y: 100, width: 120, height: 40 },
      { id: 'btn2', name: 'Standalone', type: 'flash', presetIds: ['p-red'], x: 160, y: 100, width: 120, height: 40 },
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

function rightClickButton(buttonId: string) {
  // In the real app the right-click's pointerdown selects the button
  // first; select it explicitly here, then dispatch the contextmenu.
  act(() => { useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: buttonId }]) })
  const button = container!.querySelector(`[data-project-id="${buttonId}"]`)
  expect(button).toBeTruthy()
  act(() => { button!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })) })
}

function buttonMenu() {
  return container!.querySelector('[aria-label="Cue button actions"]') as HTMLElement | null
}

function menuButton(label: string) {
  const menu = buttonMenu()
  expect(menu).toBeTruthy()
  const button = Array.from(menu!.querySelectorAll('button')).find((b) => b.textContent?.trim().replace(/^✓ /, '').replace(/›$/, '').trim() === label)
  expect(button).toBeTruthy()
  return button!
}

function realClick(button: Element) {
  act(() => { button.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })) })
  act(() => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  renderInRoot(<App />)
  seedShow()
  switchToLive()
  enterEditMode()
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  container?.remove()
  container = undefined
  root = undefined
})

describe('cue button menu in Edit Mode (Video 1)', () => {
  it('right-clicking a button shows the button menu, not the canvas menu', () => {
    rightClickButton('btn1')
    expect(buttonMenu()).toBeTruthy()
    expect(container!.querySelector('[aria-label="Live edit actions"]')).toBeNull()
    expect(menuButton('Get Info')).toBeTruthy()
    expect(menuButton('Remove From Frame')).toBeTruthy()
    // No Go / Stop / Live view in the button menu.
    expect(Array.from(buttonMenu()!.querySelectorAll('button')).some((b) => b.textContent?.includes('Go'))).toBe(false)
  })

  it('right-clicking empty canvas still shows the canvas menu', () => {
    const canvas = container!.querySelector('[aria-label="Live page canvas"]')!
    act(() => { canvas.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 500, clientY: 400 })) })
    expect(container!.querySelector('[aria-label="Live edit actions"]')).toBeTruthy()
    expect(buttonMenu()).toBeNull()
  })

  it('Get Info opens the contents inspector for the cue button', () => {
    rightClickButton('btn1')
    realClick(menuButton('Get Info'))
    expect(buttonMenu()).toBeNull()
    const dialog = container!.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog!.querySelector('[aria-label="Cue contents"]')).toBeTruthy()
    expect(dialog!.textContent).toContain('Red')
  })

  it('Rename opens the name input on the button', () => {
    rightClickButton('btn2')
    realClick(menuButton('Rename'))
    const input = container!.querySelector('input[aria-label="Cue name"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('Standalone')
  })

  it('Remove From Frame is enabled in a frame and moves the button out', () => {
    const page = useShowStore.getState().show!.livePages![0]
    expect(frameMembers(page, 'frame1')).toContain('btn1')
    rightClickButton('btn1')
    const remove = menuButton('Remove From Frame')
    expect(remove.hasAttribute('disabled')).toBe(false)
    realClick(remove)
    const next = useShowStore.getState().show!.livePages![0]
    expect(next.controls.find((c) => c.id === 'btn1')!.y).toBe(230)
    expect(frameMembers(next, 'frame1')).not.toContain('btn1')
  })

  it('Remove From Frame is disabled for a button outside any frame', () => {
    // btn2 sits at y 100 inside frame1 too — move it out first via the
    // store, then check the menu.
    act(() => { useShowStore.getState().removeFromFrame('btn2') })
    rightClickButton('btn2')
    const remove = menuButton('Remove From Frame')
    expect(remove.hasAttribute('disabled')).toBe(true)
    expect(remove.getAttribute('title')).toBe('Not in a frame')
  })
})
