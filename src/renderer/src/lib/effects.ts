import { fixtureChannelMap } from '@shared/fixtureProfiles'
import type { EffectDef, FixtureDef } from '@shared/types'
import { FIXTURE_ATTRIBUTE_MAP, scaleAttribute } from './automationRuntime'

/** Effect speed in cycles per second, honouring BPM sync. */
export function effectFrequency(effect: EffectDef, bpm: number): number {
  const speed = Number.isFinite(effect.speed) ? Math.max(0, effect.speed) : 1
  return effect.syncToBpm ? (Math.max(1, bpm) / 60) * speed : speed
}

/** Normalised oscillator output in the range -1..1. */
export function waveformValue(wave: EffectDef['waveform'], phase: number, seed = 0): number {
  const t = phase - Math.floor(phase)
  switch (wave) {
    case 'sine':
      return Math.sin(t * Math.PI * 2)
    case 'triangle':
      return 1 - 4 * Math.abs(t - 0.5)
    case 'square':
      return t < 0.5 ? 1 : -1
    case 'saw':
      return 2 * t - 1
    case 'random': {
      // Stable per cycle and per fixture, so it steps instead of shimmering
      // at frame rate.
      const n = Math.sin(Math.floor(phase) * 127.1 + seed * 311.7) * 43758.5453
      return (n - Math.floor(n)) * 2 - 1
    }
    default:
      return 0
  }
}

/**
 * Per-channel values produced by all enabled effects at a moment in time.
 * Effects override the base look on the channels they target; later effects
 * win when two target the same channel.
 */
export function computeEffectPatch(
  fixtures: FixtureDef[],
  effects: EffectDef[],
  timeSeconds: number,
  bpm: number,
  master = 255
): Record<number, number> {
  const channels: Record<number, number> = {}
  const enabled = effects.filter((effect) => effect.enabled)
  if (enabled.length === 0) return channels

  for (const effect of enabled) {
    const ids = new Set(effect.fixtureIds)
    const targets = ids.size > 0 ? fixtures.filter((f) => ids.has(f.id)) : fixtures
    if (targets.length === 0) continue
    const frequency = effectFrequency(effect, bpm)
    const spread = Math.max(0, effect.phaseSpread) / 360
    const size = Math.max(0, Math.min(255, effect.size))
    const offset = Math.max(0, Math.min(255, effect.offset))

    targets.forEach((fixture, index) => {
      if (fixture.disabled) return
      const map = fixtureChannelMap(fixture)
      const channelOffset = map[effect.attribute]
      if (channelOffset === undefined) return

      const phase =
        timeSeconds * frequency +
        (targets.length > 1 ? spread * (index / (targets.length - 1)) : 0)
      const wave = waveformValue(effect.waveform, phase, index)
      const value = offset + wave * size
      channels[fixture.channelStart + channelOffset] = scaleAttribute(
        effect.attribute,
        value,
        master
      )
    })
  }

  return channels
}

/** Layer an effect patch over a base look. */
export function mergeEffects(
  base: Record<number, number>,
  effectPatch: Record<number, number>
): Record<number, number> {
  return { ...base, ...effectPatch }
}
