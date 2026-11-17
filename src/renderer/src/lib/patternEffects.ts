export type PatternEffect = 'chase' | 'scanner' | 'yo-yo'

const phase = (t: number): number => ((t % 1) + 1) % 1
const position = (index: number, count: number): number => count <= 1 ? 0 : index / (count - 1)

/** Pure normalized pattern evaluator. Time is expressed in cycles. */
export function patternLevel(pattern: PatternEffect, t: number, fixtureIndex: number, count: number): number {
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
  }
}
