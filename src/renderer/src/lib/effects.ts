import { fixtureBeams, fixtureChannelMap } from '@shared/fixtureProfiles'
import type { EffectDef, FixtureDef, MovementPathDef } from '@shared/types'
import { FIXTURE_ATTRIBUTE_MAP, scaleAttribute } from './automationRuntime'
import { computePatternPatch } from './patternRuntime'
import { computeDrawableCurvePatch } from './curveEffects'
import { computeMovementPatch } from './movementRuntime'

/** Options for the effect patch: movement path lookup, the base look for Relative
 *  effects (Guide pp.164-166), and the activation seed for Random (Variable) orders. */
export interface EffectPatchOptions {
  movementPaths?: MovementPathDef[]
  base?: Record<number, number>
  activationSeed?: number
}

/** Effect speed in cycles per second, honouring BPM sync.
 *  Guide ch.10, p.150: fixed duration (cycles = 1 / duration) or beat-controlled timing
 *  (beat multiplier = beats per cycle, so ÷2 repeats twice per beat). Legacy effects
 *  without timing fields keep the old speed/syncToBpm behaviour exactly. */
export function effectFrequency(effect: EffectDef, bpm: number): number {
  if (effect.timingMode === 'fixed' && effect.durationMs && effect.durationMs > 0) {
    return 1000 / effect.durationMs
  }
  if (effect.timingMode === 'beat' && effect.beatMultiplier && effect.beatMultiplier > 0) {
    return (Math.max(1, bpm) / 60) / effect.beatMultiplier
  }
  const speed = Number.isFinite(effect.speed) ? Math.max(0, effect.speed) : 1
  return effect.syncToBpm ? (Math.max(1, bpm) / 60) * speed : speed
}

/** Full cycle duration in seconds, or undefined for random timing (Guide p.150:
 *  random pattern effects have no fixed cycle). */
export function effectDurationSeconds(effect: EffectDef, bpm: number): number | undefined {
  if (effect.timingMode === 'fixed' && effect.durationMs && effect.durationMs > 0) {
    return effect.durationMs / 1000
  }
  if (effect.timingMode === 'beat' && effect.beatMultiplier && effect.beatMultiplier > 0) {
    return (effect.beatMultiplier * 60) / Math.max(1, bpm)
  }
  if (effect.timingMode === 'random') return undefined
  const frequency = effectFrequency(effect, bpm)
  return frequency > 0 ? 1 / frequency : undefined
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

/** Preview position of a fixture (first instance), for position-based orders. */
function fixturePreviewPosition(fixture: FixtureDef): { x: number; y: number } {
  return fixture.previewPositions?.[0] ?? fixture.previewPosition ?? { x: 0, y: 0 }
}

function shortNameOf(fixture: FixtureDef): string {
  return fixture.shortName ?? fixture.name
}

function addressOf(fixture: FixtureDef): number {
  return (fixture.universe ?? 1) * 512 + fixture.channelStart
}

/** Guide ch.10, pp.151-152: the order pixels are passed through. 'forward' is patch
 *  order; 'random' is the legacy stable hash (Random (Fixed)); 'random-variable'
 *  re-rolls per activation seed. Position-based orders use Preview positions;
 *  short-name and address orders use the fixture's short name / DMX address. */
export function orderedEffectFixtures(
  effect: EffectDef,
  fixtures: FixtureDef[],
  activationSeed = 0
): FixtureDef[] {
  const order = effect.fixtureOrder ?? 'forward'
  const by = (key: (f: FixtureDef) => number, descending = false) =>
    [...fixtures].sort((a, b) => (descending ? key(b) - key(a) : key(a) - key(b)))
  switch (order) {
    case 'reverse':
      return [...fixtures].reverse()
    case 'left-right':
      return by((f) => fixturePreviewPosition(f).x)
    case 'right-left':
      return by((f) => fixturePreviewPosition(f).x, true)
    case 'top-bottom':
      return by((f) => fixturePreviewPosition(f).y)
    case 'bottom-top':
      return by((f) => fixturePreviewPosition(f).y, true)
    case 'short-name-asc':
      return [...fixtures].sort((a, b) => shortNameOf(a).localeCompare(shortNameOf(b)))
    case 'short-name-desc':
      return [...fixtures].sort((a, b) => shortNameOf(b).localeCompare(shortNameOf(a)))
    case 'address-asc':
      return by(addressOf)
    case 'address-desc':
      return by(addressOf, true)
    case 'custom-direction': {
      // Pixels are passed through along the custom direction as they appear in the
      // Preview: score is the projection onto the direction (0° = left to right,
      // 90° = top to bottom in screen coordinates).
      const angle = ((effect.customDirectionAngle ?? 0) * Math.PI) / 180
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)
      return by((f) => {
        const p = fixturePreviewPosition(f)
        return p.x * dx + p.y * dy
      })
    }
    case 'custom': {
      const rank = new Map((effect.customFixtureOrder ?? []).map((id, index) => [id, index]))
      return [...fixtures].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))
    }
    case 'random-variable': {
      // Re-rolls per activation seed (stable within one activation).
      const hash = (id: string) =>
        [...`${effect.id}:${activationSeed}:${id}`].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 7)
      return [...fixtures].sort((a, b) => hash(a.id) - hash(b.id))
    }
    case 'random':
    case 'random-fixed': {
      const hash = (id: string) =>
        [...`${effect.id}:${id}`].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 7)
      return [...fixtures].sort((a, b) => hash(a.id) - hash(b.id))
    }
    default:
      return fixtures
  }
}

