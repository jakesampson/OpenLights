import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShowDef } from '../src/shared/types'

const setChannels = vi.fn()

;(globalThis as any).window = { electronAPI: { setChannels } }
;(globalThis as any).requestAnimationFrame = () => 1
;(globalThis as any).cancelAnimationFrame = () => undefined

import { useShowStore } from '../src/renderer/src/stores/showStore'

function makeShow(startupMode: 'none' | 'restore' = 'none'): ShowDef {
  return {
    id: 'show-startup',
    name: 'Startup Show',
    createdAt: 0,
    updatedAt: 0,
    masterIntensity: 255,
    fixtures: [{ id: 'f1', name: 'Front', type: 'par', channelStart: 1, channels: 4 }],
    cues: [],
    automations: [],
    cueLists: [],
    startup: { mode: startupMode },
    livePages: [
      {
        id: 'page1',
        name: 'Page 1',
        fadeMs: 0,
        controls: [
          { id: 'c-start', name: 'House', type: 'toggle', presetIds: [], activateAtStartup: true, x: 0, y: 0 },
          { id: 'c-plain', name: 'Plain', type: 'toggle', presetIds: [], x: 100, y: 0 }
        ],
        annotations: []
      },
      {
        id: 'page2',
        name: 'Page 2',
        fadeMs: 0,
        controls: [
          { id: 'c-other', name: 'Other Page', type: 'toggle', presetIds: [], activateAtStartup: true, x: 0, y: 0 }
        ],
        annotations: []
      }
    ]
  }
}

describe('cue Activate at startup (Guide ch.11, p.204)', () => {
  beforeEach(() => {
    setChannels.mockClear()
  })

  it('activates flagged cues on the visible page when a project opens', () => {
    useShowStore.getState().setShow(makeShow('none'))
    const state = useShowStore.getState()
    expect(state.activeLivePageId).toBe('page1')
    expect(state.activeLiveValues['c-start']).toBe(255)
    expect(state.activeLiveValues['c-plain']).toBeUndefined()
  })

  it('does not activate flagged cues on other pages', () => {
    useShowStore.getState().setShow(makeShow('none'))
    expect(useShowStore.getState().activeLiveValues['c-other']).toBeUndefined()
  })

  it('is ignored when the startup mode restores the last state', () => {
    useShowStore.getState().setShow(makeShow('restore'))
    expect(useShowStore.getState().activeLiveValues['c-start']).toBeUndefined()
  })

  it('applies exclusivity: two flagged cues in one exclusive frame end with one lit', () => {
    const show = makeShow('none')
    const page = show.livePages![0]
    page.annotations = [{ id: 'frame1', type: 'frame', text: 'Frame', x: 0, y: 0, width: 400, height: 200, frame: { exclusive: true, intensity: 100, speed: 100 } }]
    page.controls[1].activateAtStartup = true
    page.controls[1].x = 10
    page.controls[1].y = 10
    useShowStore.getState().setShow(show)
    const values = useShowStore.getState().activeLiveValues
    // The second flagged cue activates last and releases the first.
    expect(values['c-plain']).toBe(255)
    expect(values['c-start']).toBeUndefined()
  })
})
