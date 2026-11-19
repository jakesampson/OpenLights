import { describe, expect, it } from 'vitest'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import type { FixtureDef } from '../src/shared/types'

// The virtual dimmer (LightKey, verified 19 Nov 2026 from Jake's RGBAW
// fixture): a fixture with no dimmer channel still has a working
// Dimmer — it scales all the fixture's LED values like a virtual
// master / DCA fader. Fixtures with a dimmer channel dim in hardware
// and are untouched.
describe('virtual dimmer', () => {
  const rgba: FixtureDef = { id: 'f', name: 'RGBA', type: 'rgba-4ch', channels: 4, channelStart: 1 }
  const wash: FixtureDef = { id: 'w', name: 'Wash', type: 'led-wash', channels: 7, channelStart: 1 }

  it('scales the LED channels by the cue intensity for a fixture with no dimmer channel', () => {
    const cue = { id: 's', name: 'Cue', fadeMs: 0, fixtureValues: { f: { intensity: 128, red: 255, green: 0, blue: 0, amber: 255 } } }
    expect(computeCueChannels([rgba], cue, 255, true)).toMatchObject({ 1: 128, 2: 0, 3: 0, 4: 128 })
  })

  it('scales the blue default when the cue sets only the dimmer', () => {
    const cue = { id: 's', name: 'Cue', fadeMs: 0, fixtureValues: { f: { intensity: 128 } } }
    expect(computeCueChannels([rgba], cue, 255, true)).toMatchObject({ 1: 0, 2: 0, 3: 128, 4: 0 })
  })

  it('a fresh virtual-dimmer fixture is dark with blue underneath', () => {
    // Jake, 19 Nov 2026: the default colour stays blue, but the dimmer
    // defaults to 0 — the blue default is still there (raising the
    // dimmer brings it up), it is just scaled to 0 by the unset dimmer.
    const cue = { id: 's', name: 'Cue', fadeMs: 0, fixtureValues: {} }
    expect(computeCueChannels([rgba], cue, 255, true)).toMatchObject({ 1: 0, 2: 0, 3: 0, 4: 0 })
    const open = { id: 's', name: 'Cue', fadeMs: 0, fixtureValues: { f: { intensity: 255 } } }
    expect(computeCueChannels([rgba], open, 255, true)).toMatchObject({ 1: 0, 2: 0, 3: 255, 4: 0 })
  })

  it('does not invent colour channels when the cue defines nothing and zeroMissing is off', () => {
    const cue = { id: 's', name: 'Cue', fadeMs: 0, fixtureValues: { f: { intensity: 128 } } }
    expect(computeCueChannels([rgba], cue, 255, false)).toEqual({})
  })

  it('multiplies with the master fader', () => {
    const cue = { id: 's', name: 'Cue', fadeMs: 0, fixtureValues: { f: { intensity: 128, red: 255, green: 0, blue: 0 } } }
    expect(computeCueChannels([rgba], cue, 128, true)[1]).toBe(64)
  })

  it('does not scale a fixture with a dimmer channel — the hardware dims', () => {
    const cue = { id: 's', name: 'Cue', fadeMs: 0, fixtureValues: { w: { intensity: 128, red: 255, green: 0, blue: 0 } } }
    expect(computeCueChannels([wash], cue, 255, true)).toMatchObject({ 1: 128, 2: 255, 3: 0, 4: 0 })
  })
})
