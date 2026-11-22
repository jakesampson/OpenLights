// Jake, 22 Nov 2026 — Live buttons take on the light colour associated
// with them: a colour preset button shows its colour, a dimmer-only button
// defaults to white. Text stays readable: a translucent tint while off
// (white text), solid while lit (dark text on light colours, light text
// on dark ones).
import { describe, expect, it } from 'vitest'
import type { CueDef, LiveControl, PresetDef } from '../src/shared/types'
import {
  contrastingTextColor,
  liveButtonBackground,
  liveButtonTextColor,
  liveControlButtonColor,
  withAlpha
} from '../src/renderer/src/lib/liveButtonColor'

const control = (patch: Partial<LiveControl>): LiveControl => ({
  id: 'btn', name: 'Button', type: 'toggle', presetIds: [], ...patch
})
const presets: PresetDef[] = [
  { id: 'red', name: 'Red', fixtureValues: { f1: { red: 255, green: 0, blue: 0 } } },
  { id: 'green', name: 'Green', fixtureValues: { f1: { red: 0, green: 255, blue: 0 } } },
  { id: 'full', name: 'Full On', fixtureValues: { f1: { intensity: 255 } } },
  { id: 'dark-blue', name: 'Dark Blue', fixtureValues: { f1: { red: 0, green: 0, blue: 255 } } }
] as unknown as PresetDef[]

describe('liveControlButtonColor', () => {
  it('a Red preset button renders red, Green renders green, Dark Blue renders blue', () => {
    expect(liveControlButtonColor(control({ presetIds: ['red'] }), presets)).toBe('#dc0000')
    expect(liveControlButtonColor(control({ presetIds: ['green'] }), presets)).toBe('#00dc00')
    expect(liveControlButtonColor(control({ presetIds: ['dark-blue'] }), presets)).toBe('#0000dc')
  })

  it('a dimmer-only button has no colour, so the caller defaults it to white', () => {
    expect(liveControlButtonColor(control({ presetIds: ['full'] }), presets)).toBeNull()
    expect(liveControlButtonColor(control({ presetIds: [] }), presets)).toBeNull()
  })

  it('the most recently listed colour preset wins, like the cue layer', () => {
    expect(liveControlButtonColor(control({ presetIds: ['red', 'green'] }), presets)).toBe('#00dc00')
    expect(liveControlButtonColor(control({ presetIds: ['green', 'red'] }), presets)).toBe('#dc0000')
  })

  it('a dimmer preset under a colour preset does not wash it out', () => {
    expect(liveControlButtonColor(control({ presetIds: ['red', 'full'] }), presets)).toBe('#dc0000')
  })

  it('a cue button resolves its cue look', () => {
    const cues: CueDef[] = [{ id: 'cue1', name: 'Cue', presetIds: ['green'], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }]
    expect(liveControlButtonColor(control({ cueId: 'cue1', presetIds: [] }), presets, cues)).toBe('#00dc00')
  })

  it('ad-hoc colour on a button colours it', () => {
    expect(liveControlButtonColor(control({ adHocValues: { f1: { red: 255, green: 0, blue: 0 } } }), presets)).toBe('#dc0000')
  })

  it('a deliberately picked button colour wins over the preset colour', () => {
    expect(liveControlButtonColor(control({ presetIds: ['red'], appearance: { color: '#00ff88', releaseOthers: false } }), presets)).toBe('#00ff88')
  })

  it('the placeholder default purple is not a choice and never wins', () => {
    expect(liveControlButtonColor(control({ presetIds: ['red'], appearance: { color: '#47235a', releaseOthers: true } }), presets)).toBe('#dc0000')
  })

  it('a UV-only button has no RGB colour and defaults to white', () => {
    const uv = [{ id: 'uv', name: 'UV', fixtureValues: { f1: { uv: 255 } } }] as unknown as PresetDef[]
    expect(liveControlButtonColor(control({ presetIds: ['uv'] }), uv)).toBeNull()
  })
})

describe('liveButtonBackground / liveButtonTextColor', () => {
  it('off is a translucent tint, lit is solid', () => {
    expect(liveButtonBackground('#dc0000', false)).toBe('rgba(220, 0, 0, 0.28)')
    expect(liveButtonBackground('#dc0000', true)).toBe('#dc0000')
  })

  it('off always takes white text — the tint over the dark panel is dark', () => {
    for (const color of ['#dc0000', '#00dc00', '#0000dc', '#ffffff', '#dcdc00']) {
      expect(liveButtonTextColor(color, false)).toBe('#ffffff')
    }
  })

  it('lit takes dark text on light colours and light text on dark ones', () => {
    expect(liveButtonTextColor('#00dc00', true)).toBe('#111111')
    expect(liveButtonTextColor('#ffffff', true)).toBe('#111111')
    expect(liveButtonTextColor('#dc0000', true)).toBe('#ffffff')
    expect(liveButtonTextColor('#0000dc', true)).toBe('#ffffff')
  })

  it('contrastingTextColor picks the higher WCAG contrast', () => {
    expect(contrastingTextColor('#ffffff')).toBe('#111111')
    expect(contrastingTextColor('#000000')).toBe('#ffffff')
    expect(withAlpha('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
  })
})