/** One pixel of an effect: a fixture (or one of its beams) with its position along the
 *  effect order (0..1) and its phase index (which step of the pattern/curve it is on).
 *  Guide p.151: a pixel is the smallest unit which can be individually controlled —
 *  either a fixture or a group of beams which can be individually controlled. */
export interface EffectPixel {
  fixture: FixtureDef
  /** Channel attribute this pixel writes (beam-resolved, e.g. 'red 2'). */
  attribute: string
  /** Beam id when this pixel is one beam of a multi-beam fixture (for resolving
   *  sibling color channels of the same beam). */
  beamId?: string
  /** 0..1 position along the order (by index, or by projected Preview distance when
   *  Consider Spacing is on). */
  position: number
  /** Phase index after origin / grouping / repeat are applied. */
  phaseIndex: number
}

/**
 * Order the pixels of an effect (Guide pp.151-152). `attribute` is the channel attribute
 * each pixel writes; when pixelMode is 'fixtures' every fixture is one pixel (all its
 * beams share one value), otherwise each individually controllable beam group is a pixel.
 * Origin, grouping and repeat are applied to the ordered pixels.
 */
export function orderedEffectPixels(
  effect: EffectDef,
  fixtures: FixtureDef[],
  attribute: string,
  activationSeed = 0
): EffectPixel[] {
  const ordered = orderedEffectFixtures(effect, fixtures, activationSeed)
  const pixelMode = effect.pixelMode ?? 'beams'
  // Build one entry per pixel, in order.
  type RawPixel = { fixture: FixtureDef; attribute: string; beamId?: string }
  const raw: RawPixel[] = []
  for (const fixture of ordered) {
    if (pixelMode === 'fixtures') {
      raw.push({ fixture, attribute })
      continue
    }
    const beams = fixtureBeams(fixture).filter((beam) => beam.properties[attribute] !== undefined)
    if (beams.length > 0) {
      for (const beam of beams) raw.push({ fixture, attribute: beam.properties[attribute], beamId: beam.id })
    } else {
      raw.push({ fixture, attribute })
    }
  }
  // Origin: From Center passes through pixels from the center to the edges,
  // To Center from the edges to the center. Neither applies to random or custom orders.
  const origin = effect.fixtureOrderOrigin ?? 'start-end'
  const orderIsRandomOrCustom = ['random', 'random-fixed', 'random-variable', 'custom'].includes(
    effect.fixtureOrder ?? 'forward'
  )
  let indices = raw.map((_, i) => i)
  if (origin !== 'start-end' && !orderIsRandomOrCustom && raw.length > 1) {
    const mid = (raw.length - 1) / 2
    const fromCenter = [...indices].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
    indices = origin === 'from-center' ? fromCenter : [...fromCenter].reverse()
  }
  const count = raw.length
  const pixels: EffectPixel[] = indices.map((rawIndex, position) => {
    // Position along the order: by index, or by projected Preview distance when
    // Consider Spacing is on (curve and movement effects).
    let normalized = count <= 1 ? 0 : position / (count - 1)
    if (effect.considerSpacing && count > 1) {
      const positions = raw.map((p) => fixturePreviewPosition(p.fixture))
      const first = positions[indices[0]]
      const last = positions[indices[count - 1]]
      const total = Math.hypot(last.x - first.x, last.y - first.y)
      const current = positions[rawIndex]
      normalized =
        total > 0 ? Math.hypot(current.x - first.x, current.y - first.y) / total : normalized
    }
    return { fixture: raw[rawIndex].fixture, attribute: raw[rawIndex].attribute, beamId: raw[rawIndex].beamId, position: normalized, phaseIndex: position }
  })
  // Grouping: N adjacent pixels act like a single pixel.
  const grouping = Math.max(1, Math.floor(effect.fixtureGrouping ?? 1))
  if (grouping > 1) {
    for (const pixel of pixels) pixel.phaseIndex = Math.floor(pixel.phaseIndex / grouping)
  }
  // Repeat: repeat the effect after every Nth pixel.
  const repeat = Math.max(0, Math.floor(effect.fixtureRepeat ?? 0))
  if (repeat > 1) {
    for (const pixel of pixels) pixel.phaseIndex = pixel.phaseIndex % repeat
  }
  return pixels
}

