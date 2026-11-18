import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import { exportOflFixture, importOflFixture, isOflFixture, oflFilename } from '../src/shared/oflFixtureFormat'
import { importProfile } from '../src/shared/profileValidation'

const oflFixture = {
  $schema: 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/schema-12.6.0/schemas/fixture.json',
  fixtureKey: 'sample-move',
  manufacturerKey: 'sample-brand',
  name: 'Sample Move',
  categories: ['Moving Head'],
  meta: { authors: ['OFL'], createDate: '2026-01-01', lastModifyDate: '2026-01-01' },
  availableChannels: {
    Dimmer: { defaultValue: 0, highlightValue: '100%', capability: { type: 'Intensity' } },
    Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
    Pan: { dmxValueResolution: '16bit', fineChannelAliases: ['Pan fine'], defaultValue: 32768, highlightValue: 65535, capability: { type: 'Pan' } }
  },
  modes: [{ name: 'Extended', shortName: '5ch', channels: ['Dimmer', 'Red', 'Pan', 'Pan fine', null] }]
}

describe('Open Fixture Library format', () => {
  it('imports OFL modes, channel functions, fine channels and identity', () => {
    const profile = importOflFixture(oflFixture, { manufacturer: 'Sample Brand' })
    expect(profile).toMatchObject({ id: 'ofl:sample-brand:sample-move', name: 'Sample Move', manufacturer: 'Sample Brand', legacyType: 'moving-head' })
    expect(profile.modes[0].channels.map((channel) => [channel.number, channel.attribute, channel.propertyType])).toEqual([
      [0, 'Dimmer', 'intensity'], [1, 'Red', 'color'], [2, 'Pan', 'position'], [3, 'Pan fine 1', 'position'], [4, 'Unused 5', 'other']
    ])
    expect(profile.modes[0].channels[2]).toMatchObject({ defaultValue: 128, highlightValue: 255 })
    expect(profile.modes[0].channels[3]).toMatchObject({ defaultValue: 0, highlightValue: 255 })
    expect(profile.ofl?.source).toEqual(oflFixture)
  })

  it('auto-detects OFL JSON and supports compact bulk-library conversion', () => {
    expect(importProfile(JSON.stringify(oflFixture), { manufacturer: 'Sample Brand' }).name).toBe('Sample Move')
    expect(importOflFixture(oflFixture, { preserveSource: false }).ofl?.source).toBeUndefined()
  })

  it('exports native OpenLights profiles as OFL JSON without mutating them', () => {
    const profile = structuredClone(BUILTIN_PROFILES[0])
    const before = structuredClone(profile)
    const exported = JSON.parse(exportOflFixture(profile))
    expect(isOflFixture(exported)).toBe(true)
    expect(exported).toMatchObject({ name: profile.name, categories: ['Color Changer'] })
    expect(profile).toEqual(before)
    expect(oflFilename(profile)).toBe('generic@generic-par-rgb.json')
  })

  it('wires the native OFL export-folder importer into Patch', () => {
    const main = readFileSync('src/main/index.ts', 'utf8')
    const preload = readFileSync('src/preload/index.ts', 'utf8')
    const patch = readFileSync('src/renderer/src/components/PatchPanel.tsx', 'utf8')
    expect(main).toContain("properties: ['openDirectory']")
    expect(main).toContain("'manufacturers.json'")
    expect(main).toContain("ipcMain.handle('ofl-library:import'")
    expect(preload).toContain("ipcRenderer.invoke('ofl-library:import')")
    expect(patch).toContain('Import OFL library')
    expect(patch).toContain('listOflProfiles')
  })
})
