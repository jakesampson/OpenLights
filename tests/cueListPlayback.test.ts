import { describe, expect, it } from 'vitest'
import { cueGroupRange, manualCrossfade, manualCrossfadeNextIndex, manualCrossfadeProgress, nextEnabledIndex } from '../src/renderer/src/lib/cueListPlayback'

const step = (id: string) => ({ id, cue: { id, name: id.toUpperCase(), presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }, fadeMs: 0, holdMs: 0 })
const list = { id: 'l', name: 'L', steps: [step('a'), step('b'), step('c')], loop: false }
const looping = { ...list, loop: true }
const single = { ...list, steps: [list.steps[0]], loop: true }

describe('cuelist playback helpers', () => {
  it('manual-crossfades channel patches at 50 percent', () => expect(manualCrossfade({ 1: 0, 2: 100 }, { 1: 200, 2: 0 }, 0.5)).toEqual({ 1: 100, 2: 50 }))
  it('finds the bounds of a cue group', () => expect(cueGroupRange({ id: 'l', name: 'L', steps: [{ ...step('a'), groupId: 'g' }, { ...step('b'), groupId: 'g' }] }, 1)).toEqual({ first: 0, last: 1 }))
})

describe('manual crossfade fader (8.8a)', () => {
  it('fades to the next step, and to nothing past the last step of a non-looping list', () => {
    expect(manualCrossfadeNextIndex(list, 0)).toBe(1)
    expect(manualCrossfadeNextIndex(list, 1)).toBe(2)
    expect(manualCrossfadeNextIndex(list, 2)).toBe(-1)
    expect(manualCrossfadeNextIndex(list, -1)).toBe(-1)
    expect(manualCrossfadeNextIndex(list, 3)).toBe(-1)
  })

  it('wraps to the first step on a looping list, but never fades a cue into itself', () => {
    expect(manualCrossfadeNextIndex(looping, 2)).toBe(0)
    expect(manualCrossfadeNextIndex(single, 0)).toBe(-1)
  })

  it('measures the blend from the end the slider rests on, in either direction', () => {
    // Resting at 1 (the default): dragging down to 0.5 is halfway.
    expect(manualCrossfadeProgress(1, 0.5)).toBe(0.5)
    expect(manualCrossfadeProgress(1, 1)).toBe(0)
    expect(manualCrossfadeProgress(1, 0)).toBe(1)
    // After a completed crossfade the slider rests at 0: dragging up
    // to 0.5 is halfway to the next cue.
    expect(manualCrossfadeProgress(0, 0.5)).toBe(0.5)
    expect(manualCrossfadeProgress(0, 0)).toBe(0)
    expect(manualCrossfadeProgress(0, 1)).toBe(1)
  })
})

describe('skipping unchecked cues (guide p.218)', () => {
  const withDisabled = {
    id: 'l', name: 'L',
    steps: [
      step('a'),
      { ...step('b'), disabled: true },
      step('c'),
    ],
    loop: false
  }
  it('next / previous skip disabled steps and stop at the ends', () => {
    expect(nextEnabledIndex(withDisabled, 0, 1)).toBe(2)
    expect(nextEnabledIndex(withDisabled, 2, -1)).toBe(0)
    expect(nextEnabledIndex(withDisabled, 2, 1)).toBe(-1)
    expect(nextEnabledIndex(withDisabled, 0, -1)).toBe(-1)
    // From "not started" the next cue is the first enabled one.
    expect(nextEnabledIndex(withDisabled, -1, 1)).toBe(0)
    expect(manualCrossfadeNextIndex(withDisabled, 0)).toBe(2)
    expect(manualCrossfadeNextIndex(withDisabled, -1)).toBe(-1)
  })
  it('a looping list never wraps onto the only enabled step', () => {
    const looping = { ...withDisabled, loop: true, steps: [step('a'), { ...step('b'), disabled: true }] }
    expect(nextEnabledIndex(looping, 0, 1)).toBe(-1)
    expect(nextEnabledIndex(looping, 0, -1)).toBe(-1)
    const twoEnabled = { ...withDisabled, loop: true }
    expect(nextEnabledIndex(twoEnabled, 2, 1)).toBe(0)
  })
})
