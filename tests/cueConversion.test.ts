import { describe, expect, it } from 'vitest'
import type { FixtureDef, CueDef } from '../src/shared/types'
import {
  attributeCategory,
  inferCueCategory,
  cueToPreset,
  cuesToPresets
} from '../src/shared/cueConversion'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'

const fixtures: FixtureDef[] = [
  { id: 'f1', name: 'Wash', type: 'led-wash', channelStart: 1, channels: 7, profileId: 'wash-rgbaw' },
  { id: 'f2', name: 'Head', type: 'moving-head', channelStart: 10, channels: 8, profileId: 'head-8ch' },
  { id: 'f3', name: 'Dim', type: 'dimmer', channelStart: 20, channels: 1, profileId: 'dimmer-1ch' }
]

const cues: CueDef[] = [
  {
    id: 's1',
    name: 'Warm wash',
    fadeMs: 800,
    fixtureValues: { f1: { intensity: 255, red: 200, green: 100 }, f2: { pan: 32, tilt: 128 } },
    fans: [{ id: 'fan1', attribute: 'pan', fixtureIds: ['f2'], mode: 'linear', order: 'name', start: 0, end: 255 }]
  },
  { id: 's2', name: 'Focus', fadeMs: 1200, fixtureValues: { f2: { gobo: 10, pan: 64 }, f3: { intensity: 128 } } },
  { id: 's3', name: 'Blackout', fadeMs: 0, blackout: true, fixtureValues: {} }
]

const presetAsCue = (preset: ReturnType<typeof cueToPreset>): CueDef => ({
  id: preset.id,
  name: preset.name,
  fadeMs: 0,
  fixtureValues: preset.fixtureValues,
  ...(preset.fans ? { fans: preset.fans } : {})
})

describe('cue to preset conversion (6.14)', () => {
  it('converts every cue into a preset without changing the originals', () => {
    const before = structuredClone(cues)
    const presets = cuesToPresets(cues, fixtures)
    expect(presets).toHaveLength(cues.length)
    expect(presets.map((p) => p.id)).toEqual(['preset-from-cue:s1', 'preset-from-cue:s2', 'preset-from-cue:s3'])
    expect(presets.map((p) => p.name)).toEqual(cues.map((s) => s.name))
    expect(cues).toEqual(before)
  })

  it('produces identical DMX output for every cue at any master level', () => {
    const presets = cuesToPresets(cues, fixtures)
    for (const master of [255, 128, 0]) {
      cues.forEach((cue, index) => {
        const cueChannels = computeCueChannels(fixtures, cue, master)
        const presetChannels = computeCueChannels(fixtures, presetAsCue(presets[index]), master)
        expect(presetChannels).toEqual(cueChannels)
      })
    }
  })

  it('copies fixture values and fans deeply (no shared references)', () => {
    const preset = cueToPreset(cues[0], fixtures)
    expect(preset.fixtureValues).toEqual(cues[0].fixtureValues)
    expect(preset.fans).toEqual(cues[0].fans)
    preset.fixtureValues.f1.red = 1
    expect(cues[0].fixtureValues.f1.red).toBe(200)
    preset.fans![0].fixtureIds.push('extra')
    expect(cues[0].fans![0].fixtureIds).toEqual(['f2'])
  })

  it('infers a stable palette category from the patch profiles', () => {
    expect(attributeCategory('intensity', fixtures)).toBe('intensity')
    expect(attributeCategory('red', fixtures)).toBe('color')
    expect(attributeCategory('pan', fixtures)).toBe('position')
    expect(attributeCategory('gobo', fixtures)).toBe('other')
    expect(attributeCategory('unknown-attr', fixtures)).toBe('other')
    expect(inferCueCategory(cues[0], fixtures)).toBe('color')
    expect(inferCueCategory(cues[1], fixtures)).toBe('intensity') // equal counts resolve to intensity first
    expect(inferCueCategory(cues[2], fixtures)).toBe('intensity')
  })

  it('supports a custom id factory', () => {
    const presets = cuesToPresets(cues, fixtures, { makeId: (cue) => `converted-${cue.id}` })
    expect(presets.map((p) => p.id)).toEqual(['converted-s1', 'converted-s2', 'converted-s3'])
  })
})
