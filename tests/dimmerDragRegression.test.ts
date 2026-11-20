import { describe, expect, it, vi } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import type { ShowDef } from '../src/shared/types'

const engine = new DMXEngine()
const frames: FrameRequestCallback[] = []
vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
vi.stubGlobal('cancelAnimationFrame', () => {})
import { useShowStore } from '../src/renderer/src/stores/showStore'

// Jake, 20 Nov 2026: patch a fixture, drag the Dimmer up, and no light
// appears in the Preview — the wheel shows blue, but that blue is not
// actually sent until the wheel is clicked. The root cause was the frame
// composer: the base look is a full-frame patch, so the defaults layer
// never reaches the frame, and the cue's own fill scales the default
// blue by an intensity the cue never set (0). The fix merges the
// effective intensity — the dimmer the fixture is actually at, from the
// highest layer that defines one — into the base look, so a dimmer drag
// alone brings up blue. In the app the override effect calls
// refreshBaseOutput on every manual-override change; the store test
// calls it directly, which is exactly that effect's job.
function dragDimmerAndRefresh(fixtureId: string, intensity: number) {
  useShowStore.getState().selectFixtures([fixtureId])
  useShowStore.getState().updateSelectedFixtures({ intensity }, true)
  useShowStore.getState().refreshBaseOutput()
}

describe('dimmer drag brings up light without touching the wheel', () => {
  it('lights a virtual-dimmer fixture (RGBA, no dimmer channel) from the Home cue', () => {
    const show: ShowDef = {
      id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
      // A newly patched fixture lands in every cue with its channel
      // defaults (addProfileFixtures) — blue underneath, no intensity.
      fixtures: [{ id: 'rgba', name: 'Q12BT', type: 'rgba-4ch', channelStart: 1, channels: 4 }],
      cues: [{ id: 'home', name: 'Home', fadeMs: 0, fixtureValues: { rgba: { red: 0, green: 0, blue: 255, amber: 0 } } }],
      automations: []
    }
    useShowStore.getState().setShow(show)
    useShowStore.getState().activateCue('home')
    // A fresh fixture starts dark (Jake's 19 Nov 2026 reversal): the
    // dimmer defaults to 0 even though the default colour is blue.
    expect(Array.from(engine.snapshot().slice(0, 4))).toEqual([0, 0, 0, 0])
    dragDimmerAndRefresh('rgba', 200)
    // RGBA channels are R, G, B, A — the blue channel (index 2) comes
    // up at the dragged dimmer, scaled from the default blue.
    expect(engine.snapshot()[2]).toBe(200)
    expect(engine.snapshot()[0]).toBe(0)
    expect(engine.snapshot()[1]).toBe(0)
  })

  it('lights a real-dimmer fixture (Generic PAR) from the Home cue', () => {
    const show: ShowDef = {
      id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
      fixtures: [{ id: 'par', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }],
      cues: [{ id: 'home', name: 'Home', fadeMs: 0, fixtureValues: { par: { intensity: 0, red: 0, green: 0, blue: 255 } } }],
      automations: []
    }
    useShowStore.getState().setShow(show)
    useShowStore.getState().activateCue('home')
    // A fresh fixture starts dark (Jake's 19 Nov 2026 reversal): the
    // dimmer channel is 0. The blue channel already carries 255 — for
    // a real-dimmer fixture the colour channels are not scaled by the
    // dimmer; the dimmer channel itself gates the light.
    expect(engine.snapshot()[0]).toBe(0)
    expect(engine.snapshot()[3]).toBe(255)
    dragDimmerAndRefresh('par', 200)
    // PAR channels are intensity, R, G, B — the dimmer channel comes
    // up to the dragged value and the blue channel stays at 255.
    expect(engine.snapshot()[0]).toBe(200)
    expect(engine.snapshot()[3]).toBe(255)
  })

  it('lights a fixture in an opened project with no cue active', () => {
    const show: ShowDef = {
      id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
      fixtures: [{ id: 'rgba', name: 'Q12BT', type: 'rgba-4ch', channelStart: 1, channels: 4 }],
      // Opening a project leaves no cue active (setShow resets
      // activeCueId), so the base look is the defaults patch.
      cues: [{ id: 'home', name: 'Home', fadeMs: 0, fixtureValues: { rgba: { red: 0, green: 0, blue: 255, amber: 0 } } }],
      automations: []
    }
    useShowStore.getState().setShow(show)
    expect(Array.from(engine.snapshot().slice(0, 4))).toEqual([0, 0, 0, 0])
    dragDimmerAndRefresh('rgba', 200)
    expect(engine.snapshot()[2]).toBe(200)
  })
})
