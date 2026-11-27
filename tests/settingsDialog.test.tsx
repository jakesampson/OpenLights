// @vitest-environment jsdom
// Jake, 22 Nov 2026: the far-right header button is view options, not a
// menu — Hide/Show Preview, Preset Palette and Shortcuts — and Settings
// is a tabbed dialog (General, Timing, Gestures, DMX Output, External
// Control, plus NDI Ambience — OpenLights' own tab, Jake 23 Nov 2026,
// the Windows route to the feature) opened by Cmd/Ctrl+,. The old
// single settings popup is gone.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { isAmbienceActive, resetAmbienceState } from '../src/renderer/src/lib/ndiAmbience'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PORT_INFO = { path: '/dev/ttyUSB0', manufacturer: 'FTDI', serialNumber: 'SN1', vendorId: '0403', productId: '6001' }
const DISCONNECTED = { connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }

const openLiveWindowMock = vi.fn(() => Promise.resolve({ id: 'live-1', pageId: null, width: 1000, height: 700 }))

const NDI_SOURCES = [{ name: 'OBS Live', urlAddress: '10.0.0.5:5961' }]
const ndiStartMock = vi.fn(() => Promise.resolve({ success: true }))
const ndiStopMock = vi.fn(() => Promise.resolve({ success: true }))

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([PORT_INFO]),
  getDmxStatus: () => Promise.resolve(DISCONNECTED),
  setDmxPort: () => Promise.resolve({ success: true, status: DISCONNECTED }),
  disconnectDmx: () => Promise.resolve({ success: true, status: DISCONNECTED }),
  setChannels: () => {},
  getChannels: () => Promise.resolve([]),
  openLiveWindow: openLiveWindowMock,
  ndiVersion: () => Promise.resolve({ available: true, version: 'NDI SDK 6.3.2.0' }),
  ndiListSources: () => Promise.resolve({ sources: NDI_SOURCES }),
  ndiStart: ndiStartMock,
  ndiStop: ndiStopMock,
  onNdiRegions: () => () => {},
  onNdiStatus: () => () => {}
}

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

const text = () => container?.textContent ?? ''
const clickButton = (label: string) => {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === label)
  expect(button, `button "${label}"`).not.toBeUndefined()
  act(() => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
const clickAriaButton = (label: string) => {
  const button = container?.querySelector(`button[aria-label="${label}"]`)
  expect(button, `button[aria-label="${label}"]`).not.toBeNull()
  act(() => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  const state = useShowStore.getState()
  state.setShow(migrateShow({ fixtures: [] } as unknown as ShowDef))
  state.exitSetupWizard()
  state.setWelcomeOpen(false)
  state.setNewProjectDialogOpen(false)
  state.setNewProjectTemplate(null)
  window.localStorage.clear()
  openLiveWindowMock.mockClear()
  ndiStartMock.mockClear()
  ndiStopMock.mockClear()
  resetAmbienceState()
  vi.useFakeTimers()
  renderInRoot(<App />)
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
  resetAmbienceState()
  vi.useRealTimers()
})

describe('header view-options menu', () => {
  it('offers Hide Preview / Hide Preset Palette / Hide Shortcuts, flipping to Show', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    clickAriaButton('View options')
    expect(text()).toContain('Hide Preview')
    expect(text()).toContain('Hide Preset Palette')
    expect(text()).toContain('Hide Shortcuts')
    // The menu is not a settings menu: no settings rows in it.
    expect(text()).not.toContain('Default fade')
    expect(text()).not.toContain('Adaptive background colour')
    clickButton('Hide Shortcuts')
    expect(useShowStore.getState().show?.layout?.shortcuts).toBe(false)
    clickAriaButton('View options')
    expect(text()).toContain('Show Shortcuts')
    expect(text()).not.toContain('Hide Shortcuts')
    // Jake, 23 Nov 2026: the view menu holds ONLY the three toggles —
    // the action rows moved out (DMX/MIDI to Settings, Blackout to the
    // Live menu and B, Full screen to the Window menu and F11, Open Live
    // window to the Window menu, Automation… to the View menu).
    const menuText = container?.querySelector('[data-header-settings-menu]')?.textContent ?? ''
    expect(menuText).not.toContain('Blackout')
    expect(menuText).not.toContain('Open Live window')
    expect(menuText).not.toContain('Full screen')
    expect(menuText).not.toContain('Automation')
    expect(menuText).not.toContain('MIDI')
    expect(menuText).not.toContain('DMX')
  })

  it('hides the Shortcuts panel when Shortcuts is off', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => { useShowStore.getState().updateProject({ layout: { preview: true, palette: true, inspector: true, shortcuts: false } }) })
    const panel = [...(container?.querySelectorAll('.bottom-grid > .panel') ?? [])].find((p) => p.textContent?.trim().startsWith('Shortcuts'))
    expect(panel).not.toBeUndefined()
    expect((panel as HTMLElement).style.display).toBe('none')
  })
})

