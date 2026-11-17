import { expect, it, vi } from 'vitest'
import { fanValues, evaluateFan } from '../src/renderer/src/lib/fanning'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
it('fans one, two, odd and even counts in every mode', () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    const linear = fanValues(count, 0, 100, 'linear'), reverse = fanValues(count, 0, 100, 'reverse'), centre = fanValues(count, 0, 100, 'centre')
    expect(linear).toHaveLength(count); expect(linear[0]).toBe(0); expect(reverse).toEqual(linear.map((v) => 100 - v)); expect(centre).toEqual([...centre].reverse())
    if (count > 1) expect(linear[count - 1]).toBe(100)
  }
  expect(fanValues(3, 0, 100, 'linear', [0, 1, 4])).toEqual([0, 25, 100])
  expect(fanValues(5, 0, 100, 'linear', undefined, [{ index: 0, value: 0 }, { index: 2, value: 200 }, { index: 4, value: 0 }])).toEqual([0, 100, 200, 100, 0])
})
it('orders fixtures spatially, uses spacing and ignores unsupported properties', () => {
  const show = migrateShow({ fixtures: [{ id: 'b', name: 'B', type: 'dimmer', channelStart: 2, previewPosition: { x: 10, y: 0 } }, { id: 'a', name: 'A', type: 'dimmer', channelStart: 1, previewPosition: { x: 0, y: 0 } }, { id: 'c', name: 'C', type: 'dimmer', channelStart: 3, previewPosition: { x: 40, y: 0 } }] })
  const fan = { id: 'f', attribute: 'intensity', fixtureIds: ['b', 'a', 'c'], mode: 'linear' as const, order: 'left-right' as const, considerSpacing: true, start: 0, end: 200 }
  expect(evaluateFan(show.fixtures, fan)).toEqual({ a: { intensity: 0 }, b: { intensity: 50 }, c: { intensity: 200 } })
  expect(evaluateFan(show.fixtures, { ...fan, attribute: 'pan' })).toEqual({})
})
it('saves, edits and deletes a fan with values kept or cleared, undoable and migratable', () => {
  const s = () => useShowStore.getState(); s().setShow(migrateShow({ fixtures: ['a', 'b', 'c'].map((id, i) => ({ id, name: id, type: 'dimmer', channelStart: i + 1, channels: 1 })), scenes: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: {} }] })); s().goToScene('s')
  const fan = { id: 'f', attribute: 'intensity', fixtureIds: ['a', 'b', 'c'], mode: 'linear' as const, order: 'selection' as const, start: 0, end: 200 }
  s().saveFan(fan); expect(s().scenes[0].fixtureValues.b.intensity).toBe(100)
  s().saveFan({ ...fan, end: 100 }); expect(s().scenes[0].fixtureValues.b.intensity).toBe(50)
  expect(migrateShow(JSON.parse(JSON.stringify(s().show))).scenes[0].fans).toEqual([{ ...fan, end: 100 }])
  s().deleteFan('f', true); expect(s().scenes[0].fixtureValues.b.intensity).toBe(50)
  s().undo(); s().deleteFan('f', false); expect(s().scenes[0].fixtureValues.b.intensity).toBeUndefined()
  s().undo(); expect(s().scenes[0].fans).toHaveLength(1)
})
