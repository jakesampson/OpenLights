import { expect, it, vi } from 'vitest'
import { evaluateFan, fanValues, orderedFanFixtures } from '../src/renderer/src/lib/fanning'
import { clearFanRowValue, defaultFan, definedFanIndexes, fanRows, setFanRowValue } from '../src/renderer/src/lib/fanningHud'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

const dimmers = ['a', 'b', 'c'].map((id, i) => ({ id, name: id.toUpperCase(), type: 'dimmer', channelStart: i + 1, channels: 1 }))
const baseFan = { id: 'f', attribute: 'intensity', fixtureIds: ['a', 'b', 'c'], mode: 'linear' as const, order: 'selection' as const, start: 0, end: 200 }

it('defaults a new fan to the channel range and the selection', () => {
  expect(defaultFan('intensity', ['a', 'b', 'c'], { attribute: 'intensity', number: 0, propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 255 })).toEqual({ id: '', attribute: 'intensity', fixtureIds: ['a', 'b', 'c'], mode: 'linear', order: 'selection', start: 0, end: 255 })
  expect(defaultFan('pan', ['a'], undefined)).toMatchObject({ attribute: 'pan', start: 0, end: 255 })
})

it('lists fan rows with computed values and blue-dot defined flags', () => {
  const show = migrateShow({ fixtures: dimmers })
  const rows = fanRows(show.fixtures, baseFan)
  expect(rows.map((r) => r.value)).toEqual([0, 100, 200])
  expect(rows.map((r) => r.defined)).toEqual([true, false, true])
  expect(fanRows(show.fixtures, { ...baseFan, anchors: [{ index: 1, value: 50 }] }).map((r) => r.value)).toEqual([0, 50, 200])
  expect(fanRows(show.fixtures, { ...baseFan, attribute: 'pan' }).map((r) => r.value)).toEqual([null, null, null])
  expect(definedFanIndexes({ ...baseFan, anchors: [{ index: 1, value: 50 }] })).toEqual([0, 1, 2])
})

it('edits endpoints through their rows and intermediates through anchors', () => {
  expect(setFanRowValue(baseFan, 0, 10)).toMatchObject({ start: 10, end: 200 })
  expect(setFanRowValue(baseFan, 2, 90)).toMatchObject({ start: 0, end: 90 })
  expect(setFanRowValue(baseFan, 1, 50)).toEqual({ ...baseFan, anchors: [{ index: 1, value: 50 }] })
  expect(setFanRowValue({ ...baseFan, anchors: [{ index: 1, value: 50 }] }, 1, 70)).toEqual({ ...baseFan, anchors: [{ index: 1, value: 70 }] })
  expect(setFanRowValue(baseFan, 1, 300)).toMatchObject({ anchors: [{ index: 1, value: 255 }] })
  // Endpoints can never be cleared — they are the last two defined
  // values (Guide p.121); only an intermediate anchor can be removed.
  expect(clearFanRowValue(baseFan, 0)).toBe(baseFan)
  expect(clearFanRowValue(baseFan, 2)).toBe(baseFan)
  expect(clearFanRowValue({ ...baseFan, anchors: [{ index: 1, value: 50 }] }, 1)).toEqual({ ...baseFan, anchors: undefined })
})

it('interpolates through a single intermediate anchor between the endpoints', () => {
  expect(fanValues(5, 0, 100, 'linear', undefined, [{ index: 2, value: 200 }])).toEqual([0, 100, 200, 150, 100])
  expect(fanValues(5, 0, 100, 'linear', undefined, [{ index: 0, value: 0 }, { index: 2, value: 200 }, { index: 4, value: 0 }])).toEqual([0, 100, 200, 100, 0])
})

it('orders right-to-left and bottom-to-top, with spacing', () => {
  const show = migrateShow({ fixtures: [{ id: 'b', name: 'B', type: 'dimmer', channelStart: 2, previewPosition: { x: 10, y: 40 } }, { id: 'a', name: 'A', type: 'dimmer', channelStart: 1, previewPosition: { x: 0, y: 0 } }, { id: 'c', name: 'C', type: 'dimmer', channelStart: 3, previewPosition: { x: 40, y: 10 } }] })
  expect(orderedFanFixtures(show.fixtures, { ...baseFan, order: 'right-left' }).map((f) => f.id)).toEqual(['c', 'b', 'a'])
  expect(orderedFanFixtures(show.fixtures, { ...baseFan, order: 'bottom-top' }).map((f) => f.id)).toEqual(['b', 'c', 'a'])
  expect(evaluateFan(show.fixtures, { ...baseFan, order: 'right-left', considerSpacing: true })).toEqual({ c: { intensity: 0 }, b: { intensity: 150 }, a: { intensity: 200 } })
  expect(evaluateFan(show.fixtures, { ...baseFan, order: 'bottom-top', considerSpacing: true })).toEqual({ b: { intensity: 0 }, c: { intensity: 150 }, a: { intensity: 200 } })
})

it('creates, edits and deletes a fan through the HUD commit path with values landing on the fixtures', () => {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({ fixtures: dimmers, cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: {} }] }))
  s().activateCue('s')
  // Create: the HUD opens a default fan over the selection and commits it.
  const created = { ...defaultFan('intensity', ['a', 'b', 'c']), id: 'hud-1' }
  s().saveFan(created)
  expect(s().cues[0].fans).toEqual([created])
  expect(s().cues[0].fixtureValues).toMatchObject({ a: { intensity: 0 }, b: { intensity: 128 }, c: { intensity: 255 } })
  // Edit the last row (endpoint) — the values move with it.
  s().saveFan(setFanRowValue(created, 2, 100))
  expect(s().cues[0].fixtureValues).toMatchObject({ a: { intensity: 0 }, b: { intensity: 50 }, c: { intensity: 100 } })
  // Edit a middle row — an anchor bends the fan through that fixture.
  const anchored = setFanRowValue({ ...created, end: 100 }, 1, 90)
  s().saveFan(anchored)
  expect(s().cues[0].fixtureValues.b.intensity).toBe(90)
  expect(s().cues[0].fans).toEqual([anchored])
  // Delete and keep values, then delete and clear (Guide p.122–123).
  s().deleteFan('hud-1', true)
  expect(s().cues[0].fans).toEqual([])
  expect(s().cues[0].fixtureValues.b.intensity).toBe(90)
  s().undo()
  s().deleteFan('hud-1', false)
  expect(s().cues[0].fixtureValues.b.intensity).toBeUndefined()
  expect(s().cues[0].fixtureValues.a.intensity).toBeUndefined()
})

it('starts a cue when the HUD commits with no active cue, then the fan lands', () => {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({ fixtures: dimmers, cues: [] }))
  expect(s().activeCueId).toBeNull()
  // The commit path the HUD uses: addCue does not activate on its own.
  s().addCue()
  expect(s().activeCueId).toBeNull()
  const created = s().cues[s().cues.length - 1]
  s().activateCue(created.id)
  s().saveFan({ ...defaultFan('intensity', ['a', 'b', 'c']), id: 'hud-2' })
  expect(s().cues[0].fixtureValues).toMatchObject({ a: { intensity: 0 }, b: { intensity: 128 }, c: { intensity: 255 } })
})
