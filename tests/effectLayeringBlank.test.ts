import { describe, expect, it } from 'vitest'
import type { EffectDef, FixtureDef, LivePage } from '../src/shared/types'
import { completeBaseColour } from '../src/shared/cueResolution'
import { withEffectiveIntensity } from '../src/renderer/src/lib/effectiveIntensity'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import { computeEffectPatch } from '../src/renderer/src/lib/effects'
import { composeOutput } from '../src/renderer/src/lib/outputModel'
import {
  dimmerEffectFixtureIds,
  dimmerEffectOwnedChannels,
  liveBaseValues,
  stripOwnedDimmerChannels
} from '../src/renderer/src/lib/effectDimmerOwnership'

// Effect layering blank (Jake, 28 Nov 2026): a Dimmer effect running
// from a Live button, then a colour preset triggered — the rig goes
// blank. These tests pin the mechanism with the real layer functions,
// composed exactly as App.tsx + output.ts compose them:
//   defaults -> base -> sequences -> effects -> live -> presets -> overrides
// A colour preset carries no intensity, and a virtual-dimmer fixture
// (Q12BT 4ch: R,G,B,Amber, no dimmer channel) resolves an unset virtual
// dimmer to 0 — so the preset patch writes explicit zeros on the LED
// channels, and the presets layer (spread AFTER effects) zeroes the
// effect's output. The effect never stops: activeOwnedEffects forces a
// Live-button effect back on in the runtime copy.

const washes: FixtureDef[] = [
  { id: 'w1', name: 'W1', type: 'rgba-4ch', channelStart: 1, channels: 4, previewPosition: { x: 0, y: 0 } },
  { id: 'w2', name: 'W2', type: 'rgba-4ch', channelStart: 5, channels: 4, previewPosition: { x: 100, y: 0 } },
  { id: 'w3', name: 'W3', type: 'rgba-4ch', channelStart: 9, channels: 4, previewPosition: { x: 200, y: 0 } },
  { id: 'w4', name: 'W4', type: 'rgba-4ch', channelStart: 13, channels: 4, previewPosition: { x: 300, y: 0 } }
]

const pars: FixtureDef[] = [
  { id: 'p1', name: 'P1', type: 'par', channelStart: 1, channels: 4, previewPosition: { x: 0, y: 0 } },
  { id: 'p2', name: 'P2', type: 'par', channelStart: 5, channels: 4, previewPosition: { x: 100, y: 0 } },
  { id: 'p3', name: 'P3', type: 'par', channelStart: 9, channels: 4, previewPosition: { x: 200, y: 0 } },
  { id: 'p4', name: 'P4', type: 'par', channelStart: 13, channels: 4, previewPosition: { x: 300, y: 0 } }
]

function bellDimmer(fixtureIds: string[]): EffectDef {
  return {
    id: 'eff-bell',
    name: 'Bell Dimmer',
    fixtureIds,
    attribute: 'intensity',
    waveform: 'sine',
    speed: 1,
    syncToBpm: false,
    size: 128,
    offset: 128,
    phaseSpread: 0,
    enabled: true,
    kind: 'curve',
    durationMs: 2000,
    timingMode: 'fixed',
    timeOffset: 0,
    curveComponents: [{
      component: 'intensity',
      curvedSegments: [false, false],
      points: [
        { id: 'p0', x: 0, y: 0 },
        { id: 'p1', x: 0.5, y: 1 },
        { id: 'p2', x: 1, y: 0 }
      ]
    }]
  }
}

/** A Red preset's stored values — colour only, no intensity. */
function redValues(fixtures: FixtureDef[]): Record<string, Record<string, number>> {
  return Object.fromEntries(fixtures.map((f) => [f.id, { red: 255, green: 0, blue: 0 }]))
}

