import { fixtureBeams, fixtureChannelMap } from '@shared/fixtureProfiles'
import type { EffectDef, EffectSample, FixtureDef } from '@shared/types'
import { scaleAttribute } from './automationRuntime'
import {
  effectDurationSeconds,
  orderedEffectPixels,
  writeEffectChannel,
  type EffectPixel
} from './effects'
import { patternLevel, type PatternEffect } from './patternEffects'

/**
 * Pattern effects (LightKey Guide ch.10, pp.153-160). A pattern generates a repeating
 * or random pattern from a set of samples — an intensity value (0-100%) or a color.
 * Samples[0] is the background; the remaining samples are the foreground.
 *
 * Where the guide's prose pins a parameter's meaning, the formula follows it exactly
 * (noted per parameter). Where the guide describes a behaviour without a formula
 * (e.g. exactly when a scanner eye's sample advances), the implementation notes the
 * reading taken — those are listed as open questions for Jake.
 */

export interface Rgb { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full, 16)
  if (!Number.isFinite(n) || full.length !== 6) return { r: 0, g: 0, b: 0 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  }
}

/** Deterministic pseudo-random in 0..1 from an integer seed. */
export function seededRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

/** Default samples when a pattern effect has none. The guide does not specify
 *  defaults; these are the neutral ones (background off, foreground full). */
export function defaultSamples(isColor: boolean): EffectSample[] {
  return isColor
    ? [
        { id: 'sample-bg', color: '#000000' },
        { id: 'sample-1', color: '#ffffff' }
      ]
    : [
        { id: 'sample-bg', value: 100 },
        { id: 'sample-1', value: 0 }
      ]
}

export function isColorAttribute(attribute: string): boolean {
  return ['color', 'red', 'green', 'blue', 'cyan', 'magenta', 'yellow'].includes(attribute)
}

/** Color channel attributes present on a pixel's beam (or the fixture itself). */
function colorAttributes(pixel: EffectPixel): Partial<Record<'red' | 'green' | 'blue' | 'cyan' | 'magenta' | 'yellow', string>> {
  const { fixture } = pixel
  const map = fixtureChannelMap(fixture)
  const out: Partial<Record<'red' | 'green' | 'blue' | 'cyan' | 'magenta' | 'yellow', string>> = {}
  for (const attr of ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'] as const) {
    if (pixel.beamId) {
      const beam = fixtureBeams(fixture).find((b) => b.id === pixel.beamId)
      const resolved = beam?.properties[attr]
      if (resolved !== undefined && map[resolved] !== undefined) out[attr] = resolved
    } else if (map[attr] !== undefined) {
      out[attr] = attr
    }
  }
  return out
}

function writeColor(
  into: Record<number, number>,
  pixel: EffectPixel,
  color: Rgb,
  effect: EffectDef,
  master: number
): void {
  const { fixture } = pixel
  const attrs = colorAttributes(pixel)
  const map = fixtureChannelMap(fixture)
  const write = (attribute: string | undefined, value: number) => {
    if (attribute === undefined) return
    const channelOffset = map[attribute]
    if (channelOffset === undefined) return
    const next = scaleAttribute(attribute, value, fixture.ignoreMasterDimmer ? 255 : master)
    writeEffectChannel(into, fixture.channelStart + channelOffset, next, effect.blendMode)
  }
  if (attrs.red !== undefined || attrs.green !== undefined || attrs.blue !== undefined) {
    write(attrs.red, color.r)
    write(attrs.green, color.g)
    write(attrs.blue, color.b)
    return
  }
  // CMY fixtures: cyan = 255 - red, and so on.
  write(attrs.cyan, 255 - color.r)
  write(attrs.magenta, 255 - color.g)
  write(attrs.yellow, 255 - color.b)
}

