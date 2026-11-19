import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importOflFixture, isOflFixture } from '../src/shared/oflFixtureFormat'

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url))

function jsonFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsonFiles(target))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) out.push(target)
  }
  return out
}

describe('bundled fixture library (Piece 2)', () => {
  it('imports every bundled OFL fixture', () => {
    const manufacturers = JSON.parse(readFileSync(join(fixturesDir, 'manufacturers.json'), 'utf8')) as Record<string, { name?: string }>
    const files = jsonFiles(fixturesDir).filter((file) => basename(file).toLowerCase() !== 'manufacturers.json')
    // The OFL export Jake provided 19 Nov 2026 (656 fixtures) plus the
    // five profiles authored from their DMX charts (Piece 2 + EP4).
    expect(files.length).toBe(661)
    const ids = new Set<string>()
    const failures: string[] = []
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8'))
        if (!isOflFixture(raw)) { failures.push(`${file}: not an OFL fixture`); continue }
        const manufacturerKey = typeof raw.manufacturerKey === 'string' ? raw.manufacturerKey : basename(dirname(file))
        const fixtureKey = typeof raw.fixtureKey === 'string' ? raw.fixtureKey : basename(file, '.json')
        const profile = importOflFixture(raw, { manufacturerKey, manufacturer: manufacturers[manufacturerKey]?.name, fixtureKey, preserveSource: false })
        if (!profile.modes.length || profile.modes.some((mode) => !mode.channels.length)) failures.push(`${file}: empty mode`)
        if (ids.has(profile.id)) failures.push(`${file}: duplicate id ${profile.id}`)
        ids.add(profile.id)
      } catch (error) { failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`) }
    }
    expect(failures).toEqual([])
  })

  it('includes the fixtures authored from their DMX charts (Piece 2 + EP4)', () => {
    const manufacturers = JSON.parse(readFileSync(join(fixturesDir, 'manufacturers.json'), 'utf8')) as Record<string, { name?: string }>
    const load = (file: string) => {
      const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
      const manufacturerKey = typeof raw.manufacturerKey === 'string' ? raw.manufacturerKey : basename(dirname(join(fixturesDir, file)))
      const fixtureKey = typeof raw.fixtureKey === 'string' ? raw.fixtureKey : basename(file, '.json')
      return importOflFixture(raw, { manufacturerKey, manufacturer: manufacturers[manufacturerKey]?.name, fixtureKey, preserveSource: false })
    }
    // Chauvet Rogue R3 Spot — User Manual Rev. 8, DMX Values pp.11–14.
    const r3 = load('chauvet-professional/rogue-r3-spot.json')
    expect(r3).toMatchObject({ id: 'ofl:chauvet-professional:rogue-r3-spot', name: 'Rogue R3 Spot', manufacturer: 'Chauvet Professional' })
    expect(r3.modes.map((mode) => [mode.name, mode.channels.length])).toEqual([['19-channel', 19], ['25-channel', 25]])
    expect(r3.modes[1].channels.find((channel) => channel.attribute === 'intensity')?.defaultValue).toBe(0)
    // Chauvet FXarray Q5 — User Manual Rev. 1, DMX pp.7–9 (see NOTES.md
    // for the UM/QRG discrepancies left open).
    const q5 = load('chauvet-dj/fxarray-q5.json')
    expect(q5).toMatchObject({ id: 'ofl:chauvet-dj:fxarray-q5', name: 'FXarray Q5', manufacturer: 'Chauvet DJ' })
    expect(q5.modes.map((mode) => [mode.name, mode.channels.length])).toEqual([['30-channel', 30], ['10-channel', 10], ['3-channel', 3]])
    // Chauvet 4BAR (original) — QRG Rev. 4, DMX Values; 15CH + 3-CH
    // confirmed against LightKey.
    const bar = load('chauvet-dj/4bar.json')
    expect(bar).toMatchObject({ id: 'ofl:chauvet-dj:4bar', name: '4BAR', manufacturer: 'Chauvet DJ' })
    expect(bar.modes.map((mode) => [mode.name, mode.channels.length])).toEqual([['15-channel', 15], ['3-channel', 3]])
    expect(bar.modes[1].channels.map((channel) => channel.attribute)).toEqual(['red', 'green', 'blue'])
    // Volux Spectra 300 — User Manual v2.0, DMX pp.14–17; the manual's
    // Ch.14/Ch.20 misprints are corrected (see NOTES.md).
    const spectra = load('volux/spectra-300.json')
    expect(spectra).toMatchObject({ id: 'ofl:volux:spectra-300', name: 'Spectra 300', manufacturer: 'Volux' })
    expect(spectra.modes.map((mode) => [mode.name, mode.channels.length])).toEqual([['STANDARD MODE', 25]])
    expect(spectra.modes[0].channels.find((channel) => channel.attribute === 'pan')?.defaultValue).toBe(128)
    // Event Lighting EP4 (4x1x30 LED bar) — 17-channel mode chart from
    // Jake's manual screenshots, 19 Nov 2026 (see NOTES.md). The four
    // LEDs must derive as four beams so the linked colour wheel drives
    // them together, and the master dimmer must be the intensity channel
    // so the Dimmer fader dims all four LEDs in hardware.
    const ep4 = load('event-lighting/ep4.json')
    expect(ep4).toMatchObject({ id: 'ofl:event-lighting:ep4', name: 'EP4', manufacturer: 'Event Lighting' })
    expect(ep4.modes.map((mode) => [mode.name, mode.channels.length])).toEqual([['17-channel', 17]])
    expect(ep4.modes[0].channels.map((channel) => channel.attribute)).toEqual([
      'red', 'green', 'blue', 'red 2', 'green 2', 'blue 2', 'red 3', 'green 3', 'blue 3',
      'red 4', 'green 4', 'blue 4', 'intensity', 'Strobe', 'Programs', 'Program Speed', 'Curve Select'
    ])
    expect(ep4.modes[0].channels.find((channel) => channel.attribute === 'intensity')?.defaultValue).toBe(0)
    expect(ep4.modes[0].channels.find((channel) => channel.attribute === 'blue')?.defaultValue).toBe(255)
    expect(ep4.modes[0].channels.find((channel) => channel.attribute === 'red')?.defaultValue).toBe(0)
    expect(ep4.modes[0].beams?.map((beam) => [beam.id, beam.name, beam.properties])).toEqual([
      ['cell-1', 'Cell 1', { red: 'red', green: 'green', blue: 'blue' }],
      ['cell-2', 'Cell 2', { red: 'red 2', green: 'green 2', blue: 'blue 2' }],
      ['cell-3', 'Cell 3', { red: 'red 3', green: 'green 3', blue: 'blue 3' }],
      ['cell-4', 'Cell 4', { red: 'red 4', green: 'green 4', blue: 'blue 4' }]
    ])
    expect(ep4.modes[0].channels.find((channel) => channel.attribute === 'Programs')?.slots?.length).toBe(18)
  })
})
