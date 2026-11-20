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
      [0, 'intensity', 'intensity'], [1, 'red', 'color'], [2, 'pan', 'position'], [3, 'Pan fine 1', 'position'], [4, 'Unused 5', 'other']
    ])
    expect(profile.modes[0].channels[2]).toMatchObject({ defaultValue: 128, highlightValue: 255 })
    expect(profile.modes[0].channels[3]).toMatchObject({ defaultValue: 0, highlightValue: 255 })
    expect(profile.ofl?.source).toEqual(oflFixture)
  })

  it('defaults an undefined colour to blue unless the definition sets one (Guide p.85)', () => {
    const colourFixture = {
      ...oflFixture,
      fixtureKey: 'colour-test',
      name: 'Colour Test',
      categories: ['Color Changer'],
      availableChannels: {
        Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
        Green: { capability: { type: 'ColorIntensity', color: 'Green' } },
        Blue: { capability: { type: 'ColorIntensity', color: 'Blue' } },
        Cyan: { capability: { type: 'ColorIntensity', color: 'Cyan' } },
        Magenta: { capability: { type: 'ColorIntensity', color: 'Magenta' } },
        Yellow: { capability: { type: 'ColorIntensity', color: 'Yellow' } },
        'Blue (forced off)': { defaultValue: 0, capability: { type: 'ColorIntensity', color: 'Blue' } }
      },
      modes: [{ name: 'Colour', shortName: '7ch', channels: ['Red', 'Green', 'Blue', 'Cyan', 'Magenta', 'Yellow', 'Blue (forced off)'] }]
    }
    const profile = importOflFixture(colourFixture, { manufacturer: 'Sample Brand' })
    expect(profile.modes[0].channels.map((channel) => [channel.attribute, channel.defaultValue])).toEqual([
      ['red', 0], ['green', 0], ['blue', 255], ['cyan', 255], ['magenta', 255], ['yellow', 0], ['blue 2', 0]
    ])
  })

  it('defaults an undefined dimmer to 0 unless the definition sets one', () => {
    const dimmerFixture = {
      ...oflFixture,
      fixtureKey: 'dimmer-test',
      name: 'Dimmer Test',
      categories: ['Dimmer'],
      availableChannels: {
        Dimmer: { capability: { type: 'Intensity' } },
        'Dimmer (forced off)': { defaultValue: 0, capability: { type: 'Intensity' } }
      },
      modes: [{ name: 'Dimmer', shortName: '2ch', channels: ['Dimmer', 'Dimmer (forced off)'] }]
    }
    const profile = importOflFixture(dimmerFixture, { manufacturer: 'Sample Brand' })
    expect(profile.modes[0].channels.map((channel) => [channel.attribute, channel.defaultValue])).toEqual([
      ['intensity', 0], ['intensity 2', 0]
    ])
  })

  it('auto-detects OFL JSON and supports compact bulk-library conversion', () => {
    expect(importProfile(JSON.stringify(oflFixture), { manufacturer: 'Sample Brand' }).name).toBe('Sample Move')
    expect(importOflFixture(oflFixture, { preserveSource: false }).ofl?.source).toBeUndefined()
  })

  it('expands OFL matrix template channels in declared channel order', () => {
    const matrix = {
      ...oflFixture,
      name: 'Pixel Bar',
      categories: ['Pixel Bar'],
      availableChannels: {},
      matrix: { pixelCount: [2, 1, 1] },
      templateChannels: {
        'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } },
        'Green $pixelKey': { capability: { type: 'ColorIntensity', color: 'Green' } }
      },
      modes: [{ name: 'Pixels', channels: [{ insert: 'matrixChannels', repeatFor: 'eachPixelXYZ', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey', 'Green $pixelKey'] }] }]
    }
    const profile = importOflFixture(matrix)
    expect(profile.modes[0].channels.map((channel) => channel.attribute)).toEqual([
      'red', 'green', 'red 2', 'green 2'
    ])
    expect(profile.legacyType).toBe('pixel-bar-17ch')
    // A matrix mode whose insert is first and pixel-major is flexible: the
    // LED count can be chosen at patch time and the footprint shrinks.
    expect(profile.modes[0].flexibleLeds).toEqual({ channelsPerLed: 2, maxLeds: 2, defaultLeds: 2, minLeds: 1 })
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

  it('wires the OFL zip upload and duplicate into Patch', () => {
    const main = readFileSync('src/main/index.ts', 'utf8')
    const preload = readFileSync('src/preload/index.ts', 'utf8')
    const patch = readFileSync('src/renderer/src/components/PatchPanel.tsx', 'utf8')
    expect(main).toContain("properties: ['openFile']")
    expect(main).toContain("extensions: ['zip']")
    expect(main).toContain("'manufacturers.json'")
    expect(main).toContain("ipcMain.handle('ofl-library:import-zip'")
    expect(main).toContain("ipcMain.handle('ofl-library:duplicate'")
    expect(main).not.toContain("ipcMain.handle('ofl-library:import'")
    expect(main).not.toContain("properties: ['openDirectory']")
    expect(preload).toContain("ipcRenderer.invoke('ofl-library:import-zip')")
    expect(preload).toContain("ipcRenderer.invoke('ofl-library:duplicate'")
    expect(patch).toContain('importOflLibraryZip')
    // The upload button is labelled Import (Jake, 20 Nov 2026) and
    // Duplicate and + Custom are one New Fixture button (Jake,
    // 20 Nov 2026) — the zip picker still opens.
    expect(patch).toContain('>Import<')
    expect(patch).toContain('>New Fixture<')
    expect(patch).not.toContain('>+ Custom<')
    expect(patch).not.toContain('>Duplicate<')
    expect(patch).toContain('User Fixtures')
    expect(patch).not.toContain('Export OFL')
    expect(patch).toContain('listOflProfiles')
  })
})
