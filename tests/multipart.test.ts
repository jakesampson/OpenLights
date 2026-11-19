import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importOflFixture } from '../src/shared/oflFixtureFormat'
import { fixtureBeams } from '../src/shared/fixtureProfiles'
import { computeEffectPatch } from '../src/renderer/src/lib/effects'
import { evaluateFan, fanTargetColors, orderedFanTargets } from '../src/renderer/src/lib/fanning'
import { fanBeamTargets, fanRows } from '../src/renderer/src/lib/fanningHud'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import type { EffectDef, FanDef, FixtureDef } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url))

function loadOfl(file: string) {
  const manufacturers = JSON.parse(readFileSync(join(fixturesDir, 'manufacturers.json'), 'utf8')) as Record<string, { name?: string }>
  const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const manufacturerKey = typeof raw.manufacturerKey === 'string' ? raw.manufacturerKey : basename(dirname(join(fixturesDir, file)))
  const fixtureKey = typeof raw.fixtureKey === 'string' ? raw.fixtureKey : basename(file, '.json')
  return importOflFixture(raw, { manufacturerKey, manufacturer: manufacturers[manufacturerKey]?.name, fixtureKey, preserveSource: false })
}

const bar4 = loadOfl('chauvet-dj/4bar.json')
const q5 = loadOfl('chauvet-dj/fxarray-q5.json')
const r3 = loadOfl('chauvet-professional/rogue-r3-spot.json')

function barFixture(id = 'bar4', channelStart = 1): FixtureDef {
  return { id, name: '4Bar', type: 'led-wash', channelStart, channels: 15, profile: bar4, modeId: bar4.modes[0].id }
}

function effect(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    id: 'e1', name: 'Fire', fixtureIds: ['bar4'], attribute: 'red', waveform: 'sine',
    speed: 1, syncToBpm: false, size: 127, offset: 128, phaseSpread: 360, enabled: true,
    ...overrides
  }
}

function beamFan(overrides: Partial<FanDef> = {}): FanDef {
  return {
    id: 'fan1', attribute: 'red', fixtureIds: ['bar4'], mode: 'linear', order: 'selection',
    start: 0, end: 255,
    beams: fanBeamTargets([barFixture()], ['bar4']),
    ...overrides
  }
}

describe('OFL beam derivation (Piece 7)', () => {
  it('derives one beam per pod from the 4Bar 15-channel mode', () => {
    const mode = bar4.modes[0]
    expect(mode.name).toBe('15-channel')
    expect(mode.beams).toEqual([
      { id: 'cell-1', name: 'Cell 1', properties: { red: 'red', green: 'green', blue: 'blue' } },
      { id: 'cell-2', name: 'Cell 2', properties: { red: 'red 2', green: 'green 2', blue: 'blue 2' } },
      { id: 'cell-3', name: 'Cell 3', properties: { red: 'red 3', green: 'green 3', blue: 'blue 3' } },
      { id: 'cell-4', name: 'Cell 4', properties: { red: 'red 4', green: 'green 4', blue: 'blue 4' } }
    ])
    expect(fixtureBeams(barFixture())).toHaveLength(4)
  })

  it('derives five UV beams from the FXarray Q5 30-channel mode', () => {
    const mode = q5.modes[0]
    expect(mode.name).toBe('30-channel')
    expect(mode.beams).toHaveLength(5)
    expect(mode.beams![4]).toEqual({ id: 'cell-5', name: 'Cell 5', properties: { red: 'red 5', green: 'green 5', blue: 'blue 5', uv: 'uv 5' } })
  })

  it('derives no beams for single-pod modes', () => {
    expect(bar4.modes[1].beams).toBeUndefined() // 4Bar 3-channel: one RGB wash
    expect(q5.modes[1].beams).toBeUndefined() // Q5 10-channel: one Quad LED group
    expect(r3.modes[0].beams).toBeUndefined() // Rogue R3 Spot: no repeating colour pods
  })
})

