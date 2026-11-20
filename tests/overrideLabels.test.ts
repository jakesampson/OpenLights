// Jake, 20 Nov 2026 (screenshot image-22): two override labels in the
// Preview overlapped each other (R4's "Dimmer" and the neighbouring
// fixture's "Dimmer / Color"). Labels that would collide are shifted
// down only as far as needed to clear each other.
import { describe, it, expect } from 'vitest'
import { layoutOverrideLabels, type OverrideLabelBox } from '../src/renderer/src/lib/overrideLabels'

const box = (id: string, x: number, y: number, width = 60, height = 18): OverrideLabelBox => ({ id, x, y, width, height })

describe('layoutOverrideLabels', () => {
  it('leaves labels that do not overlap exactly where they were anchored', () => {
    const positions = layoutOverrideLabels([box('a', 10, 10), box('b', 200, 10), box('c', 10, 100)])
    expect(positions.get('a')).toEqual({ x: 10, y: 10 })
    expect(positions.get('b')).toEqual({ x: 200, y: 10 })
    expect(positions.get('c')).toEqual({ x: 10, y: 100 })
  })

  it('shifts the lower label down just past the upper one (Jake image-22)', () => {
    // R4's label and its neighbour's, anchored 10px apart vertically and
    // overlapping horizontally — the second label moves to sit directly
    // below the first (18px tall + 2px gap), no further.
    const positions = layoutOverrideLabels([box('r4', 100, 50), box('q4', 108, 60)])
    expect(positions.get('r4')).toEqual({ x: 100, y: 50 })
    expect(positions.get('q4')).toEqual({ x: 108, y: 70 })
  })

  it('stacks any number of colliding labels in order', () => {
    const positions = layoutOverrideLabels([
      box('a', 50, 50),
      box('b', 55, 55),
      box('c', 52, 58),
      box('d', 300, 55),
    ])
    expect(positions.get('a')).toEqual({ x: 50, y: 50 })
    expect(positions.get('b')).toEqual({ x: 55, y: 70 })
    expect(positions.get('c')).toEqual({ x: 52, y: 90 })
    // Far away horizontally: untouched even at a colliding height.
    expect(positions.get('d')).toEqual({ x: 300, y: 55 })
  })

  it('does not move a label whose x-range only touches the other', () => {
    // 60 wide at x=10 ends at 70; the next starts at 72 — a 2px gap, no
    // overlap even though the heights coincide.
    const positions = layoutOverrideLabels([box('a', 10, 10), box('b', 72, 10)])
    expect(positions.get('b')).toEqual({ x: 72, y: 10 })
  })

  it('handles an empty list and a single label', () => {
    expect(layoutOverrideLabels([]).size).toBe(0)
    expect(layoutOverrideLabels([box('a', 5, 5)]).get('a')).toEqual({ x: 5, y: 5 })
  })
})
