import { describe, expect, it } from 'vitest'
import { interpolateOutputFrame } from '../src/renderer/src/lib/output'

describe('freeze output resume', () => {
  it('holds the captured frame and crossfades to the current frame', () => {
    const held = { 1: 20, 2: 200 }
    const current = { 1: 220, 2: 0 }
    expect(interpolateOutputFrame(held, current, 0)).toEqual(held)
    expect(interpolateOutputFrame(held, current, 0.5)).toEqual({ 1: 120, 2: 100 })
    expect(interpolateOutputFrame(held, current, 1)).toEqual(current)
  })
})
