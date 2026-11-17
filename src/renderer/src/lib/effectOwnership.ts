import type { EffectDef } from '@shared/types'

export function activeOwnedEffects(effects: EffectDef[], active: { presets: string[]; sequences: string[]; cues: Record<string, number> }): EffectDef[] {
  return effects.filter((effect) => {
    if (!effect.owner) return true
    if (effect.owner.type === 'preset') return active.presets.includes(effect.owner.id)
    if (effect.owner.type === 'sequence') return active.sequences.includes(effect.owner.id)
    return (active.cues[effect.owner.id] ?? 0) > 0
  })
}
