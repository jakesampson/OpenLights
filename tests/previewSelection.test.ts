import { describe, expect, it } from 'vitest'
import { hitTest, marqueeSelection } from '../src/renderer/src/lib/previewSelection'
describe('preview object selection', () => {
  const items = [{ id: 'fixture', x: 100, y: 100, width: 20, height: 20 }, { id: 'truss', x: 200, y: 100, width: 100, height: 8, rotation: 90 }]
  it('hit tests fixtures and rotated objects in their local axes', () => {
    expect(hitTest(items[0], { x: 101, y: 101 })).toBe(true)
    expect(hitTest(items[1], { x: 200, y: 140 })).toBe(true)
    expect(hitTest(items[1], { x: 240, y: 100 })).toBe(false)
  })
  it('selects intersecting objects regardless of drag direction', () => {
    expect(marqueeSelection(items, { x: 80, y: 80 }, { x: 205, y: 110 })).toEqual(['fixture', 'truss'])
    expect(marqueeSelection(items, { x: 120, y: 120 }, { x: 80, y: 80 })).toEqual(['fixture'])
    expect(marqueeSelection(items, { x: 0, y: 0 }, { x: 50, y: 50 })).toEqual([])
  })
})