describe('effects across cells (Piece 7)', () => {
  it('chases a red effect across the four cells with phase spread', () => {
    // 4Bar 15ch: Red 1..4 sit on DMX 4, 7, 10, 13. Sine at t=0 with a
    // full 360° spread phases the cells 0°, 120°, 240°, 360°.
    const patch = computeEffectPatch([barFixture()], [effect()], 0, 120)
    expect(patch[4]).toBeCloseTo(128)
    expect(patch[7]).toBeCloseTo(238)
    expect(patch[10]).toBeCloseTo(18)
    expect(patch[13]).toBeCloseTo(128)
  })

  it('runs every cell in unison with no phase spread', () => {
    const patch = computeEffectPatch([barFixture()], [effect({ phaseSpread: 0 })], 0, 120)
    expect(patch[4]).toBeCloseTo(128)
    expect(patch[7]).toBeCloseTo(128)
    expect(patch[10]).toBeCloseTo(128)
    expect(patch[13]).toBeCloseTo(128)
  })

  it('keeps a global attribute (dimmer) as one target for the whole fixture', () => {
    const patch = computeEffectPatch([barFixture()], [effect({ attribute: 'intensity' })], 0, 120)
    // Only the master dimmer (DMX 2) is written — not once per cell.
    expect(Object.keys(patch).map(Number)).toEqual([2])
    expect(patch[2]).toBeCloseTo(128)
  })
})

describe('fanning across beams (Piece 7)', () => {
  it('orders the beams as fan targets and lists them for the HUD', () => {
    const targets = orderedFanTargets([barFixture()], beamFan())
    expect(targets.map((t) => t.beam?.id)).toEqual(['cell-1', 'cell-2', 'cell-3', 'cell-4'])
    expect(targets.every((t) => t.fixture.id === 'bar4')).toBe(true)
    expect(fanBeamTargets([barFixture()], ['bar4'])).toEqual([
      { fixtureId: 'bar4', beamId: 'cell-1' }, { fixtureId: 'bar4', beamId: 'cell-2' },
      { fixtureId: 'bar4', beamId: 'cell-3' }, { fixtureId: 'bar4', beamId: 'cell-4' }
    ])
  })

  it('fans red across the four cells, writing each cell\'s own channel', () => {
    expect(evaluateFan([barFixture()], beamFan())).toEqual({
      bar4: { red: 0, 'red 2': 85, 'red 3': 170, 'red 4': 255 }
    })
  })

  it('fans colour across the four cells, writing each cell\'s RGB', () => {
    expect(evaluateFan([barFixture()], beamFan({ attribute: 'color', startColor: '#ff0000', endColor: '#0000ff' }))).toEqual({
      bar4: {
        red: 255, green: 0, blue: 0,
        'red 2': 170, 'green 2': 0, 'blue 2': 85,
        'red 3': 85, 'green 3': 0, 'blue 3': 170,
        'red 4': 0, 'green 4': 0, 'blue 4': 255
      }
    })
    expect(fanTargetColors([barFixture()], beamFan({ attribute: 'color', startColor: '#ff0000', endColor: '#0000ff' }))).toEqual(['#ff0000', '#aa0055', '#5500aa', '#0000ff'])
  })

  it('gives the HUD one row per beam with its own value and defined endpoints', () => {
    const rows = fanRows([barFixture()], beamFan())
    expect(rows.map((r) => r.beam?.name)).toEqual(['Cell 1', 'Cell 2', 'Cell 3', 'Cell 4'])
    expect(rows.map((r) => r.value)).toEqual([0, 85, 170, 255])
    expect(rows.map((r) => r.defined)).toEqual([true, false, false, true])
  })

  it('skips beams that do not exist and still fans across fixtures without beams', () => {
    const fan = beamFan({ beams: [{ fixtureId: 'bar4', beamId: 'cell-2' }, { fixtureId: 'bar4', beamId: 'cell-9' }, { fixtureId: 'bar4', beamId: 'cell-4' }] })
    expect(orderedFanTargets([barFixture()], fan).map((t) => t.beam?.id)).toEqual(['cell-2', 'cell-4'])
    // A fan with no beams set fans across fixtures exactly as before.
    expect(evaluateFan([barFixture()], beamFan({ beams: undefined }))).toEqual({ bar4: { red: 0 } })
  })
})

describe('per-cell values in cues (Piece 7)', () => {
  it('programs only the selected cell of an OFL fixture, through the cue', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [barFixture()], cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { bar4: { intensity: 255 } } }] }))
    state().activateCue('s')
    state().selectFixtureBeam('bar4', 'cell-2')
    state().updateSelectedBeamValues({ red: 200, green: 100, blue: 50 })
    expect(state().cues[0].fixtureValues.bar4).toEqual({ intensity: 255, 'red 2': 200, 'green 2': 100, 'blue 2': 50 })
    const output = computeCueChannels(state().show!.fixtures, state().cues[0])
    expect(output[2]).toBe(255) // master dimmer, untouched
    expect(output[4]).toBeUndefined() // cell 1 red, untouched (sparse output)
    expect(output[7]).toBe(200) // cell 2 red
    expect(output[8]).toBe(100) // cell 2 green
    expect(output[9]).toBe(50) // cell 2 blue
    expect(output[10]).toBeUndefined() // cell 3 red, untouched
  })
})
