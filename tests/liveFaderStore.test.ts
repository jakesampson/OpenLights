// Live-canvas fader controls at the store level (Item 4, Jake 27 Nov
// 2026 — LightKey guide ch.11, pp.204, 215–216): the Controls scope
// and Speed Options are stored on the button; switching a control's
// type resizes it to that type's default; a fader at level 0 is
// deactivated — it drops out of the live output entirely, the same
// as a Push Button switched off.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShowDef } from '../src/shared/types'
import { LIVE_CUE_SIZE, LIVE_FADER_HORIZONTAL_SIZE, LIVE_FADER_VERTICAL_SIZE } from '../src/shared/liveObjectDefaults'

const setChannels = vi.fn()

// The renderer store writes through this bridge; provide a stub in Node.
;(globalThis as any).window = { electronAPI: { setChannels } }
;(globalThis as any).requestAnimationFrame = () => 1
;(globalThis as any).cancelAnimationFrame = () => undefined

// Imported after the globals exist.
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { orderedLiveControls } from '../src/renderer/src/lib/cuePriority'
import { liveOutputLevels } from '../src/renderer/src/lib/liveFrames'

const faderShow = (): ShowDef => ({
  id: 'show-fader',
  name: 'Fader Show',
  createdAt: 0,
  updatedAt: 0,
  masterIntensity: 255,
  fixtures: [{ id: 'f1', name: 'Front', type: 'par', channelStart: 1, channels: 4 }],
  cues: [],
  automations: [],
  cueLists: [],
  livePages: [{
    id: 'p',
    name: 'Page',
    fadeMs: 500,
    controls: [
      { id: 'fv', name: 'Spots', type: 'faderVertical', presetIds: [], x: 20, y: 20, width: LIVE_FADER_VERTICAL_SIZE.width, height: LIVE_FADER_VERTICAL_SIZE.height },
      { id: 'fh', name: 'Heads', type: 'faderHorizontal', presetIds: [], x: 100, y: 20, width: LIVE_FADER_HORIZONTAL_SIZE.width, height: LIVE_FADER_HORIZONTAL_SIZE.height }
    ]
  }]
})
const page = () => useShowStore.getState().show!.livePages![0]
const control = (id: string) => page().controls.find((item) => item.id === id)!

beforeEach(() => {
  useShowStore.getState().setShow(faderShow())
})

describe('fader store actions', () => {
  it('stores the Controls scope on the button', () => {
    useShowStore.getState().configureFaderControls('fv', 'dimmer')
    expect(control('fv').faderControls).toBe('dimmer')
    useShowStore.getState().configureFaderControls('fv', 'all')
    expect(control('fv').faderControls).toBe('all')
  })

  it('stores the Speed modifier options on the button', () => {
    useShowStore.getState().configureSpeedModifierOptions('fv', ['sequenceSpeed', 'goboRotationSpeed'])
    expect(control('fv').speedModifierOptions).toEqual(['sequenceSpeed', 'goboRotationSpeed'])
  })

  it('resizes the control to its type default when the type changes', () => {
    useShowStore.getState().configureControlType('fv', 'faderHorizontal')
    expect(control('fv').width).toBe(LIVE_FADER_HORIZONTAL_SIZE.width)
    expect(control('fv').height).toBe(LIVE_FADER_HORIZONTAL_SIZE.height)
    useShowStore.getState().configureControlType('fv', 'push')
    expect(control('fv').width).toBe(LIVE_CUE_SIZE.width)
    expect(control('fv').height).toBe(LIVE_CUE_SIZE.height)
    useShowStore.getState().configureControlType('fh', 'faderVertical')
    expect(control('fh').width).toBe(LIVE_FADER_VERTICAL_SIZE.width)
    expect(control('fh').height).toBe(LIVE_FADER_VERTICAL_SIZE.height)
  })

  it('deactivates a fader at level 0 — it leaves the live output', () => {
    const live = () => {
      const state = useShowStore.getState()
      return orderedLiveControls(state.show?.livePages, liveOutputLevels(state.show?.livePages, state.activeLiveValues), {})
    }
    useShowStore.getState().setLiveValue('fv', 128)
    expect(live()).toHaveLength(1)
    useShowStore.getState().setLiveValue('fv', 0)
    expect(live()).toHaveLength(0)
  })
})
