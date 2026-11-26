import type { EffectDef } from '@shared/types'

/**
 * Which effects the output loop runs. An effect with no owner is global
 * (the palette switch); an owned effect runs only while its owner is
 * active — a preset while the preset is active, a sequence while the
 * sequence runs, a cue (a Live button id) while the button's level is
 * above zero.
 *
 * A Live button's effects (LiveControl.effectIds, Jake 26 Nov 2026 —
 * proven in LightKey by his own test: dragging a colour effect onto the
 * Live window creates a button that runs the effect) are passed in as
 * `liveEffects`, derived from the lit buttons by activeLiveEffectIds.
 * They run with `enabled` forced on: the button is the switch, so a
 * palette click in Design — which replaces the whole enabled set — must
 * not silently kill a lit Live button mid-show. The stored record keeps
 * whatever the palette left it at; only the runtime copy is forced.
 */
export function activeOwnedEffects(effects: EffectDef[], active: { presets: string[]; sequences: string[]; cues: Record<string, number>; liveEffects?: string[] }): EffectDef[] {
  return effects.flatMap((effect) => {
    if (active.liveEffects?.includes(effect.id)) return [{ ...effect, enabled: true }]
    if (!effect.owner) return [effect]
    if (effect.owner.type === 'preset') return active.presets.includes(effect.owner.id) ? [effect] : []
    if (effect.owner.type === 'sequence') return active.sequences.includes(effect.owner.id) ? [effect] : []
    return (active.cues[effect.owner.id] ?? 0) > 0 ? [effect] : []
  })
}
