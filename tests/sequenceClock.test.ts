import { useShowStore } from '../src/renderer/src/stores/showStore'
import { expect, it, vi } from 'vitest'
import type { SequenceDef } from '../src/shared/types'
import { sequenceOrder, sequencePosition } from '../src/renderer/src/lib/sequenceClock'
import { configureSequences, configureEffects, sendImmediate } from '../src/renderer/src/lib/output'
const send = vi.fn(); let frame: (now: number) => void
vi.stubGlobal('window', { electronAPI: { setChannels: send } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn((fn) => { frame = fn; return 1 }))
const sequence: SequenceDef = { id: 's', name: 'S', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1, steps: [0, 100, 200].map((v, i) => ({ id: String(i), name: String(i), fixtureValues: { f: { intensity: v } }, presetIds: [], fadeMs: 0, holdMs: 1000 })) }
it('runs forward, backward, bounce and seeded random with loop and finite completion', () => {
  expect([0, 1000, 2000, 3000].map((t) => sequencePosition(sequence, t).index)).toEqual([0, 1, 2, 0])
  expect([0, 1000, 2000].map((t) => sequencePosition({ ...sequence, order: 'backward' }, t).index)).toEqual([2, 1, 0])
  expect([0, 1000, 2000, 3000, 4000].map((t) => sequencePosition({ ...sequence, order: 'bounce' }, t).index)).toEqual([0, 1, 2, 1, 0])
  for (const seed of [1, 3, 48]) { expect(sequenceOrder(8, 'random', seed)).toEqual(sequenceOrder(8, 'random', seed)); expect(new Set(sequenceOrder(8, 'random', seed)).size).toBe(8) }
  expect(sequencePosition({ ...sequence, loop: false }, 3000).index).toBe(-1)
  expect(sequencePosition({ ...sequence, loop: false, freezeOnCompletion: true }, 3000).index).toBe(2)
  expect(sequencePosition({ ...sequence, repeatCount: 2 }, 6000).completed).toBe(true)
})
it('sends sequence output through the shared layer and releases to base on stop', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  configureEffects({ fixtures: [{ id: 'f', name: 'F', type: 'dimmer', channelStart: 1, channels: 1 }], effects: [], blackout: false, master: 255 }); sendImmediate({ 1: 40 })
  configureSequences([sequence]); frame(1000); expect(send.mock.calls.at(-1)![0][1]).toBe(100)
  configureSequences([]); expect(send.mock.calls.at(-1)![0][1]).toBe(40)
  configureSequences([sequence]); useShowStore.getState().setShow(null); frame(2000)
  expect(send.mock.calls.at(-1)![0][1]).toBe(0)
  now.mockRestore()
})
it('uses seconds or beat timing at 120 BPM with per-step lengths and rate multipliers', () => {
  const beat = { ...sequence, timing: 'beat' as const }
  expect(sequencePosition(beat, 499, 1, 120).index).toBe(0)
  expect(sequencePosition(beat, 500, 1, 120).index).toBe(1)
  expect(sequencePosition({ ...beat, stepsPerBeat: 2 }, 250, 1, 120).index).toBe(1)
  expect(sequencePosition({ ...beat, steps: beat.steps.map((s) => ({ ...s, beats: 2 })) }, 999, 1, 120).index).toBe(0)
  expect(sequencePosition({ ...sequence, timeScale: 2 }, 1500).index).toBe(0)
  const fading = { ...sequence, steps: sequence.steps.map((s) => ({ ...s, fadeMs: 1000, holdMs: 1000 })) }
  expect(sequencePosition(fading, 1500).mix).toBe(0.5)
  const beatFading = { ...fading, timing: 'beat' as const, steps: fading.steps.map((s) => ({ ...s, fadeMs: 200 })) }
  expect(sequencePosition(beatFading, 600, 1, 120)).toMatchObject({ index: 0, nextIndex: 1, mix: 0.5 })
})
