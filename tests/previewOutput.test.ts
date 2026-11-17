import { describe, expect, it } from 'vitest'
import { previewFixtureValues } from '../src/renderer/src/lib/previewOutput'
import type { FixtureDef } from '../src/shared/types'

describe('live preview output', () => {
  it('reads actual channel values rather than the target scene', () => {
    const fixture: FixtureDef = { id: 'f', name: 'LED', type: 'generic-led', channelStart: 2, channels: 4 }
    expect(previewFixtureValues(fixture, [0, 100, 200, 30, 10], { intensity: 255, red: 255 })).toEqual({ intensity: 100, red: 200, green: 30, blue: 10 })
  })
  it('keeps a dimmer preview colour while using live output for its brightness', () => {
    const fixture: FixtureDef = { id: 'd', name: 'Dimmer', type: 'dimmer', channelStart: 1, channels: 1 }
    expect(previewFixtureValues(fixture, [0], { intensity: 255, red: 255, green: 50, blue: 0 })).toEqual({ intensity: 0, red: 255, green: 50, blue: 0 })
  })
})
