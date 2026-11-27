// Live-canvas fader controls (Item 4, Jake 27 Nov 2026 — LightKey
// guide ch.11, pp.179, 204, 215–216): a fader's level scales the
// properties its Controls scope names, the rest apply at full master;
// Shutter / Gobo flip at the 50% midpoint instead of fading; drag to
// 0% deactivates the cue. The Speed modifier's Options menu lists
// only the aspects that apply to the cue (guide pp.206–207).
import { describe, expect, it } from 'vitest'
import {
  faderControlOptions, faderControlsDimmer, faderControlsDropdownOptions, faderControlsValue, splitFaderValues
} from '../src/renderer/src/lib/liveFaderControls'
import { applicableSpeedOptions } from '../src/renderer/src/lib/liveModifiers'
import type { CueDef, EffectDef, FixtureDef, LiveControl, PresetDef, SequenceDef } from '../src/shared/types'

const fixtures: FixtureDef[] = [
  { id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 },
  { id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 5, channels: 8 }
]
const control = (patch: Partial<LiveControl> = {}): LiveControl => ({ id: 'c', name: 'C', type: 'faderVertical', presetIds: [], ...patch })

describe('splitFaderValues', () => {
  const values = { d1: { intensity: 255, red: 200, pan: 100 } }

  it('scales every property linearly with All Properties at 50%', () => {
    // 50% must read as 50% — not ~25% (the old double scale: the
    // level was applied once by liveIntensityLevels and again by
    // scaledMaster).
    const { scaled, full } = splitFaderValues(values, 'all', 128)
    expect(scaled).toEqual({ d1: { intensity: 128, red: 100, pan: 50 } })
    expect(full).toEqual({})
  })

  it('scales only Dimmer when confined to Dimmer, the rest at full', () => {
    const { scaled, full } = splitFaderValues(values, 'dimmer', 128)
    expect(scaled).toEqual({ d1: { intensity: 128 } })
    expect(full).toEqual({ d1: { red: 200, pan: 100 } })
  })

  it('scales only Color when confined to Color, Dimmer at full', () => {
    const { scaled, full } = splitFaderValues(values, 'color', 128)
    expect(scaled).toEqual({ d1: { red: 100 } })
    expect(full).toEqual({ d1: { intensity: 255, pan: 100 } })
  })

  it('drops Shutter / Gobo below the midpoint and flips them on unscaled above it', () => {
    const withShutter = { d1: { intensity: 255, shutter: 200, gobo: 90 } }
    const below = splitFaderValues(withShutter, 'all', 100)
    expect(below.scaled).toEqual({ d1: { intensity: 100 } })
    expect(below.full).toEqual({})
    const above = splitFaderValues(withShutter, 'all', 128)
    expect(above.scaled).toEqual({ d1: { intensity: 128, shutter: 200, gobo: 90 } })
  })

  it('leaves Shutter / Gobo alone when the fader does not govern them', () => {
    const withShutter = { d1: { intensity: 255, shutter: 200 } }
    const { scaled, full } = splitFaderValues(withShutter, 'dimmer', 100)
    expect(scaled).toEqual({ d1: { intensity: 100 } })
    expect(full).toEqual({ d1: { shutter: 200 } })
  })

  it('at full level the split is a no-op partition', () => {
    const { scaled, full } = splitFaderValues(values, 'all', 255)
    expect(scaled).toEqual({ d1: { intensity: 255, red: 200, pan: 100 } })
    expect(full).toEqual({})
  })
})

