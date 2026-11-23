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
import { isAmbienceActive, resetAmbienceState, getAmbienceFixtureGroup, getAmbienceTransitionMs, setAmbienceFixtureGroup, setAmbienceTransitionMs, NDI_DEFAULT_TRANSITION_MS } from '../src/renderer/src/lib/ndiAmbience'
import { resetNdiSession, getNdiReceiveHealth } from '../src/renderer/src/lib/ndiSession'
import type { NdiReceiveHealth, NdiRegionColour, NdiSourceInfo } from '../src/shared/ndiAmbience'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SOURCES: NdiSourceInfo[] = [{ name: 'OBS Live', urlAddress: '10.0.0.5:5961' }]
const RED_REGIONS: NdiRegionColour[] = Array.from({ length: 8 }, (_, i) => ({ index: i, rgb: { r: 255, g: 0, b: 0 } }))

const ndiStartMock = vi.fn(() => Promise.resolve({ success: true }))
const ndiStopMock = vi.fn(() => Promise.resolve({ success: true }))
let regionsCallback: ((regions: NdiRegionColour[]) => void) | null = null
let healthCallback: ((health: NdiReceiveHealth) => void) | null = null

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
  onNdiReceiveStatus: (cb: (health: NdiReceiveHealth) => void) => {
    healthCallback = cb
    return () => {
      healthCallback = null
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
  healthCallback = null
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
    // Connected but no colours yet: the panel says it is waiting, not
    // driving — "driving" means colours are actually arriving (Mac,
    // 23 Nov 2026: the session claimed to drive with zero frames).
    expect(text()).toContain('waiting for the first video frame')

    expect(regionsCallback).not.toBeNull()
    act(() => {
      regionsCallback?.(RED_REGIONS)
    })
    expect(text()).toContain('Ambience is driving the mapped fixtures.')
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
    expect(text()).toContain('waiting for the first video frame')
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
    expect(text()).toContain('waiting for the first video frame')
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
    expect(text()).toContain('waiting for the first video frame')
    const el2 = document.createElement('div')
    document.body.appendChild(el2)
    secondContainer = el2
    secondRoot = createRoot(el2)
    act(() => {
      secondRoot.render(<NdiAmbiencePanel />)
    })
    await act(async () => {})
    expect(el2.textContent).toContain('waiting for the first video frame')
    expect([...el2.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Stop Ambience')).toBe(true)
  })

  it('shows frames received while waiting for the first frame', async () => {
    // Mac, 23 Nov 2026: the session was "driving" with zero frames and
    // nothing said so. The worker's receive-status heartbeat makes the
    // stall visible: frames received and receiver connections.
    renderPanel()
    await act(async () => {})
    clickButton('Place screen on Preview')
    await act(async () => {
      clickButton('Start Ambience')
    })
    expect(healthCallback).not.toBeNull()
    act(() => {
      healthCallback?.({ framesReceived: 0, connections: 0, lastFrameAt: null, startedAt: Date.now() })
    })
    expect(getNdiReceiveHealth()?.framesReceived).toBe(0)
    expect(text()).toContain('Frames received: 0')
    expect(text()).toContain('Receiver connections: 0')
    expect(text()).toContain('waiting for the first video frame')
    expect(text()).not.toContain('Ambience is driving the mapped fixtures.')
  })

  it('warns when no frames arrive within 10 seconds, with the Tailscale hint for a Tailscale address', async () => {
    renderPanel()
    await act(async () => {})
    clickButton('Place screen on Preview')
    const input = container?.querySelector('input[type="text"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(input, '100.127.255.172:5961')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      clickButton('Start Ambience')
    })
    expect(healthCallback).not.toBeNull()
    act(() => {
      healthCallback?.({ framesReceived: 0, connections: 0, lastFrameAt: null, startedAt: Date.now() - 20_000 })
    })
    expect(text()).toContain('No video frames have arrived')
    expect(text()).toContain('100.127.255.172:5961')
    expect(text()).toContain('Tailscale')
  })

  it('does not warn when frames are flowing', async () => {
    renderPanel()
    await act(async () => {})
    clickButton('Place screen on Preview')
    await act(async () => {
      clickButton('Start Ambience')
    })
    act(() => {
      healthCallback?.({ framesReceived: 12, connections: 1, lastFrameAt: Date.now(), startedAt: Date.now() - 20_000 })
    })
    expect(text()).not.toContain('No video frames have arrived')
  })

  it('offers an adjustable colour transition, default 500 ms', async () => {
    renderPanel()
    await act(async () => {})
    const slider = container?.querySelector('input[aria-label="Colour transition time"]') as HTMLInputElement | null
    expect(slider).not.toBeNull()
    expect(slider?.value).toBe('500')
    expect(text()).toContain('500 ms')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(slider, '1000')
      slider?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(text()).toContain('1000 ms')
    expect(getAmbienceTransitionMs()).toBe(1000)
    setAmbienceTransitionMs(NDI_DEFAULT_TRANSITION_MS)
  })

  it('offers a fixture group picker and scopes ambience to the picked group', async () => {
    act(() => {
      const show = useShowStore.getState().show
      if (!show) throw new Error('no show')
      useShowStore.setState({
        show: {
          ...show,
          fixtureGroups: [
            { id: 'g-front', name: 'Front', parentId: null, fixtureIds: ['f1'] },
            { id: 'g-back', name: 'Back', parentId: null, fixtureIds: ['f2'] }
          ]
        }
      })
    })
    renderPanel()
    await act(async () => {})
    const select = container?.querySelector(
      'select[aria-label="Fixture group for NDI Ambience"]'
    ) as HTMLSelectElement | null
    expect(select).not.toBeNull()
    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual(['All fixtures', 'Front', 'Back'])
    expect(select?.value).toBe('')

    clickButton('Place screen on Preview')
    await act(async () => {
      clickButton('Start Ambience')
    })
    act(() => {
      regionsCallback?.(RED_REGIONS)
    })
    expect(text()).toContain('2 fixtures following an edge')

    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
    const pick = (value: string) =>
      act(() => {
        setter?.call(select, value)
        select?.dispatchEvent(new Event('change', { bubbles: true }))
      })
    pick('g-front')
    expect(getAmbienceFixtureGroup()).toBe('g-front')
    expect(text()).toContain('1 fixture following an edge')
    pick('')
    expect(getAmbienceFixtureGroup()).toBeNull()
    expect(text()).toContain('2 fixtures following an edge')
  })

  it('falls back to all fixtures when the picked group no longer exists', async () => {
    // A stale pick (the group was deleted, or the show changed) drives
    // all fixtures instead of nothing — and the panel says so.
    setAmbienceFixtureGroup('g-gone')
    renderPanel()
    await act(async () => {})
    expect(text()).toContain('That fixture group no longer exists — driving all fixtures.')
    clickButton('Place screen on Preview')
    await act(async () => {
      clickButton('Start Ambience')
    })
    act(() => {
      regionsCallback?.(RED_REGIONS)
    })
    expect(text()).toContain('2 fixtures following an edge')
  })
})
