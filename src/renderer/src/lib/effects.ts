import { fixtureBeams, fixtureChannelMap } from '@shared/fixtureProfiles'
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
    case 'cosine':
      return Math.cos(t * Math.PI * 2)
    case 'triangle':
      return 1 - 4 * Math.abs(t - 0.5)
    case 'square':
      return t < 0.5 ? 1 : -1
    case 'saw':
      return 2 * t - 1
    case 'pulse':
      return t < 0.2 ? 1 : -1
    case 'smooth':
      return (t * t * (3 - 2 * t)) * 2 - 1
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

export function orderedEffectFixtures(effect: EffectDef, fixtures: FixtureDef[]): FixtureDef[] {
  if (effect.fixtureOrder === 'reverse') return [...fixtures].reverse()
  if (effect.fixtureOrder === 'custom') { const rank = new Map((effect.customFixtureOrder ?? []).map((id, index) => [id, index])); return [...fixtures].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)) }
  if (effect.fixtureOrder === 'random') return [...fixtures].sort((a, b) => { const hash = (id: string) => [...`${effect.id}:${id}`].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 7); return hash(a.id) - hash(b.id) })
  return fixtures
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
    const ordered = orderedEffectFixtures(effect, ids.size > 0 ? fixtures.filter((f) => ids.has(f.id)) : fixtures)
    // Effects run across a multi-beam fixture's cells (Piece 7, Video B
    // 13:15 — the fire effect): when the effect's attribute is a beam
    // property, each beam becomes its own phase target, writing to the
    // beam's channel. With no phase spread every cell gets the same
    // value (unison); with a spread the wave chases across the cells.
    // Any other attribute (a global dimmer, pan, strobe) stays one
    // target for the whole fixture.
    const targets: { fixture: FixtureDef; attribute: string }[] = []
    for (const fixture of ordered) {
      const beams = fixtureBeams(fixture).filter((beam) => beam.properties[effect.attribute] !== undefined)
      if (beams.length > 0) for (const beam of beams) targets.push({ fixture, attribute: beam.properties[effect.attribute] })
      else targets.push({ fixture, attribute: effect.attribute })
    }
    if (targets.length === 0) continue
    const frequency = effectFrequency(effect, bpm)
    const spread = Math.max(0, effect.phaseSpread) / 360
    const size = Math.max(0, Math.min(255, effect.size))
    const offset = Math.max(0, Math.min(255, effect.offset))

    targets.forEach(({ fixture, attribute }, index) => {
      if (fixture.disabled) return
      const map = fixtureChannelMap(fixture)
      const channelOffset = map[attribute]
      if (channelOffset === undefined) return

      const phase =
        timeSeconds * frequency +
        (targets.length > 1 ? spread * (index / (targets.length - 1)) : 0)
      const wave = waveformValue(effect.waveform, phase, index)
      const value = effect.minValue !== undefined || effect.maxValue !== undefined
        ? Math.max(0, Math.min(255, effect.minValue ?? 0)) + ((wave + 1) / 2) * (Math.max(0, Math.min(255, effect.maxValue ?? 255)) - Math.max(0, Math.min(255, effect.minValue ?? 0)))
        : offset + wave * size
      const channel = fixture.channelStart + channelOffset
      // Ignore Master Dimmer (LightKey Fixture Options, Guide p.62): the
      // master fader never scales this fixture — effects included.
      const next = scaleAttribute(
        attribute,
        value,
        fixture.ignoreMasterDimmer ? 255 : master
      )
      channels[channel] = effect.blendMode === 'add'
        ? Math.min(255, (channels[channel] ?? 0) + next)
        : effect.blendMode === 'max'
          ? Math.max(channels[channel] ?? 0, next)
          : next
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
