import { describe, expect, it } from 'vitest'
import { colorWheelPosition } from '../src/renderer/src/lib/colorWheel'

describe('colorWheelPosition', () => {
  it('places pure red at the top of the wheel', () => {
    const position = colorWheelPosition({ red: 255, green: 0, blue: 0 })

    expect(position.x).toBeCloseTo(50)
    expect(position.y).toBeCloseTo(14)
  })

  it('places green at its corresponding hue on the wheel', () => {
    const position = colorWheelPosition({ red: 0, green: 255, blue: 0 })

    expect(position.x).toBeCloseTo(81.18, 1)
    expect(position.y).toBeCloseTo(68)
  })

  it('places achromatic colours at the wheel centre', () => {
    expect(colorWheelPosition({ red: 128, green: 128, blue: 128 })).toEqual({
      x: 50,
      y: 50
    })
  })
})
