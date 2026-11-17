import { describe, expect, it } from 'vitest'
import { alignObjects, type AlignMode } from '../src/renderer/src/lib/align'
describe('object alignment', () => {
  const items = [{ id: 'a', x: 20, y: 20, width: 20, height: 20 }, { id: 'b', x: 100, y: 80, width: 40, height: 40 }, { id: 'c', x: 200, y: 200, width: 20, height: 20 }]
  it('aligns all six edges and centres', () => {
    for (const mode of ['left', 'right', 'top', 'bottom', 'center-x', 'center-y'] as AlignMode[]) {
      const output = alignObjects(items, mode), axis = ['left', 'right', 'center-x'].includes(mode) ? 'x' : 'y', size = axis === 'x' ? 'width' : 'height'
      const values = items.map((item) => output[item.id][axis] + (mode === 'left' || mode === 'top' ? -item[size] / 2 : mode === 'right' || mode === 'bottom' ? item[size] / 2 : 0))
      expect(values[0]).toBeCloseTo(values[1]); expect(values[1]).toBeCloseTo(values[2])
    }
  })
  it('distributes equal gaps on both axes and preserves the outer edges', () => {
    for (const axis of ['x', 'y'] as const) {
      const output = alignObjects(items, `space-${axis}`), size = axis === 'x' ? 'width' : 'height'
      const gap1 = output.b[axis] - items[1][size] / 2 - (output.a[axis] + items[0][size] / 2)
      const gap2 = output.c[axis] - items[2][size] / 2 - (output.b[axis] + items[1][size] / 2)
      expect(gap1).toBeCloseTo(gap2); expect(output.a[axis]).toBe(items[0][axis]); expect(output.c[axis]).toBe(items[2][axis])
    }
    expect(alignObjects([], 'left')).toEqual({})
  })
})
