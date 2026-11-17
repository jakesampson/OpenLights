import { describe, expect, it } from 'vitest'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import { exportProfile, importProfile, validateProfile } from '../src/shared/profileValidation'
describe('fixture profile exchange', () => {
  it('round trips a custom profile including its complete mode definitions', () => {
    const profile = { ...structuredClone(BUILTIN_PROFILES[0]), id: 'custom', name: 'Custom' }
    expect(importProfile(exportProfile(profile))).toEqual(profile)
  })
  it('rejects duplicate channel numbers and invalid ranges before saving', () => {
    const profile = structuredClone(BUILTIN_PROFILES[0]); profile.modes[0].channels[1].number = 0
    expect(validateProfile(profile).join(' ')).toContain('unique')
    profile.modes[0].channels[1].number = 1; profile.modes[0].channels[0].max = 256
    expect(() => importProfile(JSON.stringify(profile))).toThrow('0–255')
  })
})
