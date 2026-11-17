import { describe, expect, it, vi } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import { allZeroPatch, configureLiveOutput, configureOverrideOutput, configurePresetOutput, sendImmediate, setEffectBlackout } from '../src/renderer/src/lib/output'

function harness() {
  const engine = new DMXEngine()
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++nextId, cb); return nextId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  setEffectBlackout(false)
  configurePresetOutput({}); configureOverrideOutput({}); configureLiveOutput({})
  sendImmediate(allZeroPatch())
  return { engine, frames, run: (id: number, now: number) => frames.get(id)!(now) }
}

describe('Live page fade and crossfade (7.2)', () => {
  it('crossfades outgoing to incoming levels using the incoming page fade time', () => {
    const h = harness()
    configureLiveOutput({ 1: 200 })
    expect(h.engine.snapshot()[0]).toBe(200)

    const start = performance.now()
    configureLiveOutput({ 1: 60 }, 1000) // page switch to levels 60 over 1s
    const [first] = [...h.frames.keys()]
    h.run(first, start + 500)
    const mid = h.engine.snapshot()[0]
    expect(mid).toBeGreaterThan(60)
    expect(mid).toBeLessThan(200)

    h.run(first, start + 1000)
    expect(h.engine.snapshot()[0]).toBe(60)
    configureLiveOutput({})
  })

  it('blackout wins throughout a page fade', () => {
    const h = harness()
    configureLiveOutput({ 1: 200 })
    const start = performance.now()
    configureLiveOutput({ 1: 60 }, 1000)
    const [first] = [...h.frames.keys()]
    setEffectBlackout(true); sendImmediate(allZeroPatch())
    h.run(first, start + 500)
    expect(h.engine.snapshot()[0]).toBe(0)
    setEffectBlackout(false); configureLiveOutput({})
  })

  it('cancels an in-flight page fade when the project changes', () => {
    const h = harness()
    configureLiveOutput({ 1: 200 })
    const start = performance.now()
    configureLiveOutput({ 1: 60 }, 1000)
    expect(h.frames.size).toBe(1)

    // setShow() pushes an empty live patch with no fade during project change.
    configureLiveOutput({})
    expect(h.frames.size).toBe(0)
    expect(h.engine.snapshot()[0]).toBe(0)
    void start // timing is irrelevant once the fade is cancelled
  })
})
