import { describe, expect, it } from 'vitest'
import type { EffectDef } from '../src/shared/types'
import { activeOwnedEffects } from '../src/renderer/src/lib/effectOwnership'

const effect = (id: string, owner?: EffectDef['owner'], enabled = true): EffectDef => ({ id, name: id, fixtureIds: [], attribute: 'intensity', waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 0, enabled, phaseSpread: 0, owner })
describe('effect ownership', () => {
  it('keeps migrated global effects active and gates owned effects', () => {
    const effects = [effect('global'), effect('cue', { type: 'cue', id: 'c' }), effect('preset', { type: 'preset', id: 'p' }), effect('sequence', { type: 'sequence', id: 's' })]
    expect(activeOwnedEffects(effects, { presets: [], sequences: [], cues: {} }).map((item) => item.id)).toEqual(['global'])
    expect(activeOwnedEffects(effects, { presets: ['p'], sequences: ['s'], cues: { c: 255 } }).map((item) => item.id)).toEqual(['global', 'cue', 'preset', 'sequence'])
    expect(activeOwnedEffects(effects, { presets: ['p'], sequences: [], cues: { c: 0 } }).map((item) => item.id)).toEqual(['global', 'preset'])
  })

  it('runs Live-button effects while the button is lit, even when the palette turned them off (Jake, 26 Nov 2026)', () => {
    // A palette click replaces the whole enabled set, so a Design-side
    // click must not silently kill a lit Live button mid-show: the
    // button is the switch, and the runtime copy is forced on.
    const effects = [effect('kitt', undefined, false), effect('chase', { type: 'preset', id: 'p' }, false)]
    const lit = activeOwnedEffects(effects, { presets: [], sequences: [], cues: {}, liveEffects: ['kitt', 'chase'] })
    expect(lit.map((item) => item.id)).toEqual(['kitt', 'chase'])
    expect(lit.every((item) => item.enabled)).toBe(true)
    // The stored records are untouched — only the runtime copy is forced.
    expect(effects.every((item) => item.enabled === false)).toBe(true)
    expect(activeOwnedEffects(effects, { presets: [], sequences: [], cues: {}, liveEffects: [] }).map((item) => item.id)).toEqual(['kitt'])
    // (kitt passes because it is unowned — the ownership filter never
    // looks at `enabled`; computeEffectPatch skips it downstream.)
    // Without liveEffects the old rules still hold exactly: a
    // preset-owned effect runs only while its preset is active, and the
    // ownership filter never looks at `enabled` (that gate is downstream
    // in computeEffectPatch).
    const owned = [effect('solo', { type: 'preset', id: 'p' }, false)]
    expect(activeOwnedEffects(owned, { presets: [], sequences: [], cues: {} }).map((item) => item.id)).toEqual([])
    expect(activeOwnedEffects(owned, { presets: ['p'], sequences: [], cues: {} }).map((item) => item.id)).toEqual(['solo'])
  })
})
