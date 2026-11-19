import { describe, expect, it } from 'vitest'
import { mixColor, baseColorChannels } from '../src/renderer/src/lib/colorMix'
import { migrateShow } from '../src/shared/migrations'
describe('emitter colour mixing', () => {
  const white = { red: 255, green: 255, blue: 255 }
  it('maps RGB, RGBW, RGBA, RGBAW+UV and CMY', () => {
    expect(mixColor(white, ['red', 'green', 'blue'])).toEqual(white)
    expect(mixColor(white, ['red', 'green', 'blue', 'white'])).toEqual({ red: 0, green: 0, blue: 0, white: 255 })
    expect(mixColor({ red: 200, green: 90, blue: 0 }, ['red', 'green', 'blue', 'amber'])).toEqual({ red: 0, green: 0, blue: 0, amber: 200 })
    expect(mixColor(white, ['red', 'green', 'blue', 'white', 'amber', 'uv'])).toEqual({ red: 0, green: 0, blue: 0, white: 255, amber: 0, uv: 0 })
    expect(mixColor({ red: 255, green: 0, blue: 0 }, ['cyan', 'magenta', 'yellow'])).toEqual({ cyan: 0, magenta: 255, yellow: 255 })
  })
  it('base colour channels never include White / Amber / UV', () => {
    // The wheel owns the base colour only (Jake, 19 Nov 2026): yellow
    // must not conjure Amber, and a desaturated colour must not
    // conjure White.
    const rgbawUv = ['red', 'green', 'blue', 'white', 'amber', 'uv']
    expect(baseColorChannels({ red: 255, green: 255, blue: 0 }, rgbawUv)).toEqual({ red: 255, green: 255, blue: 0 })
    expect(baseColorChannels({ red: 255, green: 128, blue: 128 }, rgbawUv)).toEqual({ red: 255, green: 128, blue: 128 })
    expect(baseColorChannels({ red: 255, green: 0, blue: 0 }, ['cyan', 'magenta', 'yellow'])).toEqual({ cyan: 0, magenta: 255, yellow: 255 })
    expect(baseColorChannels({ red: 255, green: 0, blue: 0 }, ['red', 'green'])).toEqual({ red: 255, green: 0 })
  })
  it('preserves colour favourites through migration and serialization', () => {
    const show = migrateShow({ colorFavorites: ['#ff8000'] })
    expect(migrateShow(JSON.parse(JSON.stringify(show))).colorFavorites).toEqual(['#ff8000'])
  })
})
