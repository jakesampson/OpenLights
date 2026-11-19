import { describe, expect, it } from 'vitest'
import { instancePositions, landingPositions } from '../src/renderer/src/lib/previewLayout'
import type { FixtureDef } from '../src/shared/types'

function fixture(partial: Partial<FixtureDef> & { id: string }): FixtureDef {
  return { name: partial.id, type: 'par', channelStart: 1, channels: 4, ...partial }
}

describe('preview landing layout (LightKey video 3:15–3:25)', () => {
  it('lands a fresh batch in one centred row', () => {
    const batch = [1, 2, 3, 4].map((i) => fixture({ id: `p${i}` }))
    const landing = landingPositions([], batch)
    // Widest (only) row centred on x=400, 76 apart; single row on y=170.
    expect(landing.p1).toEqual([{ x: 286, y: 170 }])
    expect(landing.p2).toEqual([{ x: 362, y: 170 }])
    expect(landing.p3).toEqual([{ x: 438, y: 170 }])
    expect(landing.p4).toEqual([{ x: 514, y: 170 }])
  })

  it('lands a later batch in a row above the first, left-aligned to it', () => {
    const first = [1, 2, 3, 4, 5, 6].map((i) => fixture({ id: `mh${i}`, previewPosition: { x: 210 + (i - 1) * 76, y: 170 }, previewPositions: [{ x: 210 + (i - 1) * 76, y: 170 }] }))
    const second = [1, 2, 3, 4].map((i) => fixture({ id: `p${i}` }))
    const landing = landingPositions(first, second)
    // Same left edge as the first batch (210), one row gap above (170−50).
    expect(landing.p1).toEqual([{ x: 210, y: 120 }])
    expect(landing.p4).toEqual([{ x: 438, y: 120 }])
  })

  it('wraps a long batch into rows of at most 10, left-aligned', () => {
    const batch = Array.from({ length: 12 }, (_, i) => fixture({ id: `f${i + 1}` }))
    const landing = landingPositions([], batch)
    const row0 = Array.from({ length: 10 }, (_, i) => ({ x: 58 + i * 76, y: 145 }))
    const row1 = [{ x: 58, y: 195 }, { x: 134, y: 195 }]
    expect(batch.slice(0, 10).map((f) => landing[f.id][0])).toEqual(row0)
    expect(batch.slice(10).map((f) => landing[f.id][0])).toEqual(row1)
  })

  it('goes below the lowest row when there is no room above', () => {
    const existing = [fixture({ id: 'top', previewPosition: { x: 400, y: 30 } })]
    const landing = landingPositions(existing, [fixture({ id: 'next' })])
    expect(landing.next).toEqual([{ x: 400, y: 80 }])
  })

  it('gives each Count instance its own landing position', () => {
    const landing = landingPositions([], [fixture({ id: 'trio', count: 3 })])
    expect(landing.trio).toEqual([
      { x: 324, y: 170 },
      { x: 400, y: 170 },
      { x: 476, y: 170 }
    ])
  })

  it('ignores fixtures still in storage when placing a batch', () => {
    const stored = [fixture({ id: 'stored', inStorage: true, previewPosition: { x: 100, y: 100 } })]
    const landing = landingPositions(stored, [fixture({ id: 'fresh' })])
    expect(landing.fresh).toEqual([{ x: 400, y: 170 }])
  })
})

describe('per-instance positions', () => {
  it('returns stored positions when present', () => {
    const f = fixture({ id: 'a', count: 2, previewPosition: { x: 10, y: 20 }, previewPositions: [{ x: 10, y: 20 }, { x: 90, y: 20 }] })
    expect(instancePositions(f)).toEqual([{ x: 10, y: 20 }, { x: 90, y: 20 }])
  })

  it('falls back to the legacy fan-out for shows patched before per-instance positions', () => {
    const f = fixture({ id: 'a', count: 3, previewPosition: { x: 100, y: 90 } })
    expect(instancePositions(f)).toEqual([{ x: 100, y: 90 }, { x: 128, y: 90 }, { x: 156, y: 90 }])
  })

  it('yields nulls for a fixture with no position at all', () => {
    expect(instancePositions(fixture({ id: 'a', count: 2 }))).toEqual([null, null])
    expect(instancePositions(fixture({ id: 'b' }))).toEqual([null])
  })
})