describe('effect layering blank — mechanism', () => {
  it('a running dimmer effect alone lights the virtual-dimmer washes', () => {
    // Base look carries the default blue (no cue / preset / override).
    const baseValues = Object.fromEntries(washes.map((f) => [f.id, { red: 0, green: 0, blue: 255, amber: 0 }]))
    const effPatch = computeEffectPatch(washes, [bellDimmer(washes.map((f) => f.id))], 1.0, 120, 255, { baseValues })
    // Bell peak at t=1.0s of a 2s curve: every wash at full blue.
    for (const f of washes) {
      expect(effPatch[f.channelStart + 2]).toBe(255)
    }
  })

  it('a Red preset patch on its own writes explicit zeros on virtual-dimmer washes', () => {
    const presetPatch = computeCueChannels(washes, {
      id: 'red', name: 'Red', fadeMs: 0,
      fixtureValues: withEffectiveIntensity(completeBaseColour(redValues(washes), washes), {})
    }, 255)
    // No intensity anywhere (the preset has none, and effects are not an
    // intensity source), so the virtual dimmer resolves to 0 and every
    // LED channel the preset wrote is scaled to 0.
    for (const f of washes) {
      expect(presetPatch[f.channelStart]).toBe(0)
      expect(presetPatch[f.channelStart + 1]).toBe(0)
      expect(presetPatch[f.channelStart + 2]).toBe(0)
    }
  })

  it('composing the effect under the Red preset blanks the rig (the bug)', () => {
    const baseValues = redValues(washes)
    const effPatch = computeEffectPatch(washes, [bellDimmer(washes.map((f) => f.id))], 1.0, 120, 255, { baseValues })
    const presetPatch = computeCueChannels(washes, {
      id: 'red', name: 'Red', fadeMs: 0,
      fixtureValues: withEffectiveIntensity(completeBaseColour(redValues(washes), washes), {})
    }, 255)
    const defaults = computeCueChannels(washes, { id: 'defaults', name: 'Defaults', fadeMs: 0, fixtureValues: {} }, 255, true)
    const output = composeOutput({ defaults, effects: effPatch, presets: presetPatch })
    // The effect patch alone carries red at full (bell peak); the preset
    // patch's zeros sit above it in composeOutput and win.
    expect(effPatch[washes[0].channelStart]).toBe(255)
    expect(output[washes[0].channelStart]).toBe(0)
    expect(output[washes[1].channelStart]).toBe(0)
    expect(output[washes[2].channelStart]).toBe(0)
    expect(output[washes[3].channelStart]).toBe(0)
  })

  it('the same recipe does NOT blank physical-dimmer pars (control)', () => {
    // A physical-dimmer fixture's preset patch writes no intensity
    // channel (the preset carries none), so the effect's intensity
    // survives the presets layer.
    const baseValues = redValues(pars)
    const effPatch = computeEffectPatch(pars, [bellDimmer(pars.map((f) => f.id))], 1.0, 120, 255, { baseValues })
    const presetPatch = computeCueChannels(pars, {
      id: 'red', name: 'Red', fadeMs: 0,
      fixtureValues: withEffectiveIntensity(completeBaseColour(redValues(pars), pars), {})
    }, 255)
    const defaults = computeCueChannels(pars, { id: 'defaults', name: 'Defaults', fadeMs: 0, fixtureValues: {} }, 255, true)
    const output = composeOutput({ defaults, effects: effPatch, presets: presetPatch })
    expect(presetPatch[pars[0].channelStart]).toBeUndefined()
    expect(effPatch[pars[0].channelStart]).toBe(255)
    expect(output[pars[0].channelStart]).toBe(255)
    expect(output[pars[0].channelStart + 1]).toBe(255)
  })

  it('the effect patch carries the active preset colour as its source', () => {
    // The dimmer effect scales the base look's colour — so with Red
    // active the effect layer itself is red at the effect level, and
    // the only thing hiding it is the preset patch's zeros above it.
    const effPatch = computeEffectPatch(washes, [bellDimmer(washes.map((f) => f.id))], 1.0, 120, 255, { baseValues: redValues(washes) })
    expect(effPatch[washes[0].channelStart]).toBe(255)
    expect(effPatch[washes[0].channelStart + 2]).toBe(0)
  })
})