/** Overlay blend (Guide ch.10, p.173): overlaid effects add their values; colors use the
 *  'screen' blend mode. */
export function blendEffectValue(
  blendMode: EffectDef['blendMode'],
  existing: number | undefined,
  next: number
): number {
  if (blendMode === 'add') return Math.min(255, (existing ?? 0) + next)
  if (blendMode === 'max') return Math.max(existing ?? 0, next)
  if (blendMode === 'screen') {
    const a = existing ?? 0
    return Math.round(255 - ((255 - a) * (255 - next)) / 255)
  }
  return next
}

/** Write one effect channel value, honouring the effect's blend mode. */
export function writeEffectChannel(
  channels: Record<number, number>,
  channel: number,
  value: number,
  blendMode: EffectDef['blendMode']
): void {
  channels[channel] = blendEffectValue(blendMode, channels[channel], Math.round(value))
}

/**
 * Per-channel values produced by all enabled effects at a moment in time.
 * Effects override the base look on the channels they target; later effects
 * win when two target the same channel.
 * Guide ch.10: pattern, curve and movement effects are evaluated by their own
 * runtimes; the legacy waveform oscillator path below is unchanged.
 */
export function computeEffectPatch(
  fixtures: FixtureDef[],
  effects: EffectDef[],
  timeSeconds: number,
  bpm: number,
  master = 255,
  options: EffectPatchOptions = {}
): Record<number, number> {
  const channels: Record<number, number> = {}
  const enabled = effects.filter((effect) => effect.enabled)
  if (enabled.length === 0) return channels

  for (const effect of enabled) {
    const ids = new Set(effect.fixtureIds)
    const targets = ids.size > 0 ? fixtures.filter((f) => ids.has(f.id)) : fixtures
    if (targets.length === 0) continue
    const kind = effect.kind ?? 'curve'
    if (kind === 'pattern' && effect.pattern) {
      computePatternPatch(targets, effect, timeSeconds, bpm, master, options.activationSeed ?? 0, channels)
      continue
    }
    if (kind === 'movement' && effect.movementPathId) {
      computeMovementPatch(targets, effect, timeSeconds, bpm, master, options, channels)
      continue
    }
    if (kind === 'curve' && effect.curveComponents && effect.curveComponents.length > 0) {
      computeDrawableCurvePatch(targets, effect, timeSeconds, bpm, master, options, channels)
      continue
    }
    // Legacy waveform oscillator path (unchanged behaviour): when the effect's
    // attribute is a beam property, each beam becomes its own phase target.
    // With no phase spread every cell gets the same value (unison); with a
    // spread the wave chases across the cells. Any other attribute (a global
    // dimmer, pan, strobe) stays one target for the whole fixture.
    const pixels = orderedEffectPixels(effect, targets, effect.attribute, options.activationSeed ?? 0)
    if (pixels.length === 0) continue
    const frequency = effectFrequency(effect, bpm)
    const spread = Math.max(0, effect.phaseSpread) / 360
    const size = Math.max(0, Math.min(255, effect.size))
    const offset = Math.max(0, Math.min(255, effect.offset))

    pixels.forEach((pixel, index) => {
      const { fixture, attribute } = pixel
      if (fixture.disabled) return
      const map = fixtureChannelMap(fixture)
      const channelOffset = map[attribute]
      if (channelOffset === undefined) return

      const phase =
        timeSeconds * frequency +
        (pixels.length > 1 ? spread * pixel.position : 0)
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
      writeEffectChannel(channels, channel, next, effect.blendMode)
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
