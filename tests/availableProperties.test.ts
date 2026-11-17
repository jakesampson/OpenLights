import { describe, expect, it } from 'vitest'
import { availableProperties } from '../src/renderer/src/lib/availableProperties'
import type { FixtureDef } from '../src/shared/types'
describe('profile-driven property availability', () => {
  const par: FixtureDef = { id: 'p', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }
  it('intersects property kinds across a mixed selection', () => {
    expect(availableProperties([par]).map((p) => p.attribute)).toEqual(['intensity', 'red', 'green', 'blue'])
    expect(availableProperties([par, { ...par, id: 'd', type: 'dimmer', channels: 1 }]).map((p) => p.attribute)).toEqual(['intensity'])
    expect(availableProperties([])).toEqual([])
  })
})
