// The "Full" first preset (Jake, 26 Nov 2026): new projects start with
// ZERO cues — instead, finishing the setup wizard creates a first preset
// named "Full" holding the old Home cue's values (dimmer full, pan/tilt
// at home, colour unset so the default colour applies) and starts it
// ACTIVE in the palette, so the rig still comes on full at the start and
// he turns it off by clicking "Full" in the palette.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import type { ShowDef } from '../src/shared/types'

const engine = new DMXEngine()
const frames: Array<FrameRequestCallback | null> = []
vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = null })
import { useShowStore, collectInlineCues, activeCueId } from '../src/renderer/src/stores/showStore'
import { configureEffects, sendImmediate } from '../src/renderer/src/lib/output'

// Virtual-dimmer Q12BT (rgba-4ch, no intensity channel) at 1-4; a
// real-dimmer wash (led-wash, intensity first) at 5-11.
const fixtures = [
  { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 1, channels: 4 },
  { id: 'w1', name: 'W1', type: 'led-wash', channelStart: 5, channels: 7 },
] as ShowDef['fixtures']
const preferences = { defaultFadeMs: 1000, pageFadeMs: 500, theme: 'dark', dmxProtocol: 'open-dmx-usb' } as ShowDef['preferences']

function makeShow(overrides: Partial<ShowDef> = {}): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures,
    automations: [],
    preferences,
    ...overrides,
  }
}

/** Run the latest scheduled frame once, at the given time. */
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
  sendImmediate({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 })
  frames.length = 0
})

function finishWizard() {
  const store = useShowStore.getState()
  store.setShow(makeShow())
  store.startSetupWizard()
  store.setSetupWizardStep('done')
  store.finishSetupWizard()
  return useShowStore.getState()
}

describe('wizard "Full" preset', () => {
  it('creates exactly one preset, "Full", with full values for every fixture, and no cue', () => {
    const state = finishWizard()
    expect(state.setupWizardStep).toBeNull()
    expect(collectInlineCues(state.show, state.cueLists)).toHaveLength(0)
    expect(activeCueId(state)).toBeNull()
    expect(state.presets).toHaveLength(1)
    const full = state.presets[0]
    expect(full.name).toBe('Full')
    expect(full.category).toBe('intensity')
    // The old Home cue's values as preset values: dimmer full, pan/tilt
    // at home where the fixture has them, colour unset.
    expect(full.fixtureValues).toEqual({
      q1: { intensity: 255 },
      w1: { intensity: 255 },
    })
  })

  it('starts active, so the rig is full from the start', () => {
    const state = finishWizard()
    const full = state.presets[0]
    expect(state.activePresetIds).toEqual([full.id])
    // Land the fade the activation starts.
    step(performance.now() + 2000)
    // Real-dimmer wash at full; the virtual-dimmer Q12BT shows the
    // default blue at full (colour unset in the preset).
    expect(engine.getChannel(5)).toBe(255)
    expect(engine.getChannel(1)).toBe(0)
    expect(engine.getChannel(3)).toBe(255)
    expect(engine.getChannel(6)).toBe(0)
    expect(engine.getChannel(8)).toBe(255)
  })

  it('clicking it in the palette turns the rig off, and back on again', () => {
    const state = finishWizard()
    const full = state.presets[0]
    step(performance.now() + 2000)
    expect(engine.getChannel(5)).toBe(255)
    // Palette toggle off (the same togglePreset the palette uses).
    useShowStore.getState().togglePreset(full.id)
    expect(useShowStore.getState().activePresetIds).toEqual([])
    step(performance.now() + 2000)
    // Dark: the real dimmer is closed and the virtual dimmer fanned to
    // zero. The wash's blue channel still reads 255 — that is the
    // default blue underneath (dimmer default 0, colour default blue),
    // and with intensity 0 the fixture itself is dark.
    expect(engine.getChannel(5)).toBe(0)
    expect(engine.getChannel(3)).toBe(0)
    expect(engine.getChannel(8)).toBe(255)
    // And back on.
    useShowStore.getState().togglePreset(full.id)
    expect(useShowStore.getState().activePresetIds).toEqual([full.id])
    step(performance.now() + 2000)
    expect(engine.getChannel(5)).toBe(255)
    expect(engine.getChannel(3)).toBe(255)
  })

  it('is not created twice, and not created with no fixtures', () => {
    // A second wizard finish (e.g. re-running setup on the same show)
    // must not mint a second "Full".
    finishWizard()
    const store = useShowStore.getState()
    store.startSetupWizard()
    store.setSetupWizardStep('done')
    store.finishSetupWizard()
    expect(useShowStore.getState().presets).toHaveLength(1)
    expect(useShowStore.getState().presets[0].name).toBe('Full')

    // No fixtures, no values to hold: no preset at all.
    store.setShow(makeShow({ fixtures: [] }))
    store.startSetupWizard()
    store.setSetupWizardStep('done')
    store.finishSetupWizard()
    expect(useShowStore.getState().presets).toHaveLength(0)
  })
})
