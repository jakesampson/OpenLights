import { describe, expect, it } from 'vitest'
import type { FixtureDef, CueDef } from '../src/shared/types'
import { getStageTheme } from '../src/renderer/src/lib/stageTheme'

const fixtures: FixtureDef[] = [
  { id: 'f1', name: 'Wash', type: 'par', channelStart: 1, channels: 4 }
]

function cue(values: Record<string, number>): CueDef {
  return {
    id: 'cue',
    name: 'Cue',
    fadeMs: 0,
    fixtureValues: { f1: values }
  }
}

describe('stage-driven theme', () => {
  it('uses teal when the active look has more green than red', () => {
    expect(getStageTheme(cue({ intensity: 255, red: 20, green: 140, blue: 180 }), fixtures)).toBe(
      'teal'
    )
  })

  it('uses purple for red-dominant and unlit looks', () => {
    expect(getStageTheme(cue({ intensity: 255, red: 180, green: 30, blue: 100 }), fixtures)).toBe(
      'purple'
    )
    expect(getStageTheme(cue({ intensity: 0, red: 255, green: 255, blue: 255 }), fixtures)).toBe(
      'purple'
    )
  })

  it('defaults to purple before a cue is active', () => {
    expect(getStageTheme(null, fixtures)).toBe('purple')
  })

  it('recognizes color-only RGBW fixtures without a dimmer channel', () => {
    const rgbwFixture: FixtureDef = {
      id: 'rgbw',
      name: 'COREpar',
      type: 'rgbw-4ch',
      channelStart: 1,
      channels: 4
    }
    const rgbwCue: CueDef = {
      id: 'rgbw-look',
      name: 'RGBW look',
      fadeMs: 0,
      fixtureValues: { rgbw: { red: 20, green: 180, blue: 40, white: 0 } }
    }

    expect(getStageTheme(rgbwCue, [rgbwFixture])).toBe('teal')
  })
})
