import { describe, expect, it } from 'vitest'
import { calculateTapTempo } from '../src/renderer/src/lib/tapTempo'

describe('tap tempo', () => {
  it('uses recent taps to estimate tempo', () => {
    expect(calculateTapTempo([0, 500, 1000], 1500)).toEqual({ taps: [0, 500, 1000, 1500], bpm: 120 })
  })
  it('starts over after a pause', () => {
    expect(calculateTapTempo([0, 500], 3000)).toEqual({ taps: [3000], bpm: null })
  })
})
