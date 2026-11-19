import { expect, it, vi } from 'vitest'
import { fanValues, evaluateFan, evaluateColorFan, fanColorValues } from '../src/renderer/src/lib/fanning'
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
  const s = () => useShowStore.getState(); s().setShow(migrateShow({ fixtures: ['a', 'b', 'c'].map((id, i) => ({ id, name: id, type: 'dimmer', channelStart: i + 1, channels: 1 })), cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: {} }] })); s().activateCue('s')
  const fan = { id: 'f', attribute: 'intensity', fixtureIds: ['a', 'b', 'c'], mode: 'linear' as const, order: 'selection' as const, start: 0, end: 200 }
  s().saveFan(fan); expect(s().cues[0].fixtureValues.b.intensity).toBe(100)
  s().saveFan({ ...fan, end: 100 }); expect(s().cues[0].fixtureValues.b.intensity).toBe(50)
  expect(migrateShow(JSON.parse(JSON.stringify(s().show))).cues[0].fans).toEqual([{ ...fan, end: 100 }])
  s().deleteFan('f', true); expect(s().cues[0].fixtureValues.b.intensity).toBe(50)
  s().undo(); s().deleteFan('f', false); expect(s().cues[0].fixtureValues.b.intensity).toBeUndefined()
  s().undo(); expect(s().cues[0].fans).toHaveLength(1)
})

const washFixtures = ['a', 'b', 'c'].map((id, i) => ({ id, name: id.toUpperCase(), type: 'led-wash', channelStart: i * 7 + 1, channels: 7 }))
const colorFan = { id: 'f', attribute: 'color', fixtureIds: ['a', 'b', 'c'], mode: 'linear' as const, order: 'selection' as const, start: 0, end: 255, startColor: '#ff0000', endColor: '#0000ff' }

it('fans colours across fixtures, interpolating in RGB', () => {
  expect(fanColorValues(3, '#ff0000', '#0000ff', 'linear')).toEqual(['#ff0000', '#800080', '#0000ff'])
  expect(fanColorValues(3, '#ff0000', '#0000ff', 'reverse')).toEqual(['#0000ff', '#800080', '#ff0000'])
  expect(fanColorValues(3, '#ff0000', '#0000ff', 'centre')).toEqual(['#0000ff', '#ff0000', '#0000ff'])
  expect(fanColorValues(5, '#ff0000', '#0000ff', 'linear', undefined, [{ index: 2, value: 0, color: '#00ff00' }])).toEqual(['#ff0000', '#808000', '#00ff00', '#008080', '#0000ff'])
  const show = migrateShow({ fixtures: washFixtures })
  expect(evaluateFan(show.fixtures, colorFan)).toEqual({
    a: { red: 255, green: 0, blue: 0 },
    b: { red: 128, green: 0, blue: 128 },
    c: { red: 0, green: 0, blue: 255 }
  })
  expect(evaluateColorFan(show.fixtures, colorFan)).toEqual({ a: '#ff0000', b: '#800080', c: '#0000ff' })
})

it('fans colours into CMY channels for CMY fixtures', () => {
  const cmyProfile = { id: 'cmy-test', name: 'CMY Test', manufacturer: 'Test', legacyType: 'par' as const, modes: [{ id: 'default', name: 'Default', channels: [
    { number: 0, attribute: 'intensity', propertyType: 'intensity' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
    { number: 1, attribute: 'cyan', propertyType: 'color' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
    { number: 2, attribute: 'magenta', propertyType: 'color' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
    { number: 3, attribute: 'yellow', propertyType: 'color' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 255 }
  ] }] }
  const show = migrateShow({ fixtures: ['a', 'b'].map((id, i) => ({ id, name: id.toUpperCase(), type: 'par', channelStart: i * 4 + 1, channels: 4, profile: cmyProfile })) })
  expect(evaluateFan(show.fixtures, { ...colorFan, fixtureIds: ['a', 'b'] })).toEqual({
    a: { cyan: 0, magenta: 255, yellow: 255 },
    b: { cyan: 255, magenta: 255, yellow: 0 }
  })
})

it('saves, edits and deletes a colour fan with values kept or cleared', () => {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({ fixtures: washFixtures, cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: {} }] }))
  s().activateCue('s')
  s().saveFan(colorFan)
  expect(s().cues[0].fixtureValues.b).toEqual({ red: 128, green: 0, blue: 128 })
  s().saveFan({ ...colorFan, endColor: '#00ff00' })
  expect(s().cues[0].fixtureValues.b).toEqual({ red: 128, green: 128, blue: 0 })
  s().deleteFan('f', true)
  expect(s().cues[0].fixtureValues.b).toEqual({ red: 128, green: 128, blue: 0 })
  s().undo()
  s().deleteFan('f', false)
  expect(s().cues[0].fixtureValues.b.red).toBeUndefined()
  expect(s().cues[0].fixtureValues.b.green).toBeUndefined()
  expect(s().cues[0].fixtureValues.b.blue).toBeUndefined()
  s().undo()
  expect(s().cues[0].fans).toHaveLength(1)
})
