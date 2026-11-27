import { describe, expect, it, vi } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import type { ShowDef } from '../src/shared/types'

const engine = new DMXEngine()
const frames: FrameRequestCallback[] = []
vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
vi.stubGlobal('cancelAnimationFrame', () => {})
import { useShowStore } from '../src/renderer/src/stores/showStore'

describe('cue output to the DMX universe', () => {
  it('fades a cue into the same universe used by USB output and restores it after testing', () => {
    const show: ShowDef = {
      id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
      fixtures: [{ id: 'led', name: 'LED', type: 'generic-led', channelStart: 1, channels: 4 }],
      livePages: [{ id: 'page', name: 'Page', controls: [{ id: 'btn', name: 'Red', type: 'push', cue: { id: 'cue', name: 'Red', fadeMs: 1000, fixtureValues: { led: { intensity: 255, red: 200, green: 0, blue: 0 } } }, presetIds: [] }] }],
      automations: []
    }
    useShowStore.getState().setShow(show)
    engine.startTest()
    engine.setTestChannel(1, 30)
    useShowStore.getState().activateCue('cue')
    const tick = frames.pop()!
    tick(performance.now() + 1100)
    expect(engine.snapshot()[0]).toBe(30)
    engine.stopTest()
    expect(Array.from(engine.snapshot().slice(0, 4))).toEqual([255, 200, 0, 0])
  })
})
