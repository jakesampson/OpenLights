import { describe, expect, it } from 'vitest'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import { availableProperties } from '../src/renderer/src/lib/availableProperties'
import { propertyValue } from '../src/renderer/src/lib/propertyValues'
import { migrateShow } from '../src/shared/migrations'
describe('custom property controls and layout', () => {
  it('maps options and preserves hidden-property and order settings', () => {
    const profile = structuredClone(BUILTIN_PROFILES[0]); profile.modes[0].channels[0] = { ...profile.modes[0].channels[0], attribute: 'custom', propertyType: 'other', control: 'options', slots: [{ id: 'mode', name: 'Mode', kind: 'slot', from: 20, to: 30 }] }
    const show = migrateShow({ fixtures: [{ id: 'f', name: 'F', type: 'par', channels: 4, channelStart: 1, profile, propertyOrder: ['blue', 'custom'], hiddenProperties: ['red'] }] })
    expect(propertyValue(profile.modes[0].channels[0], 'mode')).toBe(25)
    expect(availableProperties(show.fixtures).map((c) => c.attribute)).toEqual(['blue', 'custom', 'green'])
    expect(migrateShow(JSON.parse(JSON.stringify(show))).fixtures).toEqual(show.fixtures)
  })
})