describe('fader Controls options', () => {
  it('offers only the properties the cue defines, with a non-zero value', () => {
    const presets: PresetDef[] = [{ id: 'p1', name: 'Red', category: 'color', fixtureValues: { d1: { intensity: 255, red: 255 } } }]
    const keys = faderControlOptions(control({ presetIds: ['p1'] }), [], presets, fixtures).map((prop) => prop.key)
    expect(keys).toEqual(['dimmer', 'color'])
  })

  it('does not count a Dimmer at 0 as a property the fader can scale', () => {
    const presets: PresetDef[] = [{ id: 'p1', name: 'Red', category: 'color', fixtureValues: { d1: { intensity: 0, red: 255 } } }]
    const keys = faderControlOptions(control({ presetIds: ['p1'] }), [], presets, fixtures).map((prop) => prop.key)
    expect(keys).toEqual(['color'])
  })

  it('lists All Properties first, then every property with only the defined ones enabled', () => {
    const presets: PresetDef[] = [{ id: 'p1', name: 'Red', category: 'color', fixtureValues: { d1: { intensity: 255, red: 255 } } }]
    const options = faderControlsDropdownOptions(control({ presetIds: ['p1'] }), [], presets, fixtures)
    expect(options[0]).toEqual({ value: 'all', label: 'All Properties', enabled: true })
    const byValue = Object.fromEntries(options.map((opt) => [opt.value, opt]))
    expect(byValue.dimmer.enabled).toBe(true)
    expect(byValue.color.enabled).toBe(true)
    expect(byValue.pan.enabled).toBe(false)
    expect(byValue.iris.enabled).toBe(false)
    expect(byValue.fog.enabled).toBe(false)
  })

  it('reads the stored Controls value, defaulting to all', () => {
    expect(faderControlsValue(control({}))).toBe('all')
    expect(faderControlsValue(control({ faderControls: 'pan' }))).toBe('pan')
  })

  it('only All Properties and Dimmer control the dimmer', () => {
    expect(faderControlsDimmer(control({}))).toBe(true)
    expect(faderControlsDimmer(control({ faderControls: 'dimmer' }))).toBe(true)
    expect(faderControlsDimmer(control({ faderControls: 'color' }))).toBe(false)
    expect(faderControlsDimmer(control({ faderControls: 'pan' }))).toBe(false)
  })
})

describe('applicableSpeedOptions', () => {
  const manual: SequenceDef = { id: 's1', name: 'Chase', steps: [], order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1 }
  const beat: SequenceDef = { ...manual, id: 's2', timing: 'beat' }

  it('offers nothing for an empty cue', () => {
    expect([...applicableSpeedOptions(control(), [], [], fixtures, [], [])]).toEqual([])
  })

  it('offers Sequence Speed only for a manual-timing sequence', () => {
    expect([...applicableSpeedOptions(control({ sequenceIds: ['s1'] }), [], [], fixtures, [manual, beat], [])]).toEqual(['sequenceSpeed'])
    expect([...applicableSpeedOptions(control({ sequenceIds: ['s2'] }), [], [], fixtures, [manual, beat], [])]).toEqual([])
  })

  it('offers Effect Speed only for an unsynced effect, Rainbow Speed for a rainbow effect', () => {
    const synced: EffectDef = { id: 'e1', name: 'Chase', fixtureIds: ['d1'], attribute: 'intensity', waveform: 'sine', speed: 1, syncToBpm: true, size: 100, offset: 128 }
    const rainbow: EffectDef = { ...synced, id: 'e2', name: 'Rainbow', syncToBpm: false }
    const out = applicableSpeedOptions(control({ effectIds: ['e1', 'e2'] }), [], [], fixtures, [], [synced, rainbow])
    expect(out.has('effectSpeed')).toBe(true)
    expect(out.has('rainbowSpeed')).toBe(true)
    expect([...applicableSpeedOptions(control({ effectIds: ['e1'] }), [], [], fixtures, [], [synced])]).toEqual([])
  })

  it('offers Vector and Infinite Pan/Tilt for a movement effect', () => {
    const sweep: EffectDef = { id: 'e1', name: 'Sweep', fixtureIds: ['d1'], attribute: 'pan', waveform: 'sine', speed: 1, syncToBpm: false, size: 100, offset: 128, kind: 'movement' }
    const out = applicableSpeedOptions(control({ effectIds: ['e1'] }), [], [], fixtures, [], [sweep])
    expect(out.has('vectorSpeed')).toBe(true)
    expect(out.has('infinitePanTiltSpeed')).toBe(true)
  })

  it('offers the gobo and strobe aspects when a cue fixture has those channels', () => {
    const cue: CueDef = { id: 'cue1', name: 'Heads', presetIds: [], sequenceIds: [], fixtureValues: { mh1: { intensity: 255, gobo: 100 } }, fadeMs: 500 }
    const out = applicableSpeedOptions(control({ cueId: 'cue1' }), [cue], [], fixtures, [], [])
    expect(out.has('goboRotationSpeed')).toBe(true)
    expect(out.has('goboShakeSpeed')).toBe(true)
    expect(out.has('goboChangeSpeed')).toBe(true)
    expect(out.has('strobeSpeed')).toBe(true)
    expect(out.has('shutterPulseSpeed')).toBe(false)
    expect(out.has('prismRotationSpeed')).toBe(false)
  })
})
