import { describe, expect, it } from 'vitest'
import type { SceneDef } from '../src/shared/types'
import { getPresetColor } from '../src/renderer/src/lib/presetColor'

function scene(fixtureValues: SceneDef['fixtureValues']): SceneDef {
  return {
    id: 'scene',
    name: 'Scene',
    fadeMs: 0,
    fixtureValues
  }
}

describe('preset tree colors', () => {
  it('brightens active RGB output while preserving its hue', () => {
    expect(
      getPresetColor(scene({ red: { intensity: 80, red: 255, green: 0, blue: 0 } }))
    ).toBe('#dc0000')
  })

  it('does not let unlit fixtures wash out an active preset color', () => {
    expect(
      getPresetColor(
        scene({
          red: { intensity: 255, red: 255, green: 0, blue: 0 },
          unlit: { intensity: 0, red: 0, green: 0, blue: 255 }
        })
      )
    ).toBe('#dc0000')
  })

  it('uses a visible neutral dot when the scene has no RGB output', () => {
    expect(getPresetColor(scene({ dark: { intensity: 0, red: 255, green: 255, blue: 255 } }))).toBe(
      '#777777'
    )
  })

  it('shows color-only RGBW presets when no dimmer attribute exists', () => {
    expect(getPresetColor(scene({ rgbw: { red: 0, green: 0, blue: 0, white: 255 } }))).toBe(
      '#dcdcdc'
    )
  })
})
