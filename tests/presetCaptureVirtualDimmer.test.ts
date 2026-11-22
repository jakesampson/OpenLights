// Jake, 22 Nov 2026 — a dimmer preset captured on a virtual-dimmer
// fixture (colour channels but no dimmer channel — e.g. a Q12BT) must
// hold the intensity. The Dimmer fader writes an intensity value for
// such a fixture and the output scales its LED channels by it, but the
// capture filter kept only channel-map attributes, so 'intensity' was
// dropped and the preset held nothing for the fixture. Red + 100% then
// gave no output on it — in the palette or on a Live pad — even though
// the same presets lit hardware-dimmer fixtures fine. The fix is in
// capturableAttributes (showStore.ts): 'intensity' is capturable for a
// virtual-dimmer fixture.
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { act } from 'react-dom/test-utils'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import { effectiveIntensityLevels, liveIntensityLevels, withEffectiveIntensity } from '../src/renderer/src/lib/effectiveIntensity'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// p1: a par with a hardware dimmer (intensity channel 1).
// q1: a Q12BT — rgba-4ch, channels 20–23, NO intensity channel, so its
// dimmer is virtual: the output scales its LED channels by intensity.
function seedShow() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [
      { id: 'p1', name: 'Par 1', type: 'par', channelStart: 1, channels: 4 },
      { id: 'q1', name: 'Q12BT 1', type: 'rgba-4ch', channelStart: 20, channels: 4 }
    ],
    cues: [],
    fixtureGroups: []
  }))
  act(() => {
    useShowStore.setState({
      presets: [],
      selectedFixtureIds: ['p1', 'q1'],
      activePresetIds: [],
      manualOverrides: {},
      activeCueId: null
    })
  })
}

function captureDimmer() {
  act(() => {
    useShowStore.setState({ manualOverrides: { p1: { intensity: 255 }, q1: { intensity: 255 } } })
  })
  return useShowStore.getState().capturePresetFromLook(false)
}

function captureColour() {
  act(() => {
    useShowStore.setState({ manualOverrides: { p1: { red: 255 }, q1: { red: 255 } } })
  })
  return useShowStore.getState().capturePresetFromLook(false)
}

describe('virtual-dimmer preset capture', () => {
  beforeEach(() => seedShow())

  it('a plain dimmer capture holds the intensity for the virtual-dimmer fixture', () => {
    const created = captureDimmer()
    expect(created?.name).toBe('Full On')
    const preset = useShowStore.getState().presets.find((p) => p.id === created?.id)
    expect(preset?.fixtureValues.p1).toEqual({ intensity: 255 })
    expect(preset?.fixtureValues.q1).toEqual({ intensity: 255 })
  })

  it('a colour capture holds the colour for the virtual-dimmer fixture', () => {
    const created = captureColour()
    expect(created?.name).toBe('Red')
    const preset = useShowStore.getState().presets.find((p) => p.id === created?.id)
    // Jake, 22 Nov 2026: a red capture writes the other colour values
    // as zero in the file itself — the preset means red, not "red plus
    // whatever the layer underneath says". Amber is a separate LED and
    // is not filled.
    expect(preset?.fixtureValues.q1).toEqual({ red: 255, green: 0, blue: 0 })
    expect('amber' in (preset?.fixtureValues.q1 ?? {})).toBe(false)
  })

  it('an amber-only capture does not zero the base colour', () => {
    act(() => {
      useShowStore.setState({ manualOverrides: { q1: { amber: 200 } } })
    })
    const created = useShowStore.getState().capturePresetFromLook(false)
    expect(created?.name).toBe('Amber')
    const preset = useShowStore.getState().presets.find((p) => p.id === created?.id)
    expect(preset?.fixtureValues.q1).toEqual({ amber: 200 })
  })

  it('Red + Full On combine to red at full on the virtual-dimmer fixture', () => {
    const red = captureColour()
    const full = captureDimmer()
    const state = useShowStore.getState()
    const presets = state.presets
    act(() => {
      useShowStore.getState().togglePreset(red!.id)
      useShowStore.getState().togglePreset(full!.id)
    })
    const active = useShowStore.getState()
    expect(active.activePresetIds).toContain(red!.id)
    expect(active.activePresetIds).toContain(full!.id)
    const levels = effectiveIntensityLevels({
      cueValues: {},
      activePresetIds: active.activePresetIds,
      presets,
      manualOverrides: {}
    })
    expect(levels.q1).toBe(255)
    expect(levels.p1).toBe(255)
    const redPreset = presets.find((p) => p.id === red!.id)!
    const frame = computeCueChannels(
      active.show!.fixtures,
      { id: redPreset.id, name: redPreset.name, fadeMs: 0, fixtureValues: withEffectiveIntensity(redPreset.fixtureValues, levels) },
      255
    )
    // computeCueChannels returns a sparse record keyed by 1-based
    // channel number. Par: intensity channel 1, red channel 2.
    // Q12BT: red is channel 20; green and blue are explicit zeros now
    // (the captured red preset carries them), amber stays unwritten.
    expect(frame[1]).toBe(255)
    expect(frame[2]).toBe(255)
    expect(frame[20]).toBe(255)
    expect(frame[21]).toBe(0)
    expect(frame[22]).toBe(0)
    expect(frame[23]).toBeUndefined()
  })

  it('a snapshot keeps the virtual dimmer alongside the preset colour', () => {
    const red = captureColour()
    act(() => {
      useShowStore.getState().togglePreset(red!.id)
      useShowStore.setState({ manualOverrides: { p1: { intensity: 230 }, q1: { intensity: 230 } } })
    })
    const created = useShowStore.getState().capturePresetFromLook(true)
    const preset = useShowStore.getState().presets.find((p) => p.id === created?.id)
    expect(preset?.fixtureValues.q1).toEqual({ red: 255, green: 0, blue: 0, intensity: 230 })
    expect(preset?.fixtureValues.p1).toEqual({ red: 255, green: 0, blue: 0, intensity: 230 })
  })

  it('the old cue-based capture also keeps the virtual dimmer', () => {
    act(() => {
      const base = useShowStore.getState().show!
      useShowStore.setState({
        show: {
          ...base,
          cues: [{ id: 'c1', name: 'Cue', presetIds: [], fixtureValues: { p1: { intensity: 255 }, q1: { intensity: 255 } } }]
        },
        cues: [{ id: 'c1', name: 'Cue', presetIds: [], fixtureValues: { p1: { intensity: 255 }, q1: { intensity: 255 } } }],
        activeCueId: 'c1'
      })
    })
    useShowStore.getState().capturePreset('Dim', 'intensity')
    const preset = useShowStore.getState().presets[0]
    expect(preset?.fixtureValues.q1).toEqual({ intensity: 255 })
    expect(preset?.fixtureValues.p1).toEqual({ intensity: 255 })
  })
})

