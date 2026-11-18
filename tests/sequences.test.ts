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
it('duplicates a whole sequence with independent ids and undo', () => {
  const s = () => useShowStore.getState(); s().setShow(migrateShow({})); s().createSequence('S')
  const id = s().show!.sequences![0].id
  s().addSequenceStep(id); s().duplicateSequence(id)
  const sequences = s().show!.sequences!
  expect(sequences).toHaveLength(2)
  const [original, copy] = sequences
  expect(copy.name).toBe('S copy'); expect(copy.id).not.toBe(original.id)
  expect(copy.steps).toHaveLength(original.steps.length)
  expect(copy.steps.map((step) => step.id)).not.toEqual(original.steps.map((step) => step.id))
  expect(copy.steps.map((step) => step.name)).toEqual(original.steps.map((step) => step.name))
  expect(copy.steps.map((step) => step.fadeMs)).toEqual(original.steps.map((step) => step.fadeMs))
  s().undo(); expect(s().show!.sequences).toHaveLength(1)
  s().duplicateSequence('missing'); expect(s().show!.sequences).toHaveLength(1)
})
it('patches a single step in place with undo', () => {
  const s = () => useShowStore.getState(); s().setShow(migrateShow({})); s().createSequence('S')
  const sequence = s().show!.sequences![0], stepId = sequence.steps[0].id
  s().updateSequenceStep(sequence.id, stepId, { fadeMs: 2500, holdMs: 750, presetIds: ['p1'], name: 'Intro' })
  const step = s().show!.sequences![0].steps[0]
  expect(step.id).toBe(stepId); expect(step.fadeMs).toBe(2500); expect(step.holdMs).toBe(750)
  expect(step.presetIds).toEqual(['p1']); expect(step.name).toBe('Intro')
  s().undo(); expect(s().show!.sequences![0].steps[0].fadeMs).toBe(1000)
  s().updateSequenceStep(sequence.id, 'missing', { fadeMs: 1 }); expect(s().show!.sequences![0].steps[0].fadeMs).toBe(1000)
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
