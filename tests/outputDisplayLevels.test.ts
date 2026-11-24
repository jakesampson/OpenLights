// The display dimmer (Jake, 24 Nov 2026): the beam length follows
// the dimmer only, so the output engine tracks each fixture's dimmer
// as the endpoint brightness of the base look — never as the max of
// a blended frame, which dips mid-crossfade.
import { describe, expect, it } from 'vitest'
import { patchBrightness, lerpLevels, frameBrightness, interpolateOutputFrame } from '../src/renderer/src/lib/output'
import type { FixtureDef } from '../src/shared/types'

// Virtual-dimmer Q12BT (rgba-4ch, no intensity channel) at 1-4; a
// real-dimmer wash (led-wash, intensity first) at 5-11; a 4-cell bar
// (pixel-bar-17ch, master dimmer at offset 12) at 12-28.
const q1: FixtureDef = { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 1, channels: 4 }
const w1: FixtureDef = { id: 'w1', name: 'W1', type: 'led-wash', channelStart: 5, channels: 7 }
const bar: FixtureDef = { id: 'bar', name: 'Bar', type: 'pixel-bar-17ch', channelStart: 12, channels: 17 }
const fixtures = [q1, w1, bar]

describe('patchBrightness', () => {
  it('reads the intensity channel where the fixture has one, ignoring the colour', () => {
    // Wash at half dimmer showing full red: the dimmer is 128, not 255.
    expect(patchBrightness({ 5: 128, 6: 255, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 }, fixtures)).toEqual({ w1: 128 })
  })

  it('reads the peak colour channel where the fixture has no dimmer', () => {
    expect(patchBrightness({ 1: 255, 2: 0, 3: 0, 4: 0 }, fixtures)).toEqual({ q1: 255 })
    expect(patchBrightness({ 1: 0, 2: 0, 3: 200, 4: 90 }, fixtures)).toEqual({ q1: 200 })
  })

  it('reads a multipart fixture by its master dimmer, counting cell colours for a virtual one', () => {
    expect(patchBrightness({ 24: 128 }, fixtures)).toEqual({})
    const full: Record<number, number> = {}
    for (let ch = 12; ch <= 28; ch++) full[ch] = 0
    full[24] = 200
    expect(patchBrightness(full, fixtures)).toEqual({ bar: 200 })
  })

  it('reads zero for a disabled fixture, even when the patch drives it', () => {
    expect(patchBrightness({ 1: 255, 2: 0, 3: 0, 4: 0 }, [{ ...q1, disabled: true }])).toEqual({ q1: 0 })
  })

  it('claims no level for a fixture a partial patch does not determine', () => {
    // Automation driving only Q1's red channel: the other channels
    // keep their last values on the interface, so the patch does
    // not determine the brightness — the Preview must fall back to
    // the transmitted frame, not read 255 (or 0) from one channel.
    expect(patchBrightness({ 1: 255 }, fixtures)).toEqual({})
    expect(patchBrightness({ 1: 255, 2: 0, 3: 0, 4: 0, 5: 255 }, fixtures)).toEqual({ q1: 255 })
  })
})

describe('frameBrightness', () => {
  it('matches the Preview derivation for a single frame', () => {
    expect(frameBrightness({ 1: 128, 2: 0, 3: 128, 4: 0 }, q1)).toBe(128)
    expect(frameBrightness({ 5: 200, 6: 255, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 }, w1)).toBe(200)
  })
})

describe('the crossfade dip lives in the blended frame, not the levels', () => {
  it('a red→blue fade at full dimmer reads full at both ends and all the way through', () => {
    const from = { 1: 255, 2: 0, 3: 0, 4: 0 }
    const to = { 1: 0, 2: 0, 3: 255, 4: 0 }
    expect(patchBrightness(from, fixtures)).toEqual({ q1: 255 })
    expect(patchBrightness(to, fixtures)).toEqual({ q1: 255 })
    // The transmitted frame genuinely passes through purple at half
    // height — that is the linear crossfade doing its job, and the
    // beam colour should pass through purple too.
    const mid = interpolateOutputFrame(from, to, 0.5)
    expect(frameBrightness(mid, q1)).toBe(128)
    // But the display dimmer interpolates the endpoint levels, so
    // it never dips: the beam stays full length while the colour
    // changes underneath it.
    expect(lerpLevels(patchBrightness(from, fixtures), patchBrightness(to, fixtures), 0.5)).toEqual({ q1: 255 })
    expect(lerpLevels(patchBrightness(from, fixtures), patchBrightness(to, fixtures), 0.25)).toEqual({ q1: 255 })
    expect(lerpLevels(patchBrightness(from, fixtures), patchBrightness(to, fixtures), 0.75)).toEqual({ q1: 255 })
  })

  it('a dimmer fade follows the dimmer down', () => {
    const from = { 1: 255, 2: 0, 3: 0, 4: 0 }
    const to = { 1: 0, 2: 0, 3: 0, 4: 0 }
    expect(lerpLevels(patchBrightness(from, fixtures), patchBrightness(to, fixtures), 0.5)).toEqual({ q1: 128 })
    expect(lerpLevels(patchBrightness(from, fixtures), patchBrightness(to, fixtures), 1)).toEqual({ q1: 0 })
  })

  it('a combined colour+dimmer fade follows the dimmer', () => {
    const from = { 1: 255, 2: 0, 3: 0, 4: 0 }
    const to = { 1: 0, 2: 0, 3: 128, 4: 0 }
    expect(lerpLevels(patchBrightness(from, fixtures), patchBrightness(to, fixtures), 0.5)).toEqual({ q1: 192 })
  })
})

describe('lerpLevels', () => {
  it('treats a fixture absent from one end as dark there', () => {
    expect(lerpLevels({ a: 200 }, { b: 100 }, 0.5)).toEqual({ a: 100, b: 50 })
  })

  it('clamps progress', () => {
    expect(lerpLevels({ a: 0 }, { a: 255 }, 2)).toEqual({ a: 255 })
    expect(lerpLevels({ a: 0 }, { a: 255 }, -1)).toEqual({ a: 0 })
  })
})
