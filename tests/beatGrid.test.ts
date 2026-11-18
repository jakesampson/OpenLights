import { describe, expect, it } from 'vitest'
import { beatPhase, MidiBeatClock } from '../src/renderer/src/lib/beatGrid'

describe('beat grid', () => {
  it('turns 24 MIDI pulses per quarter note into BPM', () => {
    const clock = new MidiBeatClock()
    let bpm: number | null = null
    for (let pulse = 0; pulse <= 48; pulse++) bpm = clock.push(pulse * (500 / 24)) ?? bpm
    expect(bpm).toBeCloseTo(120, 5)
  })

  it('calculates stable beat phase from exact tempo and anchor', () => {
    expect(beatPhase(1000, 120, 1000)).toBe(0)
    expect(beatPhase(1125, 120, 1000)).toBeCloseTo(0.25)
    expect(beatPhase(1500, 120, 1000)).toBe(0)
  })
})
