// @vitest-environment jsdom
// NDI Ambience live video preview on the Screen (Jake, 23 Nov 2026):
// the worker's 360p thumbnail rides to the renderer as a JPEG data URL
// and the Screen object shows it as a live picture, fading in when
// Ambience comes on and out when it stops. The worker/main JPEG path
// itself is only proven by the real-app probe — here the session
// subscription and the Screen rendering/fade are covered with a
// mocked electronAPI.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { StageObjectLayer } from '../src/renderer/src/components/StageObjects'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { resetAmbienceState } from '../src/renderer/src/lib/ndiAmbience'
import {
  getNdiFrame,
  initNdiSession,
  resetNdiSession,
  setSessionActive
} from '../src/renderer/src/lib/ndiSession'
import type { StageObject } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FRAME_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
let frameCallback: ((dataUrl: string) => void) | null = null

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  setChannels: () => {},
  getChannels: () => Promise.resolve([]),
  ndiVersion: () => Promise.resolve({ available: true, version: 'NDI SDK 6.3.2.0' }),
  ndiListSources: () => Promise.resolve({ sources: [] }),
  ndiStart: () => Promise.resolve({ success: true }),
  ndiStop: () => Promise.resolve({ success: true }),
  onNdiRegions: () => () => {},
  onNdiReceiveStatus: () => () => {},
  onNdiFrame: (cb: (dataUrl: string) => void) => {
    frameCallback = cb
    return () => {
      frameCallback = null
    }
  },
  onNdiStatus: () => () => {}
}

const SCREEN: StageObject = {
  id: 'scr',
  name: 'Screen',
  kind: 'screen',
  x: 400,
  y: 170,
  width: 320,
  height: 180,
  rotation: 0
}

let container: HTMLDivElement | undefined
let rootNode: Root | undefined
let defaultShow: ReturnType<typeof useShowStore.getState>['show']

function renderLayer() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => {
    rootNode.render(<StageObjectLayer editing={false} selectedId={null} select={() => {}} />)
  })
  return el
}

const image = () => container?.querySelector('image') ?? null
const label = () => container?.querySelector('text') ?? null

async function nextFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

beforeEach(() => {
  defaultShow = useShowStore.getState().show
  const base = defaultShow
  if (!base) throw new Error('store has no default show')
  act(() => {
    useShowStore.setState({ show: { ...base, id: 'ndi-video-test', stageObjects: [SCREEN] }, master: 255 })
  })
  resetAmbienceState()
  resetNdiSession()
  frameCallback = null
  initNdiSession()
})

afterEach(() => {
  act(() => {
    rootNode?.unmount()
  })
  container?.remove()
  container = undefined
  rootNode = undefined
  act(() => {
    useShowStore.setState({ show: defaultShow })
  })
  resetAmbienceState()
  resetNdiSession()
})

describe('live video preview on the Screen', () => {
  it('holds the latest frame in the session and clears it on reset', () => {
    expect(getNdiFrame()).toBeNull()
    expect(frameCallback, 'onNdiFrame subscribed').not.toBeNull()
    act(() => {
      frameCallback?.(FRAME_URL)
    })
    expect(getNdiFrame()).toBe(FRAME_URL)
    resetNdiSession()
    expect(getNdiFrame()).toBeNull()
  })

  it('shows the plain Screen rectangle with no frame yet', () => {
    renderLayer()
    expect(image()).toBeNull()
    expect(label()?.textContent).toBe('Screen')
    expect(label()?.getAttribute('opacity')).toBe('1')
  })

  it('fades the live picture in when Ambience is active and out when it stops', async () => {
    renderLayer()
    act(() => {
      setSessionActive(true, 'panel')
      frameCallback?.(FRAME_URL)
    })
    const pic = image()
    expect(pic?.getAttribute('href')).toBe(FRAME_URL)
    // Mounted at opacity 0 — the first picture glides in, not pops in.
    expect(pic?.getAttribute('opacity')).toBe('0')
    expect(pic?.getAttribute('style')).toContain('opacity 500ms')
    await nextFrame()
    expect(image()?.getAttribute('opacity')).toBe('1')
    // The "Screen" label fades out with the picture fading in.
    expect(label()?.getAttribute('opacity')).toBe('0')
    act(() => {
      setSessionActive(false)
    })
    expect(image()?.getAttribute('opacity')).toBe('0')
    expect(label()?.getAttribute('opacity')).toBe('1')
  })

  it('does not show the picture while Ambience is off, even with a frame held', () => {
    renderLayer()
    act(() => {
      frameCallback?.(FRAME_URL)
    })
    expect(image()?.getAttribute('opacity')).toBe('0')
    expect(label()?.getAttribute('opacity')).toBe('1')
  })
})
