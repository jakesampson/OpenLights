import { describe, expect, it } from 'vitest'
import type { LivePage } from '../src/shared/types'
import {
  effectiveLiveLevel, exclusiveSiblings, frameConfig, frameForCue, frameIntensity,
  frameMembers, frameSpeed, liveFadeMs, liveOutputLevels, setFrameConfig
} from '../src/renderer/src/lib/liveFrames'
import { DEFAULT_FRAME_CONFIG } from '../src/shared/liveObjectDefaults'

function framePage(): LivePage {
  return {
    id: 'page',
    name: 'Page',
    controls: [
      { id: 'in1', name: 'In one', type: 'push', presetIds: [], x: 100, y: 100 },
      { id: 'in2', name: 'In two', type: 'push', presetIds: [], x: 120, y: 200 },
      { id: 'out', name: 'Outside', type: 'push', presetIds: [], x: 400, y: 100 }
    ],
    annotations: [
      { id: 'frame', type: 'frame', text: 'Frame', x: 100, y: 100, width: 200, height: 200 },
      { id: 'label', type: 'label', text: 'Label', x: 500, y: 500, width: 160, height: 40 }
    ]
  }
}

describe('frame membership (7.9)', () => {
  it('finds the frame containing a cue by its centre point', () => {
    const page = framePage()
    expect(frameForCue(page, 'in1')).toBe('frame')
    expect(frameForCue(page, 'in2')).toBe('frame')
    expect(frameForCue(page, 'out')).toBeNull()
    expect(frameForCue(page, 'missing')).toBeNull()
  })

  it('lists only the cues inside a frame', () => {
    const page = framePage()
    expect(frameMembers(page, 'frame').sort()).toEqual(['in1', 'in2'])
    expect(frameMembers(page, 'label')).toEqual([])
    expect(frameMembers(page, 'missing')).toEqual([])
  })
})

describe('exclusive frames (7.9)', () => {
  it('has no siblings when the frame is not exclusive', () => {
    const page = framePage()
    expect(exclusiveSiblings(page, 'in1')).toEqual([])
  })

  it('returns the other cues in an exclusive frame', () => {
    const page = setFrameConfig(framePage(), 'frame', { exclusive: true })
    expect(exclusiveSiblings(page, 'in1').sort()).toEqual(['in2'])
    expect(exclusiveSiblings(page, 'in2').sort()).toEqual(['in1'])
    expect(exclusiveSiblings(page, 'out')).toEqual([])
  })

  it('patches a frame config immutably with defaults and clamping', () => {
    const page = framePage()
    const next = setFrameConfig(page, 'frame', { exclusive: true, intensity: 999, speed: -20 })
    expect(frameConfig(next, 'frame')).toEqual({ exclusive: true, intensity: 200, speed: 0 })
    expect(frameConfig(page, 'frame')).toBeUndefined()
    expect(setFrameConfig(page, 'label', { exclusive: true })).toEqual(page)
  })
})

describe('frame modifiers (7.9)', () => {
  it('defaults intensity and speed to 1 for cues outside a frame', () => {
    const page = framePage()
    expect(frameIntensity(page, 'in1')).toBe(1)
    expect(frameSpeed(page, 'in1')).toBe(1)
    expect(frameIntensity(page, 'out')).toBe(1)
  })

  it('scales intensity and speed for cues inside a configured frame', () => {
    const page = setFrameConfig(framePage(), 'frame', { intensity: 50, speed: 150 })
    expect(frameIntensity(page, 'in1')).toBe(0.5)
    expect(frameSpeed(page, 'in1')).toBe(1.5)
    expect(frameIntensity(page, 'out')).toBe(1)
    expect(frameSpeed(page, 'out')).toBe(1)
  })

  it('applies intensity to a cue level and clamps to 0-255', () => {
    const page = setFrameConfig(framePage(), 'frame', { intensity: 50 })
    expect(effectiveLiveLevel(page, 'in1', 200)).toBe(100)
    expect(effectiveLiveLevel(page, 'out', 200)).toBe(200)
    const zero = setFrameConfig(framePage(), 'frame', { intensity: 0 })
    expect(effectiveLiveLevel(zero, 'in1', 255)).toBe(0)
    const boost = setFrameConfig(framePage(), 'frame', { intensity: 200 })
    expect(effectiveLiveLevel(boost, 'in1', 200)).toBe(255)
  })

  it('combines a cue intensity modifier with its frame intensity', () => {
    const page = setFrameConfig(framePage(), 'frame', { intensity: 50 })
    page.controls[0].modifiers = { intensity: 50, speed: 100, size: 100 }
    expect(effectiveLiveLevel(page, 'in1', 200)).toBe(50)
  })

  it('returns modifier-scaled output levels keyed by cue id', () => {
    const page = setFrameConfig(framePage(), 'frame', { intensity: 25 })
    const levels = liveOutputLevels([page], { in1: 200, out: 100, stale: 80 })
    expect(levels).toEqual({ in1: 50, out: 100, stale: 80 })
  })

  it('uses the page that actually contains each cue across multiple pages', () => {
    const first = setFrameConfig(framePage(), 'frame', { intensity: 25 })
    const second = framePage()
    second.id = 'other'
    second.controls[0] = { ...second.controls[0], id: 'elsewhere' }
    const levels = liveOutputLevels([first, second], { in1: 200, elsewhere: 200 })
    expect(levels.in1).toBe(50)
    expect(levels.elsewhere).toBe(200)
  })

  it('passes levels through when no pages are provided', () => {
    expect(liveOutputLevels(undefined, { a: 10 })).toEqual({ a: 10 })
    expect(DEFAULT_FRAME_CONFIG).toEqual({ exclusive: false, intensity: 100, speed: 100 })
  })

  it('scales the page fade by an active frame speed modifier', () => {
    const page = setFrameConfig(framePage(), 'frame', { speed: 200 })
    expect(liveFadeMs(page, { in1: 255 }, 1000)).toBe(500)
    const slow = setFrameConfig(framePage(), 'frame', { speed: 50 })
    expect(liveFadeMs(slow, { in1: 255 }, 1000)).toBe(2000)
  })

  it('leaves the fade unchanged when frames are at default speed or inactive', () => {
    const page = framePage()
    expect(liveFadeMs(page, { in1: 255 }, 1000)).toBe(1000)
    const fast = setFrameConfig(framePage(), 'frame', { speed: 200 })
    expect(liveFadeMs(fast, { out: 255 }, 1000)).toBe(1000) // cue outside the frame
    expect(liveFadeMs(fast, {}, 1000)).toBe(1000)
    expect(liveFadeMs(undefined, {}, 1000)).toBe(1000)
    expect(liveFadeMs(fast, { in1: 255 }, 0)).toBe(0)
  })

  it('uses the slowest active frame when several frames govern the fade', () => {
    const page = framePage()
    page.annotations!.push({ id: 'frame2', type: 'frame', text: 'Two', x: 400, y: 100, width: 200, height: 200, frame: { exclusive: false, intensity: 100, speed: 50 } })
    const configured = setFrameConfig(page, 'frame', { speed: 200 })
    expect(liveFadeMs(configured, { in1: 255, out: 255 }, 1000)).toBe(2000) // slowest speed 0.5 governs
  })
})
