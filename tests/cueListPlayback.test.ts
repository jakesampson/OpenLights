import { describe, expect, it } from 'vitest'
import { cueGroupRange, manualCrossfade, manualCrossfadeNextIndex, manualCrossfadeProgress } from '../src/renderer/src/lib/cueListPlayback'

const list = { id: 'l', name: 'L', steps: [{ id: 'a', cueId: 'a', fadeMs: 0, holdMs: 0 }, { id: 'b', cueId: 'b', fadeMs: 0, holdMs: 0 }, { id: 'c', cueId: 'c', fadeMs: 0, holdMs: 0 }], loop: false }
const looping = { ...list, loop: true }
const single = { ...list, steps: [list.steps[0]], loop: true }

describe('cuelist playback helpers', () => {
  it('manual-crossfades channel patches at 50 percent', () => expect(manualCrossfade({ 1: 0, 2: 100 }, { 1: 200, 2: 0 }, 0.5)).toEqual({ 1: 100, 2: 50 }))
  it('finds the bounds of a cue group', () => expect(cueGroupRange({ id: 'l', name: 'L', steps: [{ id: 'a', cueId: 'a', fadeMs: 0, holdMs: 0, groupId: 'g' }, { id: 'b', cueId: 'b', fadeMs: 0, holdMs: 0, groupId: 'g' }] }, 1)).toEqual({ first: 0, last: 1 }))
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
