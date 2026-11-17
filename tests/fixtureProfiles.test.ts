import { describe, expect, it } from 'vitest'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import { FIXTURE_PRESETS, type FixtureDef } from '../src/shared/types'
import { migrateShow } from '../src/shared/migrations'
import { computeSceneChannels } from '../src/renderer/src/lib/automationRuntime'
describe('data-driven fixture profiles', () => {
  it('migrates every legacy mode with identical output channel by channel', () => {
    expect(BUILTIN_PROFILES).toHaveLength(8)
    for (const preset of FIXTURE_PRESETS) {
      const fixture: FixtureDef = { id: 'f', name: preset.name, type: preset.type, channelStart: 23, channels: preset.channels }
      const profile = BUILTIN_PROFILES.find((p) => p.id === preset.id)!
      const values = Object.fromEntries(profile.modes[0].channels.map((c, index) => [c.attribute, 30 + index]))
      const scene = { id: 's', name: 'Scene', fadeMs: 0, fixtureValues: { f: values } }
      const migrated = migrateShow({ fixtures: [fixture] }).fixtures[0]
      const before = computeSceneChannels([fixture], scene), after = computeSceneChannels([migrated], scene)
      expect(after).toEqual(before)
      for (const channel of profile.modes[0].channels) expect(after[23 + channel.number]).toBe(values[channel.attribute])
      expect(migrated.profileId).toBe(profile.id)
    }
  })
})
