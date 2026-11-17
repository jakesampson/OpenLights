import { describe, expect, it } from 'vitest'
import { adaptiveBackgroundHue } from '../src/renderer/src/lib/adaptiveBackground'
import type { FixtureDef } from '../src/shared/types'
const fixture: FixtureDef = { id: 'f', name: 'PAR', type: 'generic-led', channelStart: 1, channels: 4 }
describe('adaptive background hue', () => {
  it('follows the live RGB output and intensity', () => {
    expect(adaptiveBackgroundHue([fixture], [255, 255, 0, 0])).toBe(0)
    expect(adaptiveBackgroundHue([fixture], [255, 0, 255, 0])).toBe(120)
    expect(adaptiveBackgroundHue([fixture], [0, 255, 0, 0])).toBeNull()
  })
  it('uses neutral fallback for white or blackout', () => {
    expect(adaptiveBackgroundHue([fixture], [255, 255, 255, 255])).toBeNull()
    expect(adaptiveBackgroundHue([], [])).toBeNull()
  })
})