describe('tabbed Settings dialog', () => {
  const openSettings = async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true, cancelable: true })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  }

  it('opens on Cmd+, with six tabs (five LightKey + NDI Ambience)', async () => {
    await openSettings()
    expect(container?.querySelector('[role="dialog"][aria-labelledby="settings-title"]')).not.toBeNull()
    expect(container?.querySelectorAll('[role="tab"]').length).toBe(6)
    for (const label of ['General', 'Timing', 'Gestures', 'DMX Output', 'External Control', 'NDI Ambience']) {
      expect(text()).toContain(label)
    }
  })

  it('spreads the existing settings across the tabs, keeping their values', async () => {
    await openSettings()
    // General: startup + adaptive background + appearance + page switch.
    expect(container?.querySelector('select[aria-label="Project startup state"]')).not.toBeNull()
    expect(text()).toContain('Adaptive background colour')
    expect(container?.querySelector('select[aria-label="Application appearance"]')).not.toBeNull()
    expect(text()).toContain('Deactivate cues before switching pages')
    // Timing: Default fade stays 1000 ms, Page fade stays 500 ms.
    clickButton('Timing')
    expect((container?.querySelector('input[aria-label="Default fade milliseconds"]') as HTMLInputElement)?.value).toBe('1000')
    expect((container?.querySelector('input[aria-label="Page fade milliseconds"]') as HTMLInputElement)?.value).toBe('500')
    expect((container?.querySelector('input[aria-label="Tempo in BPM"]') as HTMLInputElement)?.value).toBe('120')
    // Gestures: no LightKey gesture rows — OpenLights implements none.
    clickButton('Gestures')
    expect(text()).toContain('doesn’t use trackpad gestures')
    expect(text()).not.toContain('Scroll up/down')
    // DMX Output: only the two USB methods OpenLights supports.
    clickButton('DMX Output')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(text()).toContain('Serial USB Interfaces')
    expect(text()).toContain('Open DMX Interfaces')
    expect(text()).not.toContain('Art-Net')
    expect(text()).not.toContain('sACN')
    expect(text()).not.toContain('Eurolite PRO')
    expect(text()).not.toContain('ESP Net')
    // External Control: MIDI only, no OSC or Ableton rows.
    clickButton('External Control')
    expect(text()).toContain('MIDI Mapping')
    expect(text()).not.toContain('Enable OSC')
    expect(text()).not.toContain('Ableton Live')
  })

  it('closes on Escape', async () => {
    await openSettings()
    expect(container?.querySelector('[role="dialog"][aria-labelledby="settings-title"]')).not.toBeNull()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(container?.querySelector('[role="dialog"][aria-labelledby="settings-title"]')).toBeNull()
  })

  it('reopens on the last-used tab', async () => {
    await openSettings()
    clickButton('DMX Output')
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(container?.querySelector('[role="dialog"][aria-labelledby="settings-title"]')).toBeNull()
    await openSettings()
    const dmxTab = [...(container?.querySelectorAll('[role="tab"]') ?? [])].find((b) => b.textContent?.trim() === 'DMX Output')
    expect(dmxTab?.getAttribute('aria-selected')).toBe('true')
  })

  it('hosts the NDI Ambience panel on its own tab', async () => {
    // Jake, 23 Nov 2026: the Settings tab is the Windows route to NDI
    // Ambience — the native menu bar is unreachable on a frameless
    // window, so the View menu entry alone wasn't enough.
    await openSettings()
    clickButton('NDI Ambience')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(text()).toContain('No screen placed yet')
    expect(text()).toContain('Place screen on Preview')
    expect(text()).toContain('NDI source')
    expect(text()).toContain('OBS Live')
    const start = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === 'Start Ambience')
    expect(start?.hasAttribute('disabled')).toBe(true)
  })

  it('leaves a running Ambience session alone when Settings closes', async () => {
    await openSettings()
    clickButton('NDI Ambience')
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    clickButton('Place screen on Preview')
    await act(async () => { clickButton('Start Ambience') })
    expect(text()).toContain('waiting for the first video frame')
    expect(isAmbienceActive()).toBe(true)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(container?.querySelector('[role="dialog"][aria-labelledby="settings-title"]')).toBeNull()
    expect(ndiStopMock).not.toHaveBeenCalled()
    expect(isAmbienceActive()).toBe(true)
  })
})

describe('header Edit button', () => {
  it('is smaller, header-coloured, and keeps its border', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const edit = container?.querySelector('button[aria-label="Edit preview"]')
    expect(edit?.classList.contains('header-edit-button')).toBe(true)
    const { readFileSync } = await import('node:fs')
    const styles = readFileSync('src/renderer/src/index.css', 'utf8')
    expect(styles).toContain('.top-bar > .flex:first-child > button.btn-theme.header-edit-button { min-height: 26px; padding: 3px 10px; font-size: 12px; background: transparent; }')
    // The border stays: the rule sets no border of its own, so the
    // header rule's #767678 border and the .btn-theme 1px border stand.
    expect(styles).not.toContain('.header-edit-button { border: 0')
    expect(styles).not.toContain('.header-edit-button{border:0')
  })
})

describe('actions re-homed from the view menu (Jake, 23 Nov 2026)', () => {
  const dispatchMenuCommand = (command: string) => {
    act(() => { window.dispatchEvent(new CustomEvent('openlights-menu-command', { detail: { command } })) })
  }

  it('opens a Live window from the native menu command', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    dispatchMenuCommand('openLiveWindow')
    expect(openLiveWindowMock).toHaveBeenCalledTimes(1)
    expect(openLiveWindowMock).toHaveBeenCalledWith(useShowStore.getState().activeLivePageId)
  })

  it('opens the Automation panel from the native menu command', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(container?.querySelector('[role="dialog"][aria-label="Automation"]')).toBeNull()
    dispatchMenuCommand('automation')
    expect(container?.querySelector('[role="dialog"][aria-label="Automation"]')).not.toBeNull()
  })
})
