import { expect, it, vi } from 'vitest'
import { migrateShow } from '../src/shared/migrations'
import { useShowStore } from '../src/renderer/src/stores/showStore'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
it('migrates empty sequences and supports sequence creation, editing, deletion, undo and round trip', () => {
  const s = () => useShowStore.getState(); expect(migrateShow({}).sequences).toEqual([])
  s().setShow(migrateShow({ scenes: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { f: { pan: 120 } } }] })); s().goToScene('s'); s().createSequence('Movement')
  const sequence = s().show!.sequences![0]; expect(sequence.steps[0].fixtureValues.f.pan).toBe(120)
  s().updateSequence(sequence.id, { name: 'New name', steps: [{ ...sequence.steps[0], fadeMs: 2000, holdMs: 500, presetIds: ['p'] }] })
  const roundtrip = migrateShow(JSON.parse(JSON.stringify(s().show))); expect(roundtrip.sequences).toEqual(s().show!.sequences)
  s().deleteSequence(sequence.id); expect(s().show!.sequences).toEqual([])
  s().undo(); expect(s().show!.sequences![0].steps[0].holdMs).toBe(500)
  s().undo(); expect(s().show!.sequences![0].name).toBe('Movement')
})
it('adds, duplicates, reorders and removes independent steps with undo', () => {
  const s = () => useShowStore.getState(); s().setShow(migrateShow({})); s().createSequence('S')
  const id = s().show!.sequences![0].id, steps = () => s().show!.sequences![0].steps
  s().addSequenceStep(id); const second = steps()[1].id
  s().duplicateSequenceStep(id, second); expect(steps()).toHaveLength(3); expect(steps()[2].id).not.toBe(second)
  s().moveSequenceStep(id, second, 0); expect(steps()[0].id).toBe(second)
  s().reorderSequenceSteps(id, 'backward'); expect(steps()[2].id).toBe(second)
  const before = structuredClone(steps()); s().reorderSequenceSteps(id, 'random', 42); expect(new Set(steps().map((s) => s.id))).toEqual(new Set(before.map((s) => s.id)))
  s().removeSequenceStep(id, second); expect(steps()).toHaveLength(2); s().undo(); expect(steps()).toHaveLength(3)
  s().undo(); expect(steps()).toEqual(before)
})
