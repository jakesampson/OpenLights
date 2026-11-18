import { describe, expect, it } from 'vitest'
import { fitPreview } from '../src/renderer/src/lib/previewViewport'
describe('preview fit transforms', () => {
  it('contains every object with the preview aspect ratio', () => {
    const items = [{ x: -20, y: 30, width: 30, height: 20 }, { x: 900, y: 500, width: 40, height: 40 }]
    const view = fitPreview(items)
    expect(view.width / view.height).toBeCloseTo(800 / 340)
    for (const item of items) { expect(view.x).toBeLessThan(item.x); expect(view.y).toBeLessThan(item.y); expect(view.x + view.width).toBeGreaterThan(item.x + item.width); expect(view.y + view.height).toBeGreaterThan(item.y + item.height) }
  })
  it('fits the selected subset more tightly and handles empty selections', () => {
    const selection = [{ x: 100, y: 100, width: 10, height: 10 }]
    expect(fitPreview(selection).width).toBeLessThan(fitPreview([...selection, { x: 1000, y: 1000, width: 10, height: 10 }]).width)
    expect(fitPreview([])).toEqual({ x: 0, y: 0, width: 800, height: 340 })
  })
})
