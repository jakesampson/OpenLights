import { describe, expect, it, vi } from 'vitest'
import type { FixtureDef, PresetDef } from '../src/shared/types'
import {
  PRESET_PALETTE_FORMAT,
  PRESET_PALETTE_VERSION,
  exportPresetPalette,
  importPresetPalette,
  serializePresetPalette,
  validatePresetPalette
} from '../src/renderer/src/lib/presetPaletteIo'

const fixture = (id: string, name: string, profileId: string, type: FixtureDef['type'] = 'moving-head'): FixtureDef => ({
  id,
  name,
  type,
  channelStart: 1,
  channels: 8,
  profileId
})

const sourceFixtures: FixtureDef[] = [
  fixture('f1', 'Wash 1', 'wash-profile'),
  fixture('f2', 'Beam 2', 'beam-profile'),
  fixture('f3', 'Old Fixture', 'old-profile')
]

const presets: PresetDef[] = [
  {
    id: 'p1',
    name: 'Warm Wash',
    category: 'color',
    fixtureValues: { f1: { red: 255, green: 128 }, f2: { blue: 200 } },
    fans: [{ id: 'fan1', attribute: 'pan', fixtureIds: ['f1', 'f2'], mode: 'linear', order: 'name', start: 0, end: 255 }]
  },
  { id: 'p2', name: 'Old Look', category: 'other', fixtureValues: { f3: { intensity: 255 } } }
]

describe('preset palette JSON export/import (6.13)', () => {
  it('validates the document shape', () => {
    const doc = exportPresetPalette(presets, sourceFixtures)
    expect(doc.format).toBe(PRESET_PALETTE_FORMAT)
    expect(doc.version).toBe(PRESET_PALETTE_VERSION)
    expect(validatePresetPalette(doc)).toEqual([])
    expect(validatePresetPalette({ format: 'wrong' })).toContain('Unsupported preset palette format')
    expect(validatePresetPalette(null)).toHaveLength(1)
  })

  it('round-trips presets through serialized JSON when every fixture matches', () => {
    const json = serializePresetPalette(exportPresetPalette(presets, sourceFixtures))
    const result = importPresetPalette(json, sourceFixtures, { preserveIds: true })
    expect(result.skipped).toEqual([])
    expect(result.matched).toHaveLength(3)
    expect(result.presets).toEqual(presets)
  })

  it('re-maps values to different target fixture ids by name and profile', () => {
    const json = serializePresetPalette(exportPresetPalette(presets, sourceFixtures))
    const targetFixtures = [
      fixture('new-a', 'Wash 1', 'wash-profile'),
      fixture('new-b', 'Beam 2', 'beam-profile'),
      fixture('new-c', 'Old Fixture', 'old-profile')
    ]
    const result = importPresetPalette(json, targetFixtures, { preserveIds: true })
    expect(result.skipped).toEqual([])
    expect(result.presets[0].fixtureValues).toEqual({ 'new-a': { red: 255, green: 128 }, 'new-b': { blue: 200 } })
    expect(result.presets[0].fans?.[0].fixtureIds).toEqual(['new-a', 'new-b'])
    expect(result.presets[1].fixtureValues).toEqual({ 'new-c': { intensity: 255 } })
  })

  it('matches names case-insensitively but will not match a different profile', () => {
    const json = serializePresetPalette(exportPresetPalette([presets[0]], sourceFixtures))
    const targetFixtures = [
      fixture('t1', '  wash 1 ', 'wash-profile'),
      fixture('t2', 'Beam 2', 'a-different-profile')
    ]
    const result = importPresetPalette(json, targetFixtures, { preserveIds: true })
    expect(result.presets[0].fixtureValues).toEqual({ t1: { red: 255, green: 128 } })
    expect(result.skipped.map((s) => s.fixtureName)).toEqual(['Beam 2'])
  })

  it('skips and logs a fixture that is not found in the target show', () => {
    const json = serializePresetPalette(exportPresetPalette(presets, sourceFixtures))
    const onSkip = vi.fn()
    // Target show only has Wash 1 and Beam 2; "Old Fixture" is absent.
    const targetFixtures = [fixture('new-a', 'Wash 1', 'wash-profile'), fixture('new-b', 'Beam 2', 'beam-profile')]
    const result = importPresetPalette(json, targetFixtures, { preserveIds: true, onSkip })

    expect(result.skipped).toEqual([
      { fixtureId: 'f3', fixtureName: 'Old Fixture', reason: 'no fixture with a matching name and profile' }
    ])
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onSkip).toHaveBeenCalledWith(result.skipped[0])
    expect(result.presets[1].fixtureValues).toEqual({})
    expect(result.presets[1].name).toBe('Old Look')
  })

  it('drops fans whose fixtures are all unmatched and never mutates the source', () => {
    const json = serializePresetPalette(exportPresetPalette([presets[0]], sourceFixtures))
    const original = JSON.parse(json)
    const result = importPresetPalette(json, [fixture('only', 'Unrelated', 'x')], { preserveIds: true })
    expect(result.presets[0].fans).toEqual([])
    expect(result.presets[0].fixtureValues).toEqual({})
    expect(JSON.parse(json)).toEqual(original)
    expect(presets[0].fixtureValues.f1).toEqual({ red: 255, green: 128 })
  })

  it('generates fresh preset ids by default and rejects invalid documents', () => {
    const json = serializePresetPalette(exportPresetPalette(presets, sourceFixtures))
    let n = 0
    const result = importPresetPalette(json, sourceFixtures, { makeId: () => `gen-${++n}` })
    expect(result.presets.map((p) => p.id)).toEqual(['gen-1', 'gen-2'])
    expect(() => importPresetPalette('{ not json', sourceFixtures)).toThrow()
  })
})
