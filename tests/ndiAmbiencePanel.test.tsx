// @vitest-environment jsdom
// NDI Ambience panel: no-screen state, placing the screen, Start/Stop,
// and the sampled edge colours — with the NDI worker mocked out. Also
// the stopOnUnmount prop (Settings tab leaves a running session alone)
// and two panels sharing one live session.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { NdiAmbiencePanel } from '../src/renderer/src/components/NdiAmbiencePanel'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { isAmbienceActive, resetAmbienceState } from '../src/renderer/src/lib/ndiAmbience'
import { resetNdiSession } from '../src/renderer/src/lib/ndiSession'
import type { NdiRegionColour, NdiSourceInfo } from '../src/shared/ndiAmbience'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SOURCES: NdiSourceInfo[] = [{ name: 'OBS Live', urlAddress: '10.0.0.5:5961' }]
const RED_REGIONS: NdiRegionColour[] = Array.from({ length: 8 }, (_, i) => ({ index: i, rgb: { r: 255, g: 0, b: 0 } }))

const ndiStartMock = vi.fn(() => Promise.resolve({ success: true }))
const ndiStopMock = vi.fn(() => Promise.resolve({ success: true }))
let regionsCallback: ((regions: NdiRegionColour[]) => void) | null = null

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  setChannels: () => {},
  getChannels: () => Promise.resolve([]),
  ndiVersion: () => Promise.resolve({ available: true, version: 'NDI SDK 6.3.2.0' }),
  ndiListSources: () => Promise.resolve({ sources: SOURCES }),
  ndiStart: ndiStartMock,
  ndiStop: ndiStopMock,
  onNdiRegions: (cb: (regions: NdiRegionColour[]) => void) => {
    regionsCallback = cb
    return () => {
      regionsCallback = null
    }
  },
  onNdiStatus: () => () => {}
}

let container: HTMLDivElement | undefined
let rootNode: Root | undefined
let secondContainer: HTMLDivElement | undefined
let secondRoot: Root | undefined
let defaultShow: ReturnType<typeof useShowStore.getState>['show']

function renderPanel(props?: { stopOnUnmount?: boolean }) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => {
    rootNode.render(<NdiAmbiencePanel {...props} />)
  })
  return el
}

const text = () => container?.textContent ?? ''
const button = (label: string) =>
  [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === label)
const clickButton = (label: string) => {
  const found = button(label)
  expect(found, `button "${label}"`).not.toBeUndefined()
  act(() => {
    found?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  defaultShow = useShowStore.getState().show
  const base = defaultShow
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'ndi-test-show',
    stageObjects: [],
    fixtures: [
      { id: 'f1', profileId: 'simger-q12bt-rgba-4ch', type: 'rgba-4ch', name: 'F1', channelStart: 20, channels: 4, previewPosition: { x: 320, y: 60 }, disabled: false, inStorage: false, instances: 1 },
      { id: 'f2', profileId: 'simger-q12bt-rgba-4ch', type: 'rgba-4ch', name: 'F2', channelStart: 24, channels: 4, previewPosition: { x: 480, y: 280 }, disabled: false, inStorage: false, instances: 1 }
    ]
  }
  act(() => {
    useShowStore.setState({ show, master: 255 })
  })
  resetAmbienceState()
  resetNdiSession()
  ndiStartMock.mockClear()
  ndiStopMock.mockClear()
  regionsCallback = null
})

afterEach(() => {
  act(() => {
    rootNode?.unmount()
    secondRoot?.unmount()
  })
  container?.remove()
  secondContainer?.remove()
  container = undefined
  rootNode = undefined
  secondContainer = undefined
  secondRoot = undefined
  act(() => {
    useShowStore.setState({ show: defaultShow })
  })
  resetAmbienceState()
  resetNdiSession()
})

