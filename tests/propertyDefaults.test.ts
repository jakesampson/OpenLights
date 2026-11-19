import { describe, expect, it } from 'vitest'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import { composeOutput } from '../src/renderer/src/lib/outputModel'
import type { FixtureDef } from '../src/shared/types'
describe('fixture property defaults', () => {
  it('uses project overrides over profile defaults and restores defaults when overlays release', () => {
    const fixture: FixtureDef = { id: 'f', name: 'Head', type: 'moving-head', channels: 8, channelStart: 1, defaultValues: { pan: 40 } }
    const defaults = computeCueChannels([fixture], { id: 's', name: 'Empty', fadeMs: 0, fixtureValues: {} }, 255, true)
    expect(defaults[2]).toBe(40); expect(defaults[3]).toBe(128)
    expect(composeOutput({ defaults, overrides: { 2: 230 } })[2]).toBe(230)
    expect(composeOutput({ defaults })[2]).toBe(40)
  })

  it('defaults an undefined colour to blue (LightKey Guide p.85)', () => {
    // A fixture with no colour defined in the cue lights blue when its
    // dimmer is open: RGB red 0 / green 0 / blue 255. A custom default
    // wins over blue, and a colour defined in the cue wins over both.
    const fixture: FixtureDef = { id: 'f', name: 'Head', type: 'moving-head', channels: 8, channelStart: 1 }
    const empty = { id: 's', name: 'Empty', fadeMs: 0, fixtureValues: {} }
    const defaults = computeCueChannels([fixture], empty, 255, true)
    expect([defaults[4], defaults[5], defaults[6]]).toEqual([0, 0, 255])
    const custom: FixtureDef = { ...fixture, defaultValues: { red: 255, green: 128, blue: 0 } }
    expect(computeCueChannels([custom], empty, 255, true)).toMatchObject({ 4: 255, 5: 128, 6: 0 })
    const defined = { id: 's', name: 'Red', fadeMs: 0, fixtureValues: { f: { intensity: 255, red: 255, green: 0, blue: 0 } } }
    expect(computeCueChannels([fixture], defined, 255, true)).toMatchObject({ 4: 255, 5: 0, 6: 0 })
    // A colour explicitly defined as black stays black — the default
    // only applies when the colour is undefined.
    const black = { id: 's', name: 'Black', fadeMs: 0, fixtureValues: { f: { intensity: 255, red: 0, green: 0, blue: 0 } } }
    expect(computeCueChannels([fixture], black, 255, true)).toMatchObject({ 4: 0, 5: 0, 6: 0 })
  })

  it('defaults an undefined CMY colour to blue (cyan + magenta full)', () => {
    const cmy: FixtureDef = {
      id: 'c', name: 'CMY Head', type: 'moving-head', channels: 4, channelStart: 1,
      profile: {
        id: 'cmy-test', name: 'CMY Test', manufacturer: 'Test', legacyType: 'moving-head',
        modes: [{
          id: 'default', name: 'Default mode',
          channels: [
            { number: 0, attribute: 'intensity', propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
            { number: 1, attribute: 'cyan', propertyType: 'color', min: 0, max: 255, defaultValue: 255, highlightValue: 255 },
            { number: 2, attribute: 'magenta', propertyType: 'color', min: 0, max: 255, defaultValue: 255, highlightValue: 255 },
            { number: 3, attribute: 'yellow', propertyType: 'color', min: 0, max: 255, defaultValue: 0, highlightValue: 255 }
          ]
        }]
      }
    }
    const empty = { id: 's', name: 'Empty', fadeMs: 0, fixtureValues: {} }
    expect(computeCueChannels([cmy], empty, 255, true)).toMatchObject({ 2: 255, 3: 255, 4: 0 })
  })
})
