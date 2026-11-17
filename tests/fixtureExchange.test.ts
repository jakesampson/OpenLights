import { describe, expect, it } from 'vitest'
import { exportFixtureCsv, importFixtureCsv, printablePatch } from '../src/shared/fixtureExchange'
import type { FixtureDef } from '../src/shared/types'
describe('patch list exchange', () => {
  it('round trips names, quoted notes, newlines and profile settings', () => {
    const fixture: FixtureDef = { id: 'f', name: 'Wash, "front"', type: 'par', channelStart: 23, channels: 4, notes: 'Line one\nLine two', group: 'Front' }
    expect(importFixtureCsv(exportFixtureCsv([fixture]))).toEqual([fixture])
    expect(printablePatch([{ ...fixture, name: '<script>' }])).toContain('&lt;script&gt;')
    expect(() => importFixtureCsv('Invalid\n1')).toThrow('Name and Address')
  })
})
