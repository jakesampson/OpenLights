export type PatternEffect = 'chase' | 'scanner' | 'yo-yo' | 'fill' | 'rain' | 'meteor' | 'sparkle' | 'fire' | 'jellyfish' | 'snakes'

const phase = (t: number): number => ((t % 1) + 1) % 1
const position = (index: number, count: number): number => count <= 1 ? 0 : index / (count - 1)

/** Pure normalized pattern evaluator. Time is expressed in cycles. */
function random(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

export function patternLevel(pattern: PatternEffect, t: number, fixtureIndex: number, count: number, seed = 0): number {
  if (count <= 0 || fixtureIndex < 0 || fixtureIndex >= count) return 0
  const p = phase(t)
  const x = position(fixtureIndex, count)
  switch (pattern) {
    case 'chase':
      return fixtureIndex === Math.floor(p * count) % count ? 1 : 0
    case 'scanner':
      return Math.max(0, 1 - Math.abs(x - p) * Math.max(1, count - 1))
    case 'yo-yo': {
      const head = p < 0.5 ? p * 2 : 2 - p * 2
      return Math.max(0, 1 - Math.abs(x - head) * Math.max(1, count - 1))
    }
    case 'fill':
      return x <= p ? 1 : 0
    case 'rain': {
      const drop = phase(p + x * 0.73)
      return drop < 0.18 ? 1 - drop / 0.18 : 0
    }
    case 'meteor': {
      const distance = phase(p - x)
      return distance < 0.4 ? 1 - distance / 0.4 : 0
    }
    case 'sparkle':
      return random(Math.floor(t * 12) * 997 + fixtureIndex * 37 + seed) > 0.82 ? 1 : 0
    case 'fire': {
      const frame = Math.floor(t * 16)
      return 0.35 + random(frame * 101 + fixtureIndex * 29 + seed) * 0.65
    }
    case 'jellyfish': {
      const centre = 0.5 + Math.sin(p * Math.PI * 2) * 0.2
      const width = 0.2 + (1 + Math.cos(p * Math.PI * 2)) * 0.15
      return Math.max(0, 1 - Math.abs(x - centre) / width)
    }
    case 'snakes': {
      const first = phase(p - x)
      const second = phase(p + 0.5 - x)
      const tail = (distance: number): number => distance < 0.25 ? 1 - distance / 0.25 : 0
      return Math.max(tail(first), tail(second))
    }
  }
}
