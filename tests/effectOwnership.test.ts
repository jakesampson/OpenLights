import { describe, expect, it } from 'vitest'
import type { EffectDef } from '../src/shared/types'
import { activeOwnedEffects } from '../src/renderer/src/lib/effectOwnership'

const effect = (id: string, owner?: EffectDef['owner']): EffectDef => ({ id, name: id, fixtureIds: [], attribute: 'intensity', waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 0, enabled: true, owner })
describe('effect ownership', () => {
  it('keeps migrated global effects active and gates owned effects', () => {
    const effects = [effect('global'), effect('cue', { type: 'cue', id: 'c' }), effect('preset', { type: 'preset', id: 'p' }), effect('sequence', { type: 'sequence', id: 's' })]
    expect(activeOwnedEffects(effects, { presets: [], sequences: [], cues: {} }).map((item) => item.id)).toEqual(['global'])
    expect(activeOwnedEffects(effects, { presets: ['p'], sequences: ['s'], cues: { c: 255 } }).map((item) => item.id)).toEqual(['global', 'cue', 'preset', 'sequence'])
    expect(activeOwnedEffects(effects, { presets: ['p'], sequences: [], cues: { c: 0 } }).map((item) => item.id)).toEqual(['global', 'preset'])
  })
})
