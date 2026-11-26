// The Preview reads the engine's frames from the same ~60fps rAF loop
// as the chart dot (Jake, 26 Nov 2026): every push() bumps a frame id,
// so StagePreview only re-renders when a new frame arrived instead of
// polling getChannels() every 100ms — the beam jumped ~18° per poll
// step while the DMX output itself was smooth.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import type { ShowDef } from '../src/shared/types'

const engine = new DMXEngine()
const frames: Array<FrameRequestCallback | null> = []
vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = null })
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { configureEffects, getOutputFrameId, getLastOutputChannels, sendImmediate } from '../src/renderer/src/lib/output'

// Virtual-dimmer Q12BT (rgba-4ch, no intensity channel) at 1-4; a
// real-dimmer wash (led-wash, intensity first) at 5-11.
const fixtures = [
  { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 1, channels: 4 },
  { id: 'w1', name: 'W1', type: 'led-wash', channelStart: 5, channels: 7 },
] as ShowDef['fixtures']

beforeEach(() => {
  frames.length = 0
  configureEffects({ fixtures })
  // Start every test from a known dark base.
  sendImmediate({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 })
  frames.length = 0
})

describe('output frame id', () => {
  it('bumps on every push and exposes the last frame as a 512-channel array', () => {
    const before = getOutputFrameId()
    sendImmediate({ 1: 255, 2: 0, 3: 0, 4: 0, 5: 128, 6: 0, 7: 0, 8: 0 })
    expect(getOutputFrameId()).toBeGreaterThan(before)
    const frame = getLastOutputChannels()
    expect(frame).toHaveLength(512)
    expect(frame[0]).toBe(255)
    expect(frame[4]).toBe(128)
    expect(frame[100]).toBe(0)
    // A later push moves the id again and the frame follows it.
    const id = getOutputFrameId()
    sendImmediate({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 })
    expect(getOutputFrameId()).toBeGreaterThan(id)
    expect(getLastOutputChannels()[0]).toBe(0)
    expect(getLastOutputChannels()[4]).toBe(0)
  })
})
