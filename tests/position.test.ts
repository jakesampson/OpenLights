import { describe, expect, it } from 'vitest'
import { positionValues, splitPosition, transformPosition } from '../src/renderer/src/lib/position'
describe('fixture position mapping', () => {
  it('splits fine channels and applies inversion and swapping', () => {
    expect(splitPosition(1)).toEqual({ coarse: 255, fine: 255 })
    expect(positionValues(0.5, 0, ['pan', 'panFine', 'tilt'])).toEqual({ pan: 128, panFine: 0, tilt: 0 })
    expect(transformPosition({ pan: 0, panFine: 0 }, { invertPan: true })).toEqual({ pan: 255, panFine: 255 })
    expect(transformPosition({ pan: 20 }, { swapPanTilt: true })).toEqual({ tilt: 20 })
    expect(transformPosition({ pan: 20, tilt: 90 }, { swapPanTilt: true })).toEqual({ tilt: 20, pan: 90 })
  })
})
