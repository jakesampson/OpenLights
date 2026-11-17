import { describe, expect, it, vi } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import { allZeroPatch, configureLiveOutput, configureOverrideOutput, configurePresetOutput, sendImmediate, setEffectBlackout } from '../src/renderer/src/lib/output'

describe('live output layers', () => {
  it('restores underlying looks as live cues and manual overrides are released, while blackout wins', () => {
    const engine = new DMXEngine()
    vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
    setEffectBlackout(false)
    configurePresetOutput({}); configureLiveOutput({}); configureOverrideOutput({})
    sendImmediate({ 1: 30 })
    configureLiveOutput({ 1: 90, 2: 45 })
    configurePresetOutput({ 1: 120 })
    configureOverrideOutput({ 1: 200 })
    expect(Array.from(engine.snapshot().slice(0, 2))).toEqual([200, 45])
    configureOverrideOutput({})
    expect(engine.snapshot()[0]).toBe(120)
    configurePresetOutput({})
    expect(engine.snapshot()[0]).toBe(90)
    configureLiveOutput({})
    expect(Array.from(engine.snapshot().slice(0, 2))).toEqual([30, 0])
    setEffectBlackout(true); sendImmediate(allZeroPatch()); configureOverrideOutput({ 1: 255 })
    expect(engine.snapshot()[0]).toBe(0)
    configureOverrideOutput({}); setEffectBlackout(false)
  })
})
