import { describe, expect, it } from 'vitest'
import { resizeFixtureIcon, rotateFixtureIcon } from '../src/renderer/src/lib/fixtureGeometry'
import { migrateShow } from '../src/shared/migrations'
import type { FixtureDef } from '../src/shared/types'
describe('fixture icon transforms', () => {
  const fixture: FixtureDef = { id: 'f', name: 'Dimmer', type: 'dimmer', channelStart: 1, channels: 1 }
  it('resizes proportionally with bounds and rotates around its centre', () => {
    expect(resizeFixtureIcon(fixture, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBe(20)
    expect(resizeFixtureIcon(fixture, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 1000, y: 0 })).toBe(80)
    expect(rotateFixtureIcon(fixture, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })).toBe(90)
  })
  it('migrates defaults without changing fixture addresses or attributes', () => {
    expect(migrateShow({ fixtures: [fixture] }).fixtures[0]).toMatchObject({ ...fixture, iconSize: 10, rotation: 0, namePosition: 'above', previewBeam: { direction: 'auto' }, inStorage: false })
  })
})

it('round trips per-fixture name placement and repairs invalid values', () => {
 for (const namePosition of ['above', 'below', 'hidden'] as const) {
  const show = migrateShow({ fixtures: [{ id: 'fixture', namePosition }] })
  expect(migrateShow(JSON.parse(JSON.stringify(show))).fixtures[0].namePosition).toBe(namePosition)
 }
 expect(migrateShow({ fixtures: [{ namePosition: 'invalid' }] }).fixtures[0].namePosition).toBe('above')
})