describe('NdiAmbiencePanel', () => {
  it('says there is no screen yet and keeps Start disabled until one is placed', async () => {
    renderPanel()
    await act(async () => {})
    expect(text()).toContain('No screen placed yet')
    expect(text()).toContain('OBS Live')
    const start = button('Start Ambience')
    expect(start?.hasAttribute('disabled')).toBe(true)
  })

  it('places a screen, starts ambience, shows the sampled edge colours, and stops', async () => {
    renderPanel()
    await act(async () => {})
    clickButton('Place screen on Preview')
    expect(useShowStore.getState().show?.stageObjects).toHaveLength(1)
    expect(useShowStore.getState().show?.stageObjects[0].kind).toBe('screen')
    expect(text()).toContain('Screen at (400, 170)')

    const start = button('Start Ambience')
    expect(start?.hasAttribute('disabled')).toBe(false)
    await act(async () => {
      clickButton('Start Ambience')
    })
    expect(ndiStartMock).toHaveBeenCalledWith(SOURCES[0])
    expect(text()).toContain('Ambience is driving the mapped fixtures.')

    expect(regionsCallback).not.toBeNull()
    act(() => {
      regionsCallback?.(RED_REGIONS)
    })
    const swatches = container?.querySelectorAll('[title*="#ff0000"]') ?? []
    expect(swatches.length).toBe(8)
    expect(text()).toContain('2 fixtures following an edge')

    await act(async () => {
      clickButton('Stop Ambience')
    })
    expect(ndiStopMock).toHaveBeenCalled()
    expect(text()).toContain('Stopped — cues, presets and Live are in charge.')
  })

  it('connects directly by address when discovery cannot see a source', async () => {
    renderPanel()
    await act(async () => {})
    clickButton('Place screen on Preview')
    const input = container?.querySelector('input[type="text"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(input, '127.0.0.1:5961')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      clickButton('Start Ambience')
    })
    expect(ndiStartMock).toHaveBeenCalledWith({ name: 'direct 127.0.0.1:5961', urlAddress: '127.0.0.1:5961' })
  })

  it('stops ambience when the panel closes', async () => {
    renderPanel()
    await act(async () => {})
    clickButton('Place screen on Preview')
    await act(async () => {
      clickButton('Start Ambience')
    })
    expect(text()).toContain('Ambience is driving the mapped fixtures.')
    act(() => {
      rootNode?.unmount()
    })
    // The unmount cleanup stops the worker and clears the output.
    expect(ndiStopMock).toHaveBeenCalled()
    rootNode = undefined
  })

  it('keeps ambience running when the panel closes with stopOnUnmount={false}', async () => {
    // The Settings tab embeds the panel this way: closing Settings
    // must not kill a running session.
    renderPanel({ stopOnUnmount: false })
    await act(async () => {})
    clickButton('Place screen on Preview')
    await act(async () => {
      clickButton('Start Ambience')
    })
    expect(text()).toContain('Ambience is driving the mapped fixtures.')
    expect(isAmbienceActive()).toBe(true)
    act(() => {
      rootNode?.unmount()
    })
    expect(ndiStopMock).not.toHaveBeenCalled()
    expect(isAmbienceActive()).toBe(true)
    rootNode = undefined
  })

  it('a second panel picks up that ambience is already running', async () => {
    // Two routes to one session (Settings tab + View menu panel): the
    // second mount reads the live state instead of a fresh "stopped".
    renderPanel()
    await act(async () => {})
    clickButton('Place screen on Preview')
    await act(async () => {
      clickButton('Start Ambience')
    })
    expect(text()).toContain('Ambience is driving the mapped fixtures.')
    const el2 = document.createElement('div')
    document.body.appendChild(el2)
    secondContainer = el2
    secondRoot = createRoot(el2)
    act(() => {
      secondRoot.render(<NdiAmbiencePanel />)
    })
    await act(async () => {})
    expect(el2.textContent).toContain('Ambience is driving the mapped fixtures.')
    expect([...el2.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Stop Ambience')).toBe(true)
  })
})
