import { describe, expect, it } from 'vitest'
import { selectFixtureIds } from '../src/renderer/src/lib/fixtureSelection'
import type { FixtureDef } from '../src/shared/types'
describe('fixture selection tools', () => {
  const fixtures: FixtureDef[] = [{ id: 'a', name: 'Warm left', type: 'par', channels: 4, channelStart: 1, previewPosition: { x: 100, y: 100 } }, { id: 'b', name: 'Warm right', type: 'dimmer', channels: 1, channelStart: 5, previewPosition: { x: 600, y: 250 } }]
  it('supports all, type, partial name and each stage half', () => {
    expect(selectFixtureIds(fixtures)).toEqual(['a', 'b'])
    expect(selectFixtureIds(fixtures, { name: 'WARM' })).toEqual(['a', 'b'])
    expect(selectFixtureIds(fixtures, { type: 'par' })).toEqual(['a'])
    for (const location of ['left', 'back'] as const) expect(selectFixtureIds(fixtures, { location })).toEqual(['a'])
    for (const location of ['right', 'front'] as const) expect(selectFixtureIds(fixtures, { location })).toEqual(['b'])
  })
})
