import { describe, expect, it } from 'vitest'
import { colorWheelPosition, hsvToRgb, rgbToHsv } from '../src/renderer/src/lib/colorWheel'

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

describe('rgbToHsv / hsvToRgb', () => {
  it('maps the pure hues and achromatic colours', () => {
    expect(rgbToHsv({ red: 255, green: 0, blue: 0 })).toEqual({ h: 0, s: 100, v: 100 })
    expect(rgbToHsv({ red: 0, green: 255, blue: 0 })).toEqual({ h: 120, s: 100, v: 100 })
    expect(rgbToHsv({ red: 0, green: 0, blue: 255 })).toEqual({ h: 240, s: 100, v: 100 })
    expect(rgbToHsv({ red: 128, green: 128, blue: 128 })).toEqual({ h: 0, s: 0, v: 50 })
    expect(rgbToHsv({ red: 0, green: 0, blue: 0 })).toEqual({ h: 0, s: 0, v: 0 })
  })

  it('round-trips through the wheel', () => {
    for (const rgb of [{ red: 255, green: 160, blue: 80 }, { red: 30, green: 80, blue: 255 }, { red: 200, green: 200, blue: 100 }]) {
      const hsv = rgbToHsv(rgb)
      const back = hsvToRgb(hsv.h, hsv.s, hsv.v)
      expect(Math.abs(back.red - rgb.red)).toBeLessThanOrEqual(2)
      expect(Math.abs(back.green - rgb.green)).toBeLessThanOrEqual(2)
      expect(Math.abs(back.blue - rgb.blue)).toBeLessThanOrEqual(2)
    }
    expect(hsvToRgb(0, 100, 100)).toEqual({ red: 255, green: 0, blue: 0 })
    expect(hsvToRgb(60, 100, 100)).toEqual({ red: 255, green: 255, blue: 0 })
    expect(hsvToRgb(300, 100, 100)).toEqual({ red: 255, green: 0, blue: 255 })
  })
})
