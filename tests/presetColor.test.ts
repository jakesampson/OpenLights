import { describe, expect, it } from 'vitest'
import type { CueDef, PresetDef } from '../src/shared/types'
import { getPresetColor, getPresetDotColor } from '../src/renderer/src/lib/presetColor'

function preset(id: string, name: string, fixtureValues: PresetDef['fixtureValues']): PresetDef {
  return { id, name, category: 'color', fixtureValues }
}

function cue(fixtureValues: CueDef['fixtureValues']): CueDef {
  return {
    id: 'cue',
    name: 'Cue',
    fadeMs: 0,
    fixtureValues
  }
}

describe('preset tree colors', () => {
  it('brightens active RGB output while preserving its hue', () => {
    expect(
      getPresetColor(cue({ red: { intensity: 80, red: 255, green: 0, blue: 0 } }))
    ).toBe('#dc0000')
  })

  it('does not let unlit fixtures wash out an active preset color', () => {
    expect(
      getPresetColor(
        cue({
          red: { intensity: 255, red: 255, green: 0, blue: 0 },
          unlit: { intensity: 0, red: 0, green: 0, blue: 255 }
        })
      )
    ).toBe('#dc0000')
  })

  it('uses a visible neutral dot when the cue has no RGB output', () => {
    expect(getPresetColor(cue({ dark: { intensity: 0, red: 255, green: 255, blue: 255 } }))).toBe(
      '#777777'
    )
  })

  it('shows color-only RGBW presets when no dimmer attribute exists', () => {
    expect(getPresetColor(cue({ rgbw: { red: 0, green: 0, blue: 0, white: 255 } }))).toBe(
      '#dcdcdc'
    )
  })
})

describe('palette dot colours (LightKey, Jake 22 Nov 2026)', () => {
  it('shows the preset colour, peak scaled to 220', () => {
    expect(getPresetDotColor(preset('r', 'Red', { fx1: { red: 255, green: 0, blue: 0 } }))).toBe('#dc0000')
    expect(getPresetDotColor(preset('g', 'Green', { fx1: { red: 0, green: 255, blue: 0 } }))).toBe('#00dc00')
    expect(getPresetDotColor(preset('b', 'Dark Blue', { fx1: { red: 0, green: 0, blue: 128 } }))).toBe('#0000dc')
  })

  it('returns null for a dimmer-only preset, so the row shows a sun icon', () => {
    expect(getPresetDotColor(preset('d', 'Full On', { fx1: { intensity: 255 } }))).toBeNull()
    expect(getPresetDotColor(preset('u', 'UV', { fx1: { uv: 255 } }))).toBeNull()
  })

  it('reads the colour even when the preset was captured while dark', () => {
    expect(getPresetDotColor(preset('r', 'Red', { fx1: { intensity: 0, red: 255, green: 0, blue: 0 } }))).toBe('#dc0000')
  })

  it('averages across fixtures', () => {
    expect(getPresetDotColor(preset('m', 'Mixed', {
      fx1: { red: 255, green: 0, blue: 0 },
      fx2: { red: 0, green: 255, blue: 0 }
    }))).toBe('#dcdc00')
  })
})