function writeIntensity(
  into: Record<number, number>,
  pixel: EffectPixel,
  value255: number,
  effect: EffectDef,
  master: number
): void {
  const { fixture, attribute } = pixel
  const map = fixtureChannelMap(fixture)
  const channelOffset = map[attribute]
  if (channelOffset === undefined) return
  const next = scaleAttribute(attribute, value255, fixture.ignoreMasterDimmer ? 255 : master)
  writeEffectChannel(into, fixture.channelStart + channelOffset, next, effect.blendMode)
}

function sampleRgb(sample: EffectSample | undefined): Rgb {
  return hexToRgb(sample?.color ?? '#000000')
}

function sampleValue(sample: EffectSample | undefined): number {
  return Math.max(0, Math.min(100, sample?.value ?? 0))
}

/** Foreground sample "in turn" (Guide pp.156-160): the remaining samples are used in
 *  turn for each eye / streak / meteor / sparkle / jellyfish / snake. */
function foregroundSample(samples: EffectSample[], eventIndex: number): EffectSample {
  if (samples.length <= 1) return samples[0]
  return samples[1 + (Math.abs(Math.floor(eventIndex)) % (samples.length - 1))]
}

/** Palette mode (Guide pp.158-160): the samples (except background) act as a palette.
 *  `position` 0..1 selects a palette entry (interpolated). */
function paletteColor(samples: EffectSample[], position: number): Rgb {
  const palette = samples.slice(1)
  if (palette.length === 0) return sampleRgb(samples[0])
  if (palette.length === 1) return sampleRgb(palette[0])
  const scaled = Math.max(0, Math.min(1, position)) * (palette.length - 1)
  const index = Math.floor(scaled)
  const next = Math.min(palette.length - 1, index + 1)
  return mixRgb(sampleRgb(palette[index]), sampleRgb(palette[next]), scaled - index)
}

