// Jake, 27 Nov 2026 — regression: after the 052b41e5 push the SlimPAR
// Q12 BT washes were reported dark under the K.I.T.T. colour effect
// while PB1 lit. Jake's recipe: K.I.T.T. with 2 SlimPAR profiles and
// one multi-cell fixture (PB1).
//
// The d25da86 fix modelled the wash as the built-in Simger Q12BT
// (RGBA 4ch, no dimmer) and asserted "Q12BT washes have no dimmer
// channel". The real Chauvet SlimPAR Q12 BT (OFL, verified against
// the manual Rev. 4 and open-fixture-library.org/chauvet-dj/
// slimpar-q12-bt) has TWO modes: 4ch = Red, Green, Blue, Amber (no
// dimmer) and 8ch = Red, Green, Blue, Amber, Strobe, Auto Program,
// Auto Program Speed, Dimmer (ch 8). These tests use the real
// OFL-derived profiles in both modes, and prove the washes light
// under K.I.T.T. in each — the 8ch ones via the dimmer the colour
// effect opens (writeColourDimmer), the 4ch ones from the colour
// alone — while PB1 keeps working. Probed in the real app too
// (~/workspace/kitt-q12-probe, 3 variants, all green).
import { describe, expect, it } from 'vitest'
import type { EffectDef, FixtureDef, FixtureProfile } from '../src/shared/types'
import { computeEffectPatch } from '../src/renderer/src/lib/effects'
import { frameBrightness } from '../src/renderer/src/lib/output'
import { previewFixtureValues } from '../src/renderer/src/lib/previewOutput'
import { fixtureColor } from '../src/renderer/src/components/StagePreview'

function chan(number: number, attribute: string): FixtureProfile['modes'][number]['channels'][number] {
  return {
    number,
    attribute,
    propertyType: attribute === 'intensity' ? 'intensity' : /^(red|green|blue|amber)$/.test(attribute) ? 'color' : 'other',
    min: 0,
    max: 255,
    defaultValue: 0,
    highlightValue: 255,
  } as FixtureProfile['modes'][number]['channels'][number]
}

// Real Chauvet SlimPAR Q12 BT (OFL): 4ch = R,G,B,Amber; 8ch adds
// Strobe, Auto Program, Auto Program Speed, Dimmer (ch 8).
function q12Profile(mode: '4ch' | '8ch'): FixtureProfile {
  const channels =
    mode === '4ch'
      ? [chan(0, 'red'), chan(1, 'green'), chan(2, 'blue'), chan(3, 'amber')]
      : [
          chan(0, 'red'), chan(1, 'green'), chan(2, 'blue'), chan(3, 'amber'),
          chan(4, 'strobe'), chan(5, 'function'), chan(6, 'speed'), chan(7, 'intensity'),
        ]
  return { id: `chauvet-slimpar-q12-bt-${mode}`, name: `SlimPAR Q12 BT (${mode})`, manufacturer: 'Chauvet DJ', legacyType: 'par', modes: [{ id: mode, name: mode, channels }] }
}

function q12(id: string, name: string, channelStart: number, mode: '4ch' | '8ch'): FixtureDef {
  return {
    id, name, type: 'par', profile: q12Profile(mode),
    channelStart, channels: mode === '4ch' ? 4 : 8, universe: 1,
    previewPosition: { x: 200, y: 300 },
  }
}

const pb1: FixtureDef = {
  id: 'pb1', name: 'PB1', type: 'par', profileId: 'pan-4x1x30-17ch',
  channelStart: 1, channels: 17, universe: 1,
  previewPosition: { x: 400, y: 300 },
}

function kitt(fixtureIds: string[]): EffectDef {
  return {
    id: 'kitt', name: 'K.I.T.T.', fixtureIds, attribute: 'color',
    waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 128,
    phaseSpread: 0, enabled: true, kind: 'pattern', pattern: 'scanner',
    samples: [{ id: 'bg', color: '#000000' }, { id: 'fg', color: '#ff0000' }],
    durationMs: 1000, timingMode: 'fixed', length: 1, overshoot: 0,
  }
}

interface Lit {
  maxRed: number
  maxIntensity: number
  maxFrameBrightness: number
  everLitPreview: boolean
}