describe('effect layering blank — the fix (ownership)', () => {
  const effect = bellDimmer(washes.map((f) => f.id))
  const presetPatch = () => computeCueChannels(washes, {
    id: 'red', name: 'Red', fadeMs: 0,
    fixtureValues: withEffectiveIntensity(completeBaseColour(redValues(washes), washes), {})
  }, 255)
  const defaults = () => computeCueChannels(washes, { id: 'defaults', name: 'Defaults', fadeMs: 0, fixtureValues: {} }, 255, true)
  const effPatchAt = (t: number) => computeEffectPatch(washes, [effect], t, 120, 255, { baseValues: redValues(washes) })

  it('only virtual-dimmer fixtures covered by a running Dimmer effect are owned', () => {
    expect([...dimmerEffectFixtureIds(washes, [effect])].sort()).toEqual(['w1', 'w2', 'w3', 'w4'])
    // A physical-dimmer fixture is not owned: the preset patch writes
    // no intensity channel, so the effect's intensity already survives.
    expect(dimmerEffectFixtureIds(pars, [bellDimmer(pars.map((f) => f.id))]).size).toBe(0)
    // Disabled effects and colour effects own nothing.
    expect(dimmerEffectFixtureIds(washes, [{ ...effect, enabled: false }]).size).toBe(0)
    expect(dimmerEffectFixtureIds(washes, [{ ...effect, attribute: 'red' }]).size).toBe(0)
    // An effect covering only some fixtures owns only those.
    expect([...dimmerEffectFixtureIds(washes, [{ ...effect, fixtureIds: ['w2'] }])]).toEqual(['w2'])
  })

  it('owned channels are exactly the LED channels the effect scales', () => {
    // rgba-4ch: red 0, green 1, blue 2, amber 3 — all four LED channels.
    expect([...dimmerEffectOwnedChannels(washes, [effect])].sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    expect(dimmerEffectOwnedChannels(washes, []).size).toBe(0)
  })

  it('stripping the owned channels from the preset patch restores the effect', () => {
    const owned = dimmerEffectOwnedChannels(washes, [effect])
    const output = composeOutput({ defaults: defaults(), effects: effPatchAt(1.0), presets: stripOwnedDimmerChannels(presetPatch(), owned) })
    // Bell peak: red at full on every wash; blue stays 0 (the effect
    // carries Red, not the default blue).
    for (const f of washes) {
      expect(output[f.channelStart]).toBe(255)
      expect(output[f.channelStart + 2]).toBe(0)
    }
  })

  it('the restored colour still follows the effect level (not frozen)', () => {
    const owned = dimmerEffectOwnedChannels(washes, [effect])
    // Bell trough at t=0: the effect is at 0, so the rig is dark.
    const dark = composeOutput({ defaults: defaults(), effects: effPatchAt(0), presets: stripOwnedDimmerChannels(presetPatch(), owned) })
    expect(dark[washes[0].channelStart]).toBe(0)
    // Mid-rise at t=0.5s: the curve is halfway up, so red is ~half.
    const mid = composeOutput({ defaults: defaults(), effects: effPatchAt(0.5), presets: stripOwnedDimmerChannels(presetPatch(), owned) })
    expect(mid[washes[0].channelStart]).toBe(128)
  })

  it('with the effect off, the preset patch is untouched (still dark, as before)', () => {
    const owned = dimmerEffectOwnedChannels(washes, [{ ...effect, enabled: false }])
    expect(owned.size).toBe(0)
    const output = composeOutput({ defaults: defaults(), effects: {}, presets: stripOwnedDimmerChannels(presetPatch(), owned) })
    expect(output[washes[0].channelStart]).toBe(0)
  })

  it('the strip leaves non-LED channels alone', () => {
    const owned = dimmerEffectOwnedChannels(washes, [effect])
    const patch = { 1: 255, 2: 0, 3: 0, 4: 0, 17: 128 }
    const stripped = stripOwnedDimmerChannels(patch, owned)
    expect(stripped).toEqual({ 17: 128 })
    expect(patch).toEqual({ 1: 255, 2: 0, 3: 0, 4: 0, 17: 128 })
  })

  it('liveBaseValues resolves a lit Live colour button for the effect', () => {
    const pages: LivePage[] = [{
      id: 'page1', name: 'Page',
      controls: [
        { id: 'btn-red', name: 'Red', type: 'push', presetIds: ['preset-red'] },
        { id: 'btn-off', name: 'Off', type: 'push', presetIds: ['preset-red'] }
      ]
    }]
    const presets = [{ id: 'preset-red', name: 'Red', category: 'color', fixtureValues: redValues(washes), fans: [] }]
    const values = liveBaseValues(pages, { 'btn-red': 255 }, {}, presets, washes)
    for (const f of washes) expect(values[f.id]).toEqual({ red: 255, green: 0, blue: 0 })
    // A fader at half scales the colour by half (fader x effect).
    const half = liveBaseValues(pages, { 'btn-red': 128 }, {}, presets, washes)
    for (const f of washes) expect(half[f.id]?.red).toBe(128)
    // A button at 0 contributes nothing.
    expect(liveBaseValues(pages, { 'btn-red': 0 }, {}, presets, washes)).toEqual({})
  })
})
