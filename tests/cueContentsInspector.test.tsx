// Cue contents inspector (Jake, 27 Nov 2026 — LightKey cue editing,
// Videos 1 + 2): the Get Info popup shows the cue's ingredients as a
// list — presets, sequences, ad-hoc — with a per-row ×, a right-click
// menu, and row selection that highlights the palette item and labels
// its fixtures in the Preview. Tabs: Contents / Options / Button.
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
  { id: 'p-blue', name: 'Blue', category: 'color', fixtureValues: { d1: { blue: 255, intensity: 255 } } },
]

function seedShow() {
  useShowStore.getState().setShow(migrateShow({
    fixtures: FIXTURES,
    presets: PRESETS,
    cues: [{ id: 'cue1', name: 'Song 1', presetIds: ['p-red'], sequenceIds: ['seq1'], fixtureValues: { d1: { intensity: 200 } }, fadeMs: 500 }],
    sequences: [{ id: 'seq1', name: 'Rainbow', order: 'forward', loop: false, timing: 'manual', stepsPerBeat: 1, steps: [{ id: 'step1', name: 'Step 1', fixtureValues: { d1: { red: 255 } }, presetIds: [], fadeMs: 0, holdMs: 1000 }] }],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'btn1', name: 'Song 1', type: 'push', cueId: 'cue1', presetIds: [], x: 20, y: 20 },
      { id: 'btn2', name: 'Standalone', type: 'push', behavior: 'flash', presetIds: ['p-blue'], adHocValues: { d1: { red: 255 } }, x: 160, y: 20 },
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

function clickTab(dialog: HTMLElement, label: string) {
  const tab = Array.from(dialog.querySelectorAll('[role="tab"]')).find((el) => el.textContent?.toLowerCase() === label.toLowerCase())
  expect(tab).toBeTruthy()
  act(() => { tab!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function contentsList(dialog: HTMLElement) {
  return dialog.querySelector('[aria-label="Cue contents"]') as HTMLElement
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

describe('cue contents inspector', () => {
  it('lists the cue ingredients with the ad-hoc row, and selecting one highlights the palette', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const dialog = openPopup('btn1')
    const list = contentsList(dialog)
    expect(list.textContent).toContain('Red')
    expect(list.textContent).toContain('Rainbow')
    expect(list.textContent).toContain('Ad hoc properties')
    const redRow = Array.from(list.querySelectorAll('[role="listitem"]')).find((el) => el.textContent?.includes('Red'))!
    act(() => { redRow.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().contentsPreview?.id).toBe('p-red')
    const paletteRow = container!.querySelector('[data-palette-row="preset:p-red"]')
    expect(paletteRow?.className).toContain('bg-panel2')
  })

  it('removes a preset from the cue with the per-row ×', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const dialog = openPopup('btn1')
    const remove = dialog.querySelector('[aria-label="Remove Red from cue"]') as HTMLElement
    expect(remove).toBeTruthy()
    act(() => { remove.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().cues.find((c) => c.id === 'cue1')?.presetIds).toEqual([])
  })

  it('removes a sequence via the contents-item menu, and promotes ad-hoc to a preset', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const dialog = openPopup('btn1')
    const list = contentsList(dialog)
    const seqRow = Array.from(list.querySelectorAll('[role="listitem"]')).find((el) => el.textContent?.includes('Rainbow'))!
    act(() => { seqRow.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })) })
    const menu = container!.querySelector('[aria-label="Contents item actions"]') as HTMLElement
    expect(menu).toBeTruthy()
    expect(menu.textContent).toContain('Show in Palette')
    expect(menu.textContent).toContain('Add to Palette')
    const remove = Array.from(menu.querySelectorAll('[role="menuitem"]')).find((el) => el.textContent === 'Remove From Cue')!
    act(() => { remove.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().cues.find((c) => c.id === 'cue1')?.sequenceIds).toEqual([])

    // The standalone button's ad-hoc row promotes to a reusable preset.
    act(() => { useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: 'btn2' }]) })
    const dialog2 = openPopup('btn2')
    const list2 = contentsList(dialog2)
    expect(list2.textContent).toContain('Blue')
    const adhocRow = Array.from(list2.querySelectorAll('[role="listitem"]')).find((el) => el.textContent?.includes('Ad hoc properties'))!
    act(() => { adhocRow.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })) })
    const menu2 = container!.querySelector('[aria-label="Contents item actions"]') as HTMLElement
    const addToPalette = Array.from(menu2.querySelectorAll('[role="menuitem"]')).find((el) => el.textContent === 'Add to Palette') as HTMLButtonElement
    expect(addToPalette.disabled).toBe(false)
    act(() => { addToPalette.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    const next = useShowStore.getState()
    const promoted = next.presets.find((p) => p.name === 'Standalone ad hoc')
    expect(promoted).toBeTruthy()
    expect(next.show?.livePages?.[0].controls.find((c) => c.id === 'btn2')?.adHocValues).toEqual({})
    expect(next.show?.livePages?.[0].controls.find((c) => c.id === 'btn2')?.presetIds).toContain(promoted!.id)
  })

  it('tabs switch between Contents, Options and Button', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().setLiveEditing(true) })
    const dialog = openPopup('btn2')
    // Contents is the default tab.
    expect(dialog.querySelector('[aria-label="Cue contents"]')).toBeTruthy()
    clickTab(dialog, 'Options')
    expect(dialog.textContent).toContain('Timing')
    // The Options tab carries LightKey's Modifiers checklist now (Item 4,
    // 27 Nov 2026) — the old intensity/speed/size % inputs are gone.
    expect(dialog.textContent).toContain('Modifiers')
    expect(dialog.textContent).toContain('Hue')
    expect(dialog.querySelector('[aria-label="Cue contents"]')).toBeNull()
    clickTab(dialog, 'Button')
    expect(dialog.textContent).toContain('Behavior')
    expect(dialog.textContent).toContain('Always active')
    expect(dialog.textContent).toContain('Automatic')
    // Priority lives in the Button section (guide p.204), not Options.
    expect(dialog.textContent).toContain('Priority')
  })
})
