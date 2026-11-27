// LightKey's button modifiers (guide ch.11, pp.205–207; Jake's
// screenshot, 27 Nov 2026): only the modifiers which apply to the cue
// are enabled — Pan Angle, for example, is only available if the cue
// defines the Position property for at least one fixture.
import { describe, expect, it } from 'vitest'
import { applicableModifiers } from '../src/renderer/src/lib/liveModifiers'
import type { CueDef, EffectDef, FixtureDef, LiveControl, PresetDef, SequenceDef } from '../src/shared/types'

const fixtures: FixtureDef[] = [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }]
const control = (patch: Partial<LiveControl> = {}): LiveControl => ({ id: 'c', name: 'C', type: 'push', presetIds: [], ...patch })

describe('applicableModifiers', () => {
  it('enables only Fade Time for an empty cue', () => {
    expect([...applicableModifiers(control(), [], [], fixtures, [], [])]).toEqual(['fadeTime'])
  })

  it('enables Dimmer and Hue for a colour + dimmer cue, nothing positional', () => {
    const presets: PresetDef[] = [{ id: 'p-red', name: 'Red', category: 'color', fixtureValues: { d1: { red: 255, intensity: 255 } } }]
    const out = applicableModifiers(control({ presetIds: ['p-red'] }), [], presets, fixtures, [], [])
    expect(out.has('dimmer')).toBe(true)
    expect(out.has('hue')).toBe(true)
    expect(out.has('fadeTime')).toBe(true)
    for (const key of ['speed', 'beatMultiplier', 'timeOffset', 'colorTemperature', 'greenSaturation', 'xfadeToColor', 'pan', 'tilt', 'focus', 'zoomAngle', 'irisSize', 'frostAmount', 'fogAmount']) {
      expect(out.has(key as never)).toBe(false)
    }
  })

  it('enables Pan and Tilt when the cue defines Position', () => {
    const presets: PresetDef[] = [{ id: 'p-pos', name: 'Pos', category: 'position', fixtureValues: { d1: { pan: 100, tilt: 50 } } }]
    const out = applicableModifiers(control({ presetIds: ['p-pos'] }), [], presets, fixtures, [], [])
    expect(out.has('pan')).toBe(true)
    expect(out.has('tilt')).toBe(true)
    expect(out.has('dimmer')).toBe(false)
  })

  it('enables Speed for a cue with a sequence, Beat Multiplier only for a beat-controlled one', () => {
    const manual: SequenceDef = { id: 's1', name: 'Chase', steps: [], order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1 }
    const beat: SequenceDef = { ...manual, id: 's2', timing: 'beat' }
    const withManual = applicableModifiers(control({ sequenceIds: ['s1'] }), [], [], fixtures, [manual, beat], [])
    expect(withManual.has('speed')).toBe(true)
    expect(withManual.has('beatMultiplier')).toBe(false)
    const withBeat = applicableModifiers(control({ sequenceIds: ['s2'] }), [], [], fixtures, [manual, beat], [])
    expect(withBeat.has('speed')).toBe(true)
    expect(withBeat.has('beatMultiplier')).toBe(true)
  })

  it('enables Time Offset for a movement effect', () => {
    const effect: EffectDef = { id: 'e1', name: 'Sweep', fixtureIds: ['d1'], attribute: 'pan', waveform: 'sine', speed: 1, syncToBpm: false, size: 100, offset: 128, kind: 'movement' }
    const out = applicableModifiers(control({ effectIds: ['e1'] }), [], [], fixtures, [], [effect])
    expect(out.has('speed')).toBe(true)
    expect(out.has('timeOffset')).toBe(true)
  })

  it('reads the button’s own cue when it has one', () => {
    const cue: CueDef = { id: 'cue1', name: 'Song', presetIds: [], sequenceIds: [], fixtureValues: { d1: { focus: 200, zoom: 100 } }, fadeMs: 500 }
    const out = applicableModifiers(control({ cueId: 'cue1' }), [cue], [], fixtures, [], [])
    expect(out.has('focus')).toBe(true)
    expect(out.has('zoomAngle')).toBe(true)
    expect(out.has('pan')).toBe(false)
  })
})
