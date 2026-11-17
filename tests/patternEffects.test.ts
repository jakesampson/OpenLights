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
