// Jake, 20 Nov 2026: the OFL library is no longer bundled and nothing
// ships by default — the user uploads the OFL zip, uploads merge into
// the local database, and a duplicated fixture (tagged custom) is never
// updated by an upload. These tests pin the merge, the duplicate and
// the cache migration that drops a stale bundle-seeded cache.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  importOflFixture,
  mergeOflLibraries,
  duplicateProfileAsCustom,
  shouldClearBundledOflCache
} from '../src/shared/oflFixtureFormat'
import { importProfile } from '../src/shared/profileValidation'
import type { FixtureProfile } from '../src/shared/types'

const profile = (id: string, name: string, extra: Partial<FixtureProfile> = {}): FixtureProfile => ({
  id,
  name,
  manufacturer: 'Test',
  legacyType: 'par',
  modes: [{ id: 'default', name: 'Default', channels: [{ number: 0, attribute: 'intensity', propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 255 }] }],
  ...extra
})

const q5 = (): FixtureProfile =>
  importOflFixture(readFileSync('tests/fixtures/chauvet-dj/fxarray-q5.json', 'utf-8'), {
    manufacturerKey: 'chauvet-dj',
    manufacturer: 'Chauvet DJ',
    fixtureKey: 'fxarray-q5',
    preserveSource: false
  })

describe('OFL zip upload merge', () => {
  it('fresh base records win, new ones are added, cached-only ones are kept', () => {
    const fresh = [profile('ofl:a:one', 'One', { manufacturer: 'A' }), profile('ofl:a:two', 'Two')]
    const cached = [
      profile('ofl:a:one', 'One (old)'),
      profile('ofl:a:three', 'Three')
    ]
    const merged = mergeOflLibraries(fresh, cached)
    expect(merged.map((p) => p.id)).toEqual(['ofl:a:one', 'ofl:a:two', 'ofl:a:three'])
    expect(merged.find((p) => p.id === 'ofl:a:one')?.name).toBe('One')
  })

  it('a custom-tagged record is never replaced, even when the fresh library carries the same id', () => {
    const custom = profile('ofl:a:one', 'My One', { custom: true })
    const fresh = [profile('ofl:a:one', 'One v2')]
    const merged = mergeOflLibraries(fresh, [custom])
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('My One')
    expect(merged[0].custom).toBe(true)
  })

  it('a zip upload keeps a custom duplicate while updating its base record', () => {
    const base = q5()
    const copy = duplicateProfileAsCustom(base)
    // The fresh zip carries a newer base (blue default changed) and a
    // brand-new fixture; the cached library holds the stale base plus
    // the user's custom duplicate.
    const staleBase = structuredClone(base)
    for (const mode of staleBase.modes) for (const channel of mode.channels) if (/^blue/.test(channel.attribute)) channel.defaultValue = 0
    const freshBase = structuredClone(base)
    const freshNew = profile('ofl:acme:new', 'New Fixture')
    const merged = mergeOflLibraries([freshBase, freshNew], [staleBase, copy])
    expect(merged.map((p) => p.id)).toEqual([base.id, 'ofl:acme:new', copy.id])
    const healed = merged.find((p) => p.id === base.id)!
    expect(healed.modes[0].channels.filter((c) => /^blue/.test(c.attribute)).every((c) => c.defaultValue === 255)).toBe(true)
    const kept = merged.find((p) => p.id === copy.id)!
    expect(kept.custom).toBe(true)
    expect(kept.name).toBe('FXarray Q5 copy')
  })
})

describe('duplicate an OFL record as a custom fixture', () => {
  it('gets a fresh custom: id, the custom tag, and no OFL identity', () => {
    const copy = duplicateProfileAsCustom(q5())
    expect(copy.id).toMatch(/^custom:fxarray-q5-[0-9a-f]{8}$/)
    expect(copy.id).not.toBe(q5().id)
    expect(copy.name).toBe('FXarray Q5 copy')
    expect(copy.custom).toBe(true)
    expect(copy.ofl).toBeUndefined()
    expect(copy.modes).toEqual(q5().modes)
  })

  it('is a deep copy: editing it never touches the original', () => {
    const original = q5()
    const copy = duplicateProfileAsCustom(original)
    copy.modes[0].channels[0].defaultValue = 123
    expect(original.modes[0].channels[0].defaultValue).not.toBe(123)
  })

  it('two duplicates of the same record get different ids', () => {
    const original = q5()
    expect(duplicateProfileAsCustom(original).id).not.toBe(duplicateProfileAsCustom(original).id)
  })
})

describe('dropping a stale bundle-seeded cache', () => {
  const cached = [profile('ofl:a:one', 'One')]
  it('clears a cache seeded from the bundle', () => {
    expect(shouldClearBundledOflCache({ source: 'bundled', fingerprint: 'abc' }, cached)).toBe(true)
  })
  it('clears a cache from before the meta file existed', () => {
    expect(shouldClearBundledOflCache(null, cached)).toBe(true)
  })
  it('keeps a library the user uploaded themselves', () => {
    expect(shouldClearBundledOflCache({ source: 'import', fingerprint: null }, cached)).toBe(false)
    expect(shouldClearBundledOflCache({ source: 'upload', fingerprint: null }, cached)).toBe(false)
  })
  it('keeps a library holding fixtures the user created (Jake, 20 Nov 2026, global customs)', () => {
    expect(shouldClearBundledOflCache({ source: 'custom', fingerprint: null }, cached)).toBe(false)
  })
  it('clears nothing when the cache is empty or missing', () => {
    expect(shouldClearBundledOflCache({ source: 'bundled', fingerprint: 'abc' }, [])).toBe(false)
    expect(shouldClearBundledOflCache(null, null)).toBe(false)
  })
})

describe('EP4 import as a custom fixture', () => {
  it('imports the GitHub fixtures file through the profile editor flow', () => {
    const imported = importProfile(readFileSync('fixtures-github/event-lighting/ep4.json', 'utf-8'))
    expect(imported.id).toBe('ofl:event-lighting:ep4')
    expect(imported.manufacturer).toBe('Event Lighting')
    expect(imported.name).toBe('EP4')
    expect(imported.modes).toHaveLength(1)
    expect(imported.modes[0].channels).toHaveLength(17)
    expect(imported.modes[0].beams).toHaveLength(4)
    const blues = imported.modes[0].channels.filter((c) => /^blue/.test(c.attribute))
    expect(blues.length).toBe(4)
    expect(blues.every((c) => c.defaultValue === 255)).toBe(true)
    expect(imported.modes[0].channels.find((c) => c.attribute === 'intensity')?.defaultValue).toBe(0)
  })
})