function paletteValue(samples: EffectSample[], position: number): number {
  const palette = samples.slice(1)
  if (palette.length === 0) return sampleValue(samples[0])
  if (palette.length === 1) return sampleValue(palette[0])
  const scaled = Math.max(0, Math.min(1, position)) * (palette.length - 1)
  const index = Math.floor(scaled)
  const next = Math.min(palette.length - 1, index + 1)
  return sampleValue(palette[index]) + (sampleValue(palette[next]) - sampleValue(palette[index])) * (scaled - index)
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const cycleOf = (t: number) => ((t % 1) + 1) % 1

/**
 * Evaluate one pixel of a pattern effect at a time in seconds.
 * Returns a 0-255 intensity (dimmer patterns) or an RGB color (color patterns),
 * plus the level for callers that blend. `count` is the pixel count.
 */
export function patternPixelValue(
  pattern: PatternEffect,
  effect: EffectDef,
  samples: EffectSample[],
  timeSeconds: number,
  duration: number,
  pixelIndex: number,
  count: number,
  isColor: boolean
): { intensity?: number; color?: Rgb } {
  const phase = (effect.phase ?? 0) / 100
  const cycleT = duration > 0 ? timeSeconds / duration + phase : phase
  const p = cycleOf(cycleT)
  const n = Math.max(1, samples.length)
  const bg = samples[0]
  const stepsPerValue = Math.max(1, Math.floor(effect.stepsPerValue ?? 1))
  const sampleDuration = duration / (n * stepsPerValue)
  const timeOffset = (effect.timeOffset ?? 0) / 100
  const delay = (effect.delay ?? 0) / 100
  const smoothness = Math.max(0, Math.min(100, effect.smoothness ?? 0)) / 100
  const fringe = Math.max(0, Math.min(100, effect.fringe ?? 0)) / 100
  const noise = effect.noise ?? 0

  // Seeded jitter applied to blends when fringe > 0 (Guide: "Use if fringe is
  // greater than zero").
  const jitter = (seed: number) =>
    fringe > 0 && noise > 0 ? (seededRandom(seed) - 0.5) * noise * 0.2 : 0

  const blendToForeground = (level: number, eventIndex: number, palettePosition?: number): { intensity?: number; color?: Rgb } => {
    const clamped = clamp01(level + jitter(pixelIndex * 31 + Math.floor(cycleT) * 7))
    if (isColor) {
      const fg = effect.usePalette && palettePosition !== undefined
        ? paletteColor(samples, palettePosition)
        : sampleRgb(foregroundSample(samples, eventIndex))
      return { color: mixRgb(sampleRgb(bg), fg, clamped) }
    }
    const fg = effect.usePalette && palettePosition !== undefined
      ? paletteValue(samples, palettePosition)
      : sampleValue(foregroundSample(samples, eventIndex))
    return { intensity: ((sampleValue(bg) + (fg - sampleValue(bg)) * clamped) / 100) * 255 }
  }

  switch (pattern) {
    case 'chase': {
      // Guide p.154: pixels cyclically take on the value of each sample. Each sample
      // lasts stepsPerValue steps; a step is duration / (samples * stepsPerValue).
      // Time offset shifts a pixel's clock forward (it begins mid-pattern); delay
      // holds a pixel at the first sample until its delayed clock starts.
      const stepDuration = sampleDuration
      const offsetSeconds = pixelIndex * timeOffset * stepsPerValue * stepDuration
      const delaySeconds = pixelIndex * delay * stepsPerValue * stepDuration
      const localT = timeSeconds + offsetSeconds
      const effectiveT = localT < delaySeconds ? 0 : localT - delaySeconds
      const stepIndex = Math.floor(effectiveT / stepDuration)
      const sampleIndex = ((stepIndex % n) + n) % n
      const nextSampleIndex = (sampleIndex + 1) % n
      const stepProgress = stepDuration > 0 ? (effectiveT % stepDuration) / stepDuration : 0
      // Smoothness blends into the next sample over the last `smoothness` of a step.
      const blend = smoothness > 0 && stepProgress > 1 - smoothness
        ? (stepProgress - (1 - smoothness)) / smoothness
        : 0
      const current = samples[sampleIndex]
      const next = samples[nextSampleIndex]
      if (isColor) {
        return { color: mixRgb(sampleRgb(current), sampleRgb(next), blend) }
      }
      return { intensity: ((sampleValue(current) + (sampleValue(next) - sampleValue(current)) * blend) / 100) * 255 }
    }
    case 'scanner': {
      // Guide p.156: an eye of `length` pixels moves forth and back on the background,
      // overshooting the edges by `overshoot` pixels. The eye's sample advances each
      // traverse (interpretation — the guide says samples are used "in turn").
      const length = Math.max(1, effect.length ?? 1)
      const overshoot = Math.max(0, effect.overshoot ?? 0)
      const span = count - 1 + overshoot * 2
      const forth = p < 0.5 ? p * 2 : 2 - p * 2
      const eyeCenter = -overshoot + forth * span
      const half = length / 2
      const d = Math.abs(pixelIndex - eyeCenter)
      const edge = half + fringe * half
      const level = d <= half ? 1 : edge > half ? Math.max(0, 1 - (d - half) / (edge - half)) : 0
      const traverse = Math.floor(cycleT * 2)
      return blendToForeground(level, traverse)
    }
    case 'yo-yo': {
      // Guide p.157: fills then clears. Center = ratio between filling and clearing;
      // steepness paces the fill (0% = linear, larger = faster towards the end).
      const center = Math.max(0.01, Math.min(0.99, (effect.center ?? 50) / 100))
      const steepness = Math.max(0, Math.min(100, effect.steepness ?? 0)) / 100
      const exponent = 1 + steepness * 2
      let fill: number
      if (p < center) {
        const q = p / center
        fill = Math.pow(q, exponent) * count
      } else {
        const q = (p - center) / (1 - center)
        fill = (1 - Math.pow(q, exponent)) * count
      }
      const level = pixelIndex < fill ? 1 : 0
      return blendToForeground(level, pixelIndex)
    }
    case 'fill': {
      // Guide p.157: successively fills all pixels with one of the sample values.
      const x = count <= 1 ? 0 : pixelIndex / (count - 1)
      const level = x <= p ? 1 : 0
      return blendToForeground(level, pixelIndex)
    }
    case 'rain': {
      // Guide p.157: streaks of `length` pixels move at constant pace across the
      // background, `distance` pixels apart. Fringe fades each streak out.
      const length = Math.max(1, effect.length ?? 1)
      const distance = Math.max(0, effect.distance ?? 2)
      const period = length + distance
      const head = cycleOf(cycleT) * (count + period) - length
      let level = 0
      let streakIndex = 0
      for (let k = 0; k < Math.ceil((count + period) / period) + 1; k++) {
        const start = head - k * period
        const d = pixelIndex - start
        if (d >= 0 && d < length) {
          const tail = fringe > 0 ? 1 - (d / length) * fringe : 1
          level = Math.max(level, tail)
          streakIndex = k
        }
      }
      return blendToForeground(level, streakIndex)
    }
    case 'meteor': {
      // Guide p.158: meteoroids of `length` pixels pass by, `distance` apart, leaving
      // a `trail` which disintegrates randomly.
      const length = Math.max(1, effect.length ?? 1)
      const distance = Math.max(1, effect.distance ?? 6)
      const trail = Math.max(0, effect.trail ?? 0)
      const period = length + distance
      const head = cycleOf(cycleT) * (count + period) - length
      let level = 0
      let meteorIndex = 0
      for (let k = 0; k < Math.ceil((count + period) / period) + 1; k++) {
        const start = head - k * period
        const d = pixelIndex - start
        if (d >= 0 && d < length) {
          level = 1
          meteorIndex = k
        } else if (trail > 0 && d >= length && d < length + trail) {
          // Trail disintegrates randomly (seeded per pixel and cycle).
          const disintegrate = seededRandom(pixelIndex * 17 + Math.floor(cycleT) * 31)
          level = Math.max(level, (1 - (d - length) / trail) * (disintegrate > 0.3 ? 1 : 0.4))
          meteorIndex = k
        }
      }
      return blendToForeground(level, meteorIndex, effect.usePalette ? clamp01(1 - level) : undefined)
    }
    case 'sparkle': {
      // Guide p.159: random pixels light up on the background. A new sparkle ignites
      // every `interval` seconds and stays visible for `lifetime` seconds.
      const interval = Math.max(0.05, effect.interval ?? 0.5)
      const lifetime = Math.max(0.05, effect.lifetime ?? 1)
      const eventIndex = Math.floor(timeSeconds / interval)
      const pixelSeed = Math.floor(seededRandom(eventIndex * 101 + 7) * count)
      const age = timeSeconds - eventIndex * interval
      let level = 0
      if (pixelIndex === pixelSeed && age < lifetime) {
        const q = age / lifetime
        level = fringe > 0 ? (q < 1 - fringe ? 1 : Math.max(0, 1 - (q - (1 - fringe)) / fringe)) : 1
      }
      if (effect.usePalette) {
        return blendToForeground(level, eventIndex, clamp01(age / lifetime))
      }
      return blendToForeground(level, eventIndex)
    }
    case 'fire': {
      // Guide p.160: a burning flame; samples are a color palette, hottest to the
      // right. Flicker is seeded per animation frame (stable within a frame).
      // Speed scales the flicker rate; sparking/cooling shape the flame (see notes).
      const speed = Math.max(0.1, effect.fireSpeed ?? 1)
      const frame = Math.floor(timeSeconds * 16 * speed)
      const flicker = 0.35 + seededRandom(frame * 101 + pixelIndex * 29) * 0.65
      const sparking = Math.max(0, Math.min(100, effect.sparking ?? 50)) / 100
      const cooling = Math.max(0, Math.min(100, effect.cooling ?? 50)) / 100
      // More sparking = faster cooling = shorter flames (lower ceiling);
      // more cooling = more frequent reignition (brighter floor).
      const level = Math.max(0.35 + cooling * 0.2, Math.min(1 - sparking * 0.3, flicker))
      if (isColor) return { color: paletteColor(samples, level) }
      return { intensity: (paletteValue(samples, level) / 100) * 255 }
    }
    case 'jellyfish': {
      // Guide p.160: bell-shaped elements move along the pixels while pulsating.
      const countJ = Math.max(1, Math.floor(effect.jellyfishCount ?? 1))
      const size = Math.max(0.05, (effect.jellyfishSize ?? 50) / 100)
      const speed = Math.max(0.1, effect.fireSpeed ?? 1)
      const width = Math.max(1, size * count * 0.4)
      let level = 0
      let bellIndex = 0
      for (let j = 0; j < countJ; j++) {
        const centre = 0.5 + Math.sin((cycleT * speed + j / countJ) * Math.PI * 2) * 0.35
        const x = count <= 1 ? 0 : pixelIndex / (count - 1)
        const d = Math.abs(x - centre) * (count - 1)
        const bell = Math.max(0, 1 - d / width)
        const fringed = fringe > 0 ? bell * (1 - fringe * 0.5) + fringe * 0.5 * bell * bell : bell
        if (fringed > level) {
          level = fringed
          bellIndex = j
        }
      }
      return blendToForeground(level, bellIndex)
    }
    case 'snakes': {
      // Guide p.160: variable-length snakes creep along at constant pace; lengths
      // and distances are randomized within their ranges.
      const speed = Math.max(0.1, effect.fireSpeed ?? 1)
      const [minLen, maxLen] = effect.lengthRange ?? [1, 3]
      const [minDist, maxDist] = effect.distanceRange ?? [2, 6]
      const avgLen = (minLen + maxLen) / 2
      const avgDist = (minDist + maxDist) / 2
      const period = avgLen + avgDist
      const head = cycleOf(cycleT * speed) * (count + period) - avgLen
      let level = 0
      let snakeIndex = 0
      for (let k = 0; k < Math.ceil((count + period) / period) + 1; k++) {
        const len = minLen + seededRandom(k * 13 + 5) * (maxLen - minLen)
        const start = head - k * period
        const d = pixelIndex - start
        if (d >= 0 && d < len) {
          const tail = fringe > 0 ? 1 - (d / Math.max(1, len)) * fringe : 1
          level = Math.max(level, tail)
          snakeIndex = k
        }
      }
      return blendToForeground(level, snakeIndex)
    }
    default:
      return { intensity: 0 }
  }
}

/**
 * Write a pattern effect's channels at a moment in time.
 * Guide ch.10, pp.153-160. `into` receives the patch (blend modes honoured).
 */
export function computePatternPatch(
  fixtures: FixtureDef[],
  effect: EffectDef,
  timeSeconds: number,
  bpm: number,
  master = 255,
  activationSeed = 0,
  into: Record<number, number> = {}
): Record<number, number> {
  const pattern = effect.pattern
  if (!pattern) return into
  const color = isColorAttribute(effect.attribute)
  const samples = effect.samples && effect.samples.length > 0 ? effect.samples : defaultSamples(color)
  const duration = effectDurationSeconds(effect, bpm) ?? 1
  // Pixels are ordered by the effect's fixture order; color patterns resolve
  // siblings (green/blue) of the same beam, so build the red pixels.
  const primaryAttribute = color ? 'red' : effect.attribute
  const pixels = orderedEffectPixels(effect, fixtures, primaryAttribute, activationSeed)
  const count = pixels.length
  if (count === 0) return into

  pixels.forEach((pixel) => {
    if (pixel.fixture.disabled) return
    const value = patternPixelValue(pattern, effect, samples, timeSeconds, duration, pixel.phaseIndex, count, color)
    if (color && value.color) {
      writeColor(into, pixel, value.color, effect, master)
    } else if (value.intensity !== undefined) {
      writeIntensity(into, pixel, value.intensity, effect, master)
    }
  })
  return into
}
