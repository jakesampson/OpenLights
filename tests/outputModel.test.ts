import { describe, expect, it } from 'vitest'
import { composeOutput, type OutputLayers } from '../src/renderer/src/lib/outputModel'
describe('output precedence', () => {
  it('pins all layer pairs and release returns to the lower contribution', () => {
    const order = ['base', 'sequences', 'effects', 'live', 'presets', 'overrides'] as const
    for (let low = 0; low < order.length; low++) for (let high = low + 1; high < order.length; high++) {
      const layers: OutputLayers = { [order[low]]: { 1: 20 }, [order[high]]: { 1: 200 } }
      expect(composeOutput(layers)[1]).toBe(200)
      delete layers[order[high]]; expect(composeOutput(layers)[1]).toBe(20)
    }
  })
  it('scales intensity only and blackout beats held frames and every layer', () => {
    expect(composeOutput({ base: { 1: 200, 2: 200 }, intensityChannels: [1], master: 127.5 })).toEqual({ 1: 100, 2: 200 })
    expect(composeOutput({ freeze: true, heldFrame: { 1: 230 }, blackout: true })[1]).toBe(0)
    expect(composeOutput({ blind: true, base: { 1: 0 }, heldFrame: { 1: 230 } })[1]).toBe(230)
    expect(composeOutput({ base: {}, previousChannels: [1] })[1]).toBe(0)
  })
})