function runCycle(fixtures: FixtureDef[], effect: EffectDef): Record<string, Lit> {
  const lit: Record<string, Lit> = {}
  for (const f of fixtures) lit[f.id] = { maxRed: 0, maxIntensity: 0, maxFrameBrightness: 0, everLitPreview: false }
  // Two full 1 s cycles, 20 ms steps.
  for (let step = 0; step <= 100; step++) {
    const t = step * 0.02
    const patch = computeEffectPatch(fixtures, [effect], t, 120)
    const frame = new Array(512).fill(0)
    for (const [ch, v] of Object.entries(patch)) frame[Number(ch) - 1] = v
    for (const f of fixtures) {
      const values = previewFixtureValues(f, frame)
      const rec = lit[f.id]
      rec.maxRed = Math.max(rec.maxRed, values.red ?? 0)
      rec.maxIntensity = Math.max(rec.maxIntensity, values.intensity ?? 0)
      rec.maxFrameBrightness = Math.max(rec.maxFrameBrightness, frameBrightness(patch, f))
      // The Preview beam intensity fallback (StagePreview):
      // values.intensity ?? displayLevels (frame brightness for an
      // effect-touched fixture) ?? max colour channel. The icon colour
      // is fixtureColor.
      const beamIntensity = values.intensity ?? frameBrightness(patch, f) ?? Math.max(values.red ?? 0, values.green ?? 0, values.blue ?? 0)
      if (beamIntensity > 0 && fixtureColor(values) !== '#000000') rec.everLitPreview = true
    }
  }
  return lit
}

describe('K.I.T.T. with 2 real SlimPAR Q12 BT + PB1 (Jake regression, 27 Nov 2026)', () => {
  it('8ch SlimPARs (physical dimmer on ch 8) light under K.I.T.T.', () => {
    const q5 = q12('q5', 'SlimPAR Q12 BT 5', 18, '8ch')
    const q6 = q12('q6', 'SlimPAR Q12 BT 6', 26, '8ch')
    const lit = runCycle([pb1, q5, q6], kitt(['pb1', 'q5', 'q6']))
    // The colour effect opens the dimmer, so the eye lights the wash.
    expect(lit.q5.maxRed).toBe(255)
    expect(lit.q6.maxRed).toBe(255)
    expect(lit.q5.maxIntensity).toBe(255)
    expect(lit.q6.maxIntensity).toBe(255)
    expect(lit.q5.everLitPreview).toBe(true)
    expect(lit.q6.everLitPreview).toBe(true)
    expect(lit.pb1.maxRed).toBe(255)
    expect(lit.pb1.maxIntensity).toBe(255)
  })

  it('4ch SlimPARs (no dimmer channel) light under K.I.T.T. from colour alone', () => {
    const q5 = q12('q5', 'SlimPAR Q12 BT 5', 18, '4ch')
    const q6 = q12('q6', 'SlimPAR Q12 BT 6', 22, '4ch')
    const lit = runCycle([pb1, q5, q6], kitt(['pb1', 'q5', 'q6']))
    expect(lit.q5.maxRed).toBe(255)
    expect(lit.q6.maxRed).toBe(255)
    expect(lit.q5.maxIntensity).toBe(0)
    expect(lit.q6.maxIntensity).toBe(0)
    expect(lit.q5.everLitPreview).toBe(true)
    expect(lit.q6.everLitPreview).toBe(true)
    expect(lit.pb1.maxRed).toBe(255)
  })

  it('the black phase leaves an 8ch SlimPAR dimmer alone (never closes it)', () => {
    const q5 = q12('q5', 'SlimPAR Q12 BT 5', 18, '8ch')
    const q6 = q12('q6', 'SlimPAR Q12 BT 6', 26, '8ch')
    const effect = kitt(['pb1', 'q5', 'q6'])
    // t = 0: the eye is on PB1's first cell; both washes are black.
    const patch = computeEffectPatch([pb1, q5, q6], [effect], 0, 120)
    expect(patch[18]).toBe(0)
    expect(patch[26]).toBe(0)
    // No intensity entry for either wash — the base look's dimmer stands.
    expect(patch[25]).toBeUndefined()
    expect(patch[33]).toBeUndefined()
  })
})
