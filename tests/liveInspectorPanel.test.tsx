// Get Info inspector — LightKey's floating panel (Jake, 27 Nov 2026):
// a rounded popover beside the control, title centred, × top-left,
// one scrollable list of collapsible sections, every setting an inline
// mini-dropdown or an on/off toggle. Rendered behaviour: the panel
// floats (not docked), dropdowns and toggles change the control and
// persist, Timing edits persist, and it closes with ×, Escape (both
// modes) and a click on blank canvas.
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

const FIXTURES = [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }]
const PRESETS = [
  { id: 'p-red', name: 'Red', category: 'color', fixtureValues: { d1: { red: 255, intensity: 255 } } },
]

function seedShow() {
  useShowStore.getState().setShow(migrateShow({
    fixtures: FIXTURES,
    presets: PRESETS,
    cues: [{ id: 'cue1', name: 'Song 1', presetIds: ['p-red'], sequenceIds: [], fixtureValues: {}, fadeMs: 500 }],
    sequences: [],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'btn1', name: 'Song 1', type: 'push', cueId: 'cue1', presetIds: [], x: 20, y: 20 },
      { id: 'btn3', name: 'Spots', type: 'faderVertical', cueId: 'cue1', presetIds: [], x: 300, y: 20 },
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

function openPopup(buttonId: string) {
  const button = container!.querySelector(`[data-project-id="${buttonId}"]`)
  expect(button).toBeTruthy()
  act(() => { button!.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })) })
  const dialog = container!.querySelector('[role="dialog"]')
  expect(dialog).toBeTruthy()
  return dialog as HTMLElement
}

function changeSelect(dialog: HTMLElement, label: string, value: string) {
  const select = dialog.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement
  expect(select).toBeTruthy()
  act(() => {
    select.value = value
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  return select
}

function checkboxFor(dialog: HTMLElement, text: string) {
  const box = Array.from(dialog.querySelectorAll('input[type="checkbox"]')).find((el) => el.parentElement?.textContent?.includes(text)) as HTMLInputElement
  expect(box).toBeTruthy()
  return box
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

describe('Get Info inspector — LightKey floating panel', () => {
  it('floats beside the control with the control name as its title, no Name field, no tabs', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const dialog = openPopup('btn1')
    // A rounded popover, not the old docked side panel.
    expect(dialog.className).toContain('rounded-xl')
    expect(dialog.className).toContain('w-[340px]')
    expect(dialog.className).not.toContain('bottom-2')
    expect(dialog.className).not.toContain('right-2')
    // Positioned beside the control (jsdom rects are all zero, so it
    // lands at the 8px clamp — the point is the position is measured,
    // not docked to the panel edge).
    expect(dialog.style.left).toBe('8px')
    expect(dialog.style.top).toBe('8px')
    // Title is the control name, centred; × is top-left.
    const title = dialog.querySelector('h3')
    expect(title?.textContent).toBe('Song 1')
    expect(title?.className).toContain('text-center')
    const close = dialog.querySelector('[aria-label="Close properties popup"]') as HTMLElement
    expect(close).toBeTruthy()
    expect(close.className).toContain('absolute left-0 top-0')
    // No Name field (renaming stays in the Rename menu item) and no tabs.
    expect(dialog.querySelector('input[aria-label="Cue name"]')).toBeNull()
    expect(dialog.querySelector('[role="tablist"]')).toBeNull()
  })

  it('Type, Behavior, Priority and Color dropdowns change the control and persist', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const dialog = openPopup('btn1')
    const control = () => useShowStore.getState().show?.livePages?.[0].controls.find((c) => c.id === 'btn1')
    // Push button: Behavior is shown, Controls is not.
    expect(dialog.querySelector('select[aria-label="Push button behavior"]')).toBeTruthy()
    expect(dialog.querySelector('select[aria-label="Fader controls"]')).toBeNull()
    // Switching Type to a fader swaps Behavior for Controls.
    changeSelect(dialog, 'Cue control type', 'faderVertical')
    expect(control()?.type).toBe('faderVertical')
    expect(dialog.querySelector('select[aria-label="Push button behavior"]')).toBeNull()
    expect(dialog.querySelector('select[aria-label="Fader controls"]')).toBeTruthy()
    // Back to a push button, then Priority and Color.
    changeSelect(dialog, 'Cue control type', 'push')
    changeSelect(dialog, 'Cue priority', '9')
    expect(control()?.priority).toBe(9)
    changeSelect(dialog, 'Cue colour', '#f19a98')
    expect(control()?.appearance?.color).toBe('#f19a98')
    changeSelect(dialog, 'Cue colour', 'automatic')
    expect(control()?.appearance?.color).toBe('#47235a')
  })

  it('toggles flip and persist, and Timing edits persist', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const dialog = openPopup('btn1')
    const control = () => useShowStore.getState().show?.livePages?.[0].controls.find((c) => c.id === 'btn1')
    // "Activate:" is the FieldRow label now (LightKey's layout) — the
    // checkbox's own label is just "At startup".
    const startup = checkboxFor(dialog, 'At startup')
    expect(startup.checked).toBe(false)
    act(() => { startup.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(control()?.activateAtStartup).toBe(true)
    const fadeIn = dialog.querySelector('input[aria-label="Fade In"]') as HTMLInputElement
    expect(fadeIn).toBeTruthy()
    // Set the value through the native setter: assigning .value
    // directly lets React's value tracker swallow the input event.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(fadeIn, '00:01.0')
      fadeIn.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    act(() => { fadeIn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(control()?.timing?.fadeInMs).toBe(1000)
  })

  it('a fader inspector shows Controls and no Behavior', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const dialog = openPopup('btn3')
    expect(dialog.querySelector('select[aria-label="Fader controls"]')).toBeTruthy()
    expect(dialog.querySelector('select[aria-label="Push button behavior"]')).toBeNull()
    expect(dialog.querySelector('h3')?.textContent).toBe('Spots')
  })

  it('closes with ×, Escape in both modes, and a click on blank canvas', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    // × closes.
    let dialog = openPopup('btn1')
    const close = dialog.querySelector('[aria-label="Close properties popup"]') as HTMLElement
    act(() => { close.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
    // Escape closes in Edit mode.
    dialog = openPopup('btn1')
    act(() => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
    // Escape also closes in Live mode (the popup stays open when Edit
    // mode is left directly — the Done button is the other path).
    dialog = openPopup('btn1')
    act(() => { useShowStore.getState().setLiveEditing(false) })
    act(() => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
    // A click on blank canvas closes it; a click on another control
    // does not close it, and pressing that control re-targets the
    // inspector to it.
    act(() => { useShowStore.getState().setLiveEditing(true) })
    dialog = openPopup('btn1')
    const other = container!.querySelector('[data-project-id="btn3"]') as HTMLElement
    act(() => { other.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(container!.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container!.querySelector('[role="dialog"] h3')?.textContent).toBe('Song 1')
    act(() => { other.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0 })) })
    expect(container!.querySelector('[role="dialog"] h3')?.textContent).toBe('Spots')
    const section = container!.querySelector('[aria-label="Live page canvas"]') as HTMLElement
    act(() => { section.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(container!.querySelector('[role="dialog"]')).toBeNull()
  })
})
