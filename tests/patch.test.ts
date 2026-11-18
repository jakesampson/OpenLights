import { describe, expect, it } from 'vitest'
import { allocateFixtures, findConflicts } from '../src/renderer/src/lib/patch'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
describe('batch fixture patching', () => {
  it('allocates a quantity with consecutive names and non-overlapping addresses', () => {
    const fixtures = allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 4, start: 1, name: 'Wash' })
    expect(fixtures.map((f) => f.channelStart)).toEqual([1, 5, 9, 13])
    expect(fixtures.map((f) => f.name)).toEqual(['Wash 1', 'Wash 2', 'Wash 3', 'Wash 4'])
    expect(allocateFixtures(fixtures, BUILTIN_PROFILES[0], { quantity: 1, start: 2 })[0].channelStart).toBe(17)
    expect(() => allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 4, start: 510 })).toThrow('Not enough')
    expect(() => allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 1, start: 1, universe: 2 })).toThrow('universe 1')
  })
})

it('reports overlaps and address overflow without flagging adjacent spans', () => {
 const a = allocateFixtures([], BUILTIN_PROFILES[0], { quantity: 2, start: 1 })
 expect(findConflicts(a)).toEqual([])
 expect(findConflicts([a[0], { ...a[1], channelStart: 3 }])[0]).toMatchObject({ type: 'overlap', channels: [3, 4] })
 expect(findConflicts([{ ...a[0], channelStart: 511 }])[0].type).toBe('out-of-range')
 expect(findConflicts([a[0], { ...a[1], channelStart: 1, universe: 2 }])).toEqual([])
})