describe('live pad intensity levels', () => {
  // Jake, 22 Nov 2026 — two Live pads must combine on a virtual-dimmer
  // fixture just like two palette presets: the Full On pad's dimmer
  // lifts the Red pad's colour, even though the Full On pad writes no
  // channel for the fixture. The palette path does this via
  // effectiveIntensityLevels; the live layer needs its own copy
  // (liveIntensityLevels) because live controls are not sources for
  // the base look.
  const presets = [
    { id: 'red', name: 'Red', category: 'color', fixtureValues: { p1: { red: 255 }, q1: { red: 255 } } },
    { id: 'full', name: 'Full On', category: 'intensity', fixtureValues: { p1: { intensity: 255 }, q1: { intensity: 255 } } },
    { id: 'half', name: 'Half', category: 'intensity', fixtureValues: { p1: { intensity: 128 }, q1: { intensity: 128 } } }
  ]
  const redPad = { id: 'lc-red', name: 'Red', type: 'toggle' as const, presetIds: ['red'] }
  const fullPad = { id: 'lc-full', name: 'Full On', type: 'toggle' as const, presetIds: ['full'] }
  const halfPad = { id: 'lc-half', name: 'Half', type: 'toggle' as const, presetIds: ['half'] }
  const fixtures = [
    { id: 'p1', name: 'Par 1', type: 'par', channelStart: 1, channels: 4 },
    { id: 'q1', name: 'Q12BT 1', type: 'rgba-4ch', channelStart: 20, channels: 4 }
  ] as never

  it('two pressed pads together give the dimmer pad’s intensity for both fixtures', () => {
    const levels = liveIntensityLevels({
      controls: [redPad, fullPad],
      levels: { 'lc-red': 255, 'lc-full': 255 },
      presets,
      cues: [],
      fixtures
    })
    expect(levels).toEqual({ p1: 255, q1: 255 })
  })

  it('a pad pressed at half level lends half its intensity', () => {
    const levels = liveIntensityLevels({
      controls: [redPad, fullPad],
      levels: { 'lc-red': 255, 'lc-full': 128 },
      presets,
      cues: [],
      fixtures
    })
    expect(levels.q1).toBe(128)
  })

  it('an unpressed pad lends nothing', () => {
    const levels = liveIntensityLevels({
      controls: [redPad, fullPad],
      levels: { 'lc-red': 255 },
      presets,
      cues: [],
      fixtures
    })
    expect(levels).toEqual({})
  })

  it('later pads win, as in the patch build', () => {
    const levels = liveIntensityLevels({
      controls: [fullPad, halfPad],
      levels: { 'lc-full': 255, 'lc-half': 255 },
      presets,
      cues: [],
      fixtures
    })
    expect(levels.q1).toBe(128)
  })

  it('the Red pad’s colour resolves against the Full On pad’s intensity to red at full on the Q fixture', () => {
    const levels = liveIntensityLevels({
      controls: [redPad, fullPad],
      levels: { 'lc-red': 255, 'lc-full': 255 },
      presets,
      cues: [],
      fixtures
    })
    const redPreset = presets[0]
    const frame = computeCueChannels(
      fixtures,
      { id: redPreset.id, name: redPreset.name, fadeMs: 0, fixtureValues: withEffectiveIntensity(redPreset.fixtureValues, levels) },
      255
    )
    expect(frame[20]).toBe(255)
    expect(frame[2]).toBe(255)
  })
})
