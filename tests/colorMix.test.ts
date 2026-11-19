import { describe, expect, it } from 'vitest'
import { mixColor, baseColorChannels, colorChannels } from '../src/renderer/src/lib/colorMix'
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

  it('colorChannels picks the CMY set when present, else the RGB set', () => {
    expect(colorChannels(['intensity', 'red', 'green', 'blue', 'white'])).toEqual(['red', 'green', 'blue'])
    expect(colorChannels(['intensity', 'cyan', 'magenta', 'yellow'])).toEqual(['cyan', 'magenta', 'yellow'])
    expect(colorChannels(['intensity', 'red', 'green'])).toEqual(['red', 'green'])
    expect(colorChannels(['intensity'])).toEqual([])
  })
  it('fans a base colour out to every beam of a multipart fixture', () => {
    // The wheel drives all the LEDs together (Jake, 19 Nov 2026) —
    // the OFL "red 2" spelling and the built-in "red2" spelling alike.
    expect(baseColorChannels({ red: 255, green: 0, blue: 0 }, ['intensity', 'red', 'green', 'blue', 'red 2', 'green 2', 'blue 2', 'red 3', 'green 3', 'blue 3'])).toEqual({ red: 255, green: 0, blue: 0, 'red 2': 255, 'green 2': 0, 'blue 2': 0, 'red 3': 255, 'green 3': 0, 'blue 3': 0 })
    expect(baseColorChannels({ red: 255, green: 0, blue: 0 }, ['red', 'green', 'blue', 'red2', 'green2', 'blue2'])).toEqual({ red: 255, green: 0, blue: 0, red2: 255, green2: 0, blue2: 0 })
    // A CMY pod still takes the complement, per pod — and White /
    // Amber / UV are still never written by the wheel.
    expect(baseColorChannels({ red: 255, green: 0, blue: 0 }, ['cyan', 'magenta', 'yellow', 'cyan 2', 'magenta 2', 'yellow 2'])).toEqual({ cyan: 0, magenta: 255, yellow: 255, 'cyan 2': 0, 'magenta 2': 255, 'yellow 2': 255 })
    expect(baseColorChannels({ red: 255, green: 255, blue: 0 }, ['red', 'green', 'blue', 'white', 'amber', 'uv', 'red 2', 'green 2', 'blue 2', 'white 2'])).toEqual({ red: 255, green: 255, blue: 0, 'red 2': 255, 'green 2': 255, 'blue 2': 0 })
  })
  it('mixColor applies a whole colour to every beam', () => {
    // A colour favourite / centre pick colours every cell the same
    // way, each pod mixing its own White from the same RGB.
    expect(mixColor({ red: 255, green: 255, blue: 255 }, ['red', 'green', 'blue', 'white', 'red 2', 'green 2', 'blue 2', 'white 2'])).toEqual({ red: 0, green: 0, blue: 0, white: 255, 'red 2': 0, 'green 2': 0, 'blue 2': 0, 'white 2': 255 })
    expect(mixColor({ red: 255, green: 0, blue: 0 }, ['cyan', 'magenta', 'yellow', 'cyan 2', 'magenta 2', 'yellow 2'])).toEqual({ cyan: 0, magenta: 255, yellow: 255, 'cyan 2': 0, 'magenta 2': 255, 'yellow 2': 255 })
  })
  it('colorChannels lists every beam, in pod order', () => {
    expect(colorChannels(['intensity', 'red', 'green', 'blue', 'red 2', 'green 2', 'blue 2'])).toEqual(['red', 'green', 'blue', 'red 2', 'green 2', 'blue 2'])
    expect(colorChannels(['intensity', 'red', 'green', 'blue', 'red2', 'green2', 'blue2'])).toEqual(['red', 'green', 'blue', 'red2', 'green2', 'blue2'])
    expect(colorChannels(['intensity', 'cyan', 'magenta', 'yellow', 'cyan 2', 'magenta 2', 'yellow 2'])).toEqual(['cyan', 'magenta', 'yellow', 'cyan 2', 'magenta 2', 'yellow 2'])
  })
  it('preserves colour favourites through migration and serialization', () => {
    const show = migrateShow({ colorFavorites: ['#ff8000'] })
    expect(migrateShow(JSON.parse(JSON.stringify(show))).colorFavorites).toEqual(['#ff8000'])
  })
})
