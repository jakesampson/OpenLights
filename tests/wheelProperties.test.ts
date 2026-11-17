import { describe, expect, it } from 'vitest'
import { wheelSlotValue } from '../src/renderer/src/lib/wheelProperties'
import type { FixtureChannel } from '../src/shared/types'
describe('profile wheel values', () => {
  const channel: FixtureChannel = { number: 0, attribute: 'gobo', propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0, slots: [{ id: 'open', name: 'Open', from: 0, to: 15, kind: 'slot' }, { id: 'spin', name: 'Spin', from: 128, to: 191, kind: 'spin' }, { id: 'scroll', name: 'Scroll', from: 192, to: 255, kind: 'scroll' }] }
  it('maps static slots and bounded spin/scroll speed modes', () => {
    expect(wheelSlotValue(channel, 'open')).toBe(8)
    expect(wheelSlotValue(channel, 'spin', 0)).toBe(128)
    expect(wheelSlotValue(channel, 'spin', 1)).toBe(191)
    expect(wheelSlotValue(channel, 'scroll', 2)).toBe(255)
    expect(() => wheelSlotValue(channel, 'missing')).toThrow('valid wheel')
  })
})
