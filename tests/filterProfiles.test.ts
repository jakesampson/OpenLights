import { describe, expect, it } from 'vitest'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import { filterProfiles } from '../src/renderer/src/lib/filterProfiles'
import { migrateShow } from '../src/shared/migrations'
describe('fixture library browser', () => {
  it('combines name, manufacturer, channel and favourite filters', () => {
    expect(filterProfiles(BUILTIN_PROFILES, { query: 'DIMMER' })).toHaveLength(1)
    expect(filterProfiles(BUILTIN_PROFILES, { channels: 17 })).toHaveLength(1)
    expect(filterProfiles(BUILTIN_PROFILES, { manufacturer: 'Unknown' })).toEqual([])
    const id = BUILTIN_PROFILES[0].id
    expect(filterProfiles(BUILTIN_PROFILES, { favoritesOnly: true }, [id]).map((p) => p.id)).toEqual([id])
    const show = migrateShow({ favoriteProfileIds: [id] })
    expect(migrateShow(JSON.parse(JSON.stringify(show))).favoriteProfileIds).toEqual([id])
  })
})
