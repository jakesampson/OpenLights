import { describe, expect, it } from 'vitest'
import { propertyValue, STANDARD_PROPERTIES } from '../src/renderer/src/lib/propertyValues'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import type { FixtureChannel, FixtureDef } from '../src/shared/types'
describe('standard fixture properties', () => {
  it('maps every standard property through its profile channel range', () => {
    const channels: FixtureChannel[] = STANDARD_PROPERTIES.map((attribute, number) => ({ number, attribute, propertyType: 'other', min: 10, max: 200, defaultValue: 10, highlightValue: 10 }))
    const fixture: FixtureDef = { id: 'f', name: 'Standard', type: 'moving-head', channels: channels.length, channelStart: 1, profile: { id: 'custom', name: 'All properties', manufacturer: 'Test', legacyType: 'moving-head', modes: [{ id: 'default', name: 'Default', channels }] } }
    const values = Object.fromEntries(channels.map((c) => [c.attribute, propertyValue(c, 300)]))
    const output = computeCueChannels([fixture], { id: 's', name: 'S', fadeMs: 0, fixtureValues: { f: values } })
    for (const channel of channels) { expect(output[channel.number + 1]).toBe(200); expect(propertyValue(channel, false)).toBe(10); expect(propertyValue(channel, true)).toBe(200) }
  })
})
