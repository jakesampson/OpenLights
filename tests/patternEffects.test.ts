import { describe, expect, it } from 'vitest'
import { patternLevel } from '../src/renderer/src/lib/patternEffects'

describe('ordered pattern effects', () => {
  it('chases one fixture at a time', () => {
    expect([0, 1, 2, 3].map((i) => patternLevel('chase', 0.3, i, 4))).toEqual([0, 1, 0, 0])
  })

  it('scans forward and yo-yos back', () => {
    expect(patternLevel('scanner', 0, 0, 5)).toBe(1)
    expect(patternLevel('scanner', 0.5, 2, 5)).toBe(1)
    expect(patternLevel('yo-yo', 0.25, 2, 5)).toBe(1)
    expect(patternLevel('yo-yo', 0.75, 2, 5)).toBe(1)
  })
})

describe('progressive pattern effects', () => {
  it('fills fixtures progressively', () => {
    expect([0, 1, 2, 3].map((i) => patternLevel('fill', 0.5, i, 4))).toEqual([1, 1, 0, 0])
  })

  it('produces deterministic rain drops and meteor tails', () => {
    const rain = [0, 1, 2, 3].map((i) => patternLevel('rain', 0.2, i, 4))
    expect([0, 1, 2, 3].map((i) => patternLevel('rain', 0.2, i, 4))).toEqual(rain)
    expect(patternLevel('meteor', 0.25, 0, 4)).toBeCloseTo(0.375)
    expect(patternLevel('meteor', 0.25, 1, 4)).toBe(0)
  })
})

describe('seeded-random pattern effects', () => {
  it('keeps sparkle fixed within a frame and reproducible by seed', () => {
    const first = [0, 1, 2, 3].map((i) => patternLevel('sparkle', 1.01, i, 4, 42))
    expect([0, 1, 2, 3].map((i) => patternLevel('sparkle', 1.04, i, 4, 42))).toEqual(first)
    expect(first.every((level) => level === 0 || level === 1)).toBe(true)
  })

  it('produces deterministic fire flicker in a warm intensity range', () => {
    const first = patternLevel('fire', 0.2, 2, 5, 7)
    expect(patternLevel('fire', 0.2, 2, 5, 7)).toBe(first)
    expect(first).toBeGreaterThanOrEqual(0.35)
    expect(first).toBeLessThanOrEqual(1)
  })
})

describe('organic pattern effects', () => {
  it('jellyfish expands and contracts around the fixture centre', () => {
    expect(patternLevel('jellyfish', 0, 2, 5)).toBe(1)
    expect(patternLevel('jellyfish', 0.5, 0, 5)).toBeLessThan(patternLevel('jellyfish', 0.5, 2, 5))
  })

  it('snakes sends two repeatable heads around the fixture order', () => {
    expect(patternLevel('snakes', 0, 0, 5)).toBe(1)
    expect(patternLevel('snakes', 0, 2, 5)).toBe(1)
    expect(patternLevel('snakes', 0, 1, 5)).toBe(0)
  })
})
