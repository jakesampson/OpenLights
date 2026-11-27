// Yellow alignment guides (Jake, 27 Nov 2026 — LightKey cue editing,
// Video 2): moving a button near a neighbour's edge snaps it into
// alignment and draws the guide line. The moving button is a third
// object ('c') so both A and B count as neighbours.
import { describe, it, expect } from 'vitest'
import { alignmentGuides } from '../src/renderer/src/lib/alignmentGuides'
import type { LivePage } from '../src/shared/types'

const PAGE: LivePage = {
  id: 'page1', name: 'Page', fadeMs: 0,
  controls: [
    { id: 'a', name: 'A', type: 'push', presetIds: [], x: 20, y: 20, width: 120, height: 40 },
    { id: 'b', name: 'B', type: 'push', presetIds: [], x: 200, y: 20, width: 120, height: 40 },
  ],
} as unknown as LivePage

describe('alignmentGuides', () => {
  it('snaps the left edge to a neighbour left edge and reports the line', () => {
    const guides = alignmentGuides(PAGE, 'c', { x: 202, y: 90, width: 120, height: 40 })
    expect(guides.x).toBe(200)
    expect(guides.vertical).toEqual([200])
    expect(guides.y).toBe(90)
    expect(guides.horizontal).toEqual([])
  })

  it('snaps the top edge to a neighbour top edge', () => {
    const guides = alignmentGuides(PAGE, 'c', { x: 400, y: 22, width: 120, height: 40 })
    expect(guides.y).toBe(20)
    expect(guides.horizontal).toEqual([20])
  })

  it('aligns centres when neither edge lines up', () => {
    // A is 20..140, centre-x 80. A 100-wide rect at x=30 has centre-x
    // 80 but no edge within tolerance of A's edges.
    const centred = alignmentGuides(PAGE, 'c', { x: 30, y: 200, width: 100, height: 40 })
    expect(centred.x).toBe(30)
    expect(centred.vertical).toEqual([80])
  })

  it('leaves the rect alone when nothing is near', () => {
    const far = alignmentGuides(PAGE, 'c', { x: 500, y: 300, width: 120, height: 40 })
    expect(far).toEqual({ x: 500, y: 300, vertical: [], horizontal: [] })
  })
})
