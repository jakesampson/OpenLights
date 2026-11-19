// @vitest-environment jsdom
// Jake, 20 Nov 2026: a fresh multifixture showed 0 DMX output — not an
// output bug, but because the DMX interface had never connected: the
// auto-connect code (DmxConnection's mount-time scan of the saved
// default in localStorage) only runs while the component is mounted,
// and it was rendered inside the settings dropdown, so it never ran at
// startup. Opening the DMX menu mounted it and connected — which is
// also why the DMX test then worked. The connection must be remembered
// and re-established on launch, with no menu opened.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SAVED_DEVICE = { path: '/dev/ttyUSB0', serialNumber: 'SN1', vendorId: '0403', productId: '6001', protocol: 'enttec-usb-pro' }
const PORT_INFO = { path: '/dev/ttyUSB0', manufacturer: 'FTDI', serialNumber: 'SN1', vendorId: '0403', productId: '6001' }
const DISCONNECTED = { connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }
const CONNECTED = { connected: true, port: '/dev/ttyUSB0', serialProtocol: 'enttec-usb-pro', baudRate: 250000, lastFrameAt: Date.now(), frameCount: 1, universe: 1, error: null, mode: 'live' }

const setDmxPort = vi.fn(() => Promise.resolve({ success: true, status: CONNECTED }))
const getDmxPorts = vi.fn(() => Promise.resolve([PORT_INFO]))

// Add electronAPI to the real jsdom window — do not replace window itself,
// or React's commit path (window.HTMLIFrameElement) breaks.
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts,
  getDmxStatus: () => Promise.resolve(DISCONNECTED),
  setDmxPort,
  disconnectDmx: () => Promise.resolve({ success: true, status: DISCONNECTED }),
  setChannels: () => {},
  getChannels: () => Promise.resolve([])
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
  setDmxPort.mockClear()
  getDmxPorts.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
  vi.useRealTimers()
})

describe('DMX auto-connect on launch', () => {
  it('reconnects the remembered interface at startup, with no menu opened', async () => {
    window.localStorage.setItem('openlights.usbDmxDefault', JSON.stringify(SAVED_DEVICE))
    renderInRoot(<App />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(getDmxPorts).toHaveBeenCalled()
    expect(setDmxPort).toHaveBeenCalledWith('/dev/ttyUSB0', 'enttec-usb-pro')
  })

  it('stays disconnected without hanging or erroring when the saved device is missing', async () => {
    window.localStorage.setItem('openlights.usbDmxDefault', JSON.stringify(SAVED_DEVICE))
    getDmxPorts.mockResolvedValueOnce([])
    renderInRoot(<App />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(setDmxPort).not.toHaveBeenCalled()
    // The DMX status button is visible in the header, showing the
    // disconnected state — the manual path (open it, rescan) is there.
    expect(container?.querySelector('button[title="DMX output settings"]')).not.toBeNull()
  })

  it('connects nothing on a first run with no remembered interface', async () => {
    renderInRoot(<App />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(setDmxPort).not.toHaveBeenCalled()
    expect(container?.querySelector('button[title="DMX output settings"]')).not.toBeNull()
  })
})
