// Virtual-dimmer fanning (Jake, 26 Nov 2026 — found while probing the
// cuelist path): "Add Dimmer Fanning…" on Q12BTs silently fanned Red
// instead of Dimmer, and evaluateFan skipped every fixture for an
// intensity fan, so a fanned dimmer cue came out dark. A colour fixture
// with no dimmer channel still has a Dimmer — the virtual dimmer — so the
// fan HUD offers it (same rule as the effects chooser) and the fan writes
// intensity values the cue layer fans to the colour channels at output.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import type { ShowDef } from '../src/shared/types'
import { fannableProperties } from '../src/renderer/src/lib/fanningHud'
import { evaluateFan } from '../src/renderer/src/lib/fanning'

const engine = new DMXEngine()
const frames: Array<FrameRequestCallback | null> = []
vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = null })
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { configureEffects, sendImmediate } from '../src/renderer/src/lib/output'

// Three virtual-dimmer Q12BTs (rgba-4ch, no intensity channel) at 1, 5, 9.
const fixtures = [
  { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 1, channels: 4 },
  { id: 'q2', name: 'Q2', type: 'rgba-4ch', channelStart: 5, channels: 4 },
  { id: 'q3', name: 'Q3', type: 'rgba-4ch', channelStart: 9, channels: 4 },
] as ShowDef['fixtures']
const preferences = { defaultFadeMs: 1000, pageFadeMs: 500, theme: 'dark', dmxProtocol: 'open-dmx-usb' } as ShowDef['preferences']

function makeShow(overrides: Partial<ShowDef> = {}): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures, cues: [], automations: [], preferences, ...overrides,
  }
}

function step(time: number) {
  let tick: FrameRequestCallback | undefined
  while (frames.length) {
    tick = frames.pop() ?? undefined
    if (tick) break
  }
  if (tick) tick(time)
}

beforeEach(() => {
  frames.length = 0
  configureEffects({ fixtures })
  sendImmediate({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 })
  frames.length = 0
})

describe('virtual-dimmer fanning', () => {
  it('offers Dimmer for virtual-dimmer fixtures, exactly once', () => {
    const props = fannableProperties(fixtures)
    const dimmers = props.filter((c) => c.attribute === 'intensity')
    expect(dimmers).toHaveLength(1)
    expect(dimmers[0].propertyType).toBe('intensity')
    expect(dimmers[0].min).toBe(0)
    expect(dimmers[0].max).toBe(255)
    // The colour channels and the synthetic Colour entry are still there.
    expect(props.some((c) => c.attribute === 'red')).toBe(true)
    expect(props.some((c) => c.attribute === 'color')).toBe(true)
  })

  it('does not duplicate Dimmer for fixtures with a real intensity channel', () => {
    const wash = [{ id: 'w1', name: 'W1', type: 'led-wash', channelStart: 1, channels: 7 }] as ShowDef['fixtures']
    const props = fannableProperties(wash)
    expect(props.filter((c) => c.attribute === 'intensity')).toHaveLength(1)
  })

  it('evaluates an intensity fan on virtual-dimmer fixtures', () => {
    const values = evaluateFan(fixtures, {
      id: 'fan-1', attribute: 'intensity', fixtureIds: ['q1', 'q2', 'q3'],
      mode: 'linear', order: 'selection', start: 0, end: 255,
    })
    expect(values).toEqual({
      q1: { intensity: 0 },
      q2: { intensity: 128 },
      q3: { intensity: 255 },
    })
  })

  it('saving a dimmer fan on Q12BTs lights them as overrides, minting no cue', () => {
    // Jake, 26 Nov 2026: a plain Design fan is a clearable override,
    // not a cue — the fanned intensity rides the overrides layer and
    // lights the Q12BTs (default blue at the fanned dimmer) exactly
    // as the old minted cue did, without creating one.
    const store = useShowStore.getState()
    store.setShow(makeShow())
    store.saveFan({
      id: 'fan-1', attribute: 'intensity', fixtureIds: ['q1', 'q2', 'q3'],
      mode: 'linear', order: 'selection', start: 0, end: 255,
    })
    const state = useShowStore.getState()
    expect(state.cues).toHaveLength(0)
    expect(state.activeCueId).toBeNull()
    expect(state.manualFans).toHaveLength(1)
    expect(state.manualOverrides).toEqual({
      q1: { intensity: 0 },
      q2: { intensity: 128 },
      q3: { intensity: 255 },
    })
    // Land the base look the overrides ride on: the middle and last
    // fixtures light (default blue at the fanned dimmer), the first
    // stays dark.
    store.refreshBaseOutput()
    step(performance.now() + 2000)
    expect(engine.getChannel(3)).toBe(0)
    expect(engine.getChannel(7)).toBe(128)
    expect(engine.getChannel(11)).toBe(255)
  })
})
