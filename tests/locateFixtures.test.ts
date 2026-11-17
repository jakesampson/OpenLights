import { describe, expect, it, vi } from 'vitest'
import { locateFixturePatch } from '../src/renderer/src/lib/locateFixtures'
import { composeOutput } from '../src/renderer/src/lib/outputModel'
import { configureLocateOutput, sendImmediate, setEffectBlackout } from '../src/renderer/src/lib/output'
describe('temporary fixture locate', () => {
  it('opens a fixture at white above cues, preserving all programmed values', () => {
    const patch = locateFixturePatch([{ id: 'f', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], ['f'])
    expect(patch).toEqual({ 1: 255, 2: 255, 3: 255, 4: 255 })
    const base = { 1: 40 }
    expect(composeOutput({ base, locate: patch })[1]).toBe(255)
    expect(composeOutput({ base })[1]).toBe(40)
    expect(composeOutput({ base, locate: patch, blackout: true })[1]).toBe(0)
  })
  it('releases the actual output contribution after its timeout', () => {
    vi.useFakeTimers()
    const output = vi.fn(); vi.stubGlobal('window', { electronAPI: { setChannels: output } }); vi.stubGlobal('cancelAnimationFrame', vi.fn())
    setEffectBlackout(false); sendImmediate({ 1: 40 }); configureLocateOutput({ 1: 255 }, 1000)
    expect(output.mock.calls.at(-1)![0][1]).toBe(255)
    vi.advanceTimersByTime(1000); expect(output.mock.calls.at(-1)![0][1]).toBe(40)
    configureLocateOutput({}); vi.useRealTimers()
  })
})
