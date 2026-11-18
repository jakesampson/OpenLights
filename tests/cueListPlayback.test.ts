import { describe, expect, it } from 'vitest'
import { cueGroupRange, manualCrossfade } from '../src/renderer/src/lib/cueListPlayback'

describe('cuelist playback helpers', () => {
  it('manual-crossfades channel patches at 50 percent', () => expect(manualCrossfade({ 1: 0, 2: 100 }, { 1: 200, 2: 0 }, 0.5)).toEqual({ 1: 100, 2: 50 }))
  it('finds the bounds of a cue group', () => expect(cueGroupRange({ id: 'l', name: 'L', steps: [{ id: 'a', cueId: 'a', fadeMs: 0, holdMs: 0, groupId: 'g' }, { id: 'b', cueId: 'b', fadeMs: 0, holdMs: 0, groupId: 'g' }] }, 1)).toEqual({ first: 0, last: 1 }))
})
