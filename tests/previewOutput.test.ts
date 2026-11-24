import { describe, expect, it } from 'vitest'
import { previewFixtureValues, previewBeamAppearance, previewCellBeams, cellBeamGeometry, CELL_BEAM_FULL_LENGTH, SINGLE_BEAM_FULL_LENGTH } from '../src/renderer/src/lib/previewOutput'
import type { FixtureDef } from '../src/shared/types'

// EP4 / pixel-bar: 4 cells, RGB per cell (offsets 0-11) + master dimmer (12).
const barFixture: FixtureDef = { id: 'bar', name: 'Bar', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }
const barValues = { intensity: 255, red: 255, green: 0, blue: 0, red2: 0, green2: 255, blue2: 0, red3: 0, green3: 0, blue3: 255, red4: 255, green4: 255, blue4: 0 }

describe('per-cell preview beams', () => {
  it('gives one beam per cell, each with its own colour at full brightness', () => {
    expect(previewCellBeams(barFixture, barValues, { color: '#ffffff', opacity: 1 })).toEqual([
      { id: 'cell-1', name: 'Cell 1', color: '#ff0000', opacity: 1 },
      { id: 'cell-2', name: 'Cell 2', color: '#00ff00', opacity: 1 },
      { id: 'cell-3', name: 'Cell 3', color: '#0000ff', opacity: 1 },
      { id: 'cell-4', name: 'Cell 4', color: '#ffff00', opacity: 1 }
    ])
  })

  it('scales a cell colour and brightness with the master dimmer', () => {
    const cells = previewCellBeams(barFixture, { ...barValues, intensity: 128 }, { color: '#ffffff', opacity: 128 / 255 })
    expect(cells[0].color).toBe('#800000')
    expect(cells[0].opacity).toBeCloseTo(128 / 255, 5)
    expect(cells[1].color).toBe('#008000')
  })

  it('a lit cell keeps the fixture dimmer through a colour change, not its own colour max', () => {
    // Midway through a red→blue crossfade on one cell: the cell's
    // channels read (128, 0, 128) — the old max-of-colour derivation
    // halved the beam; the dimmer stays full.
    const cells = previewCellBeams(barFixture, { ...barValues, red: 128, green: 0, blue: 128, red2: 128, green2: 0, blue2: 128, red3: 128, green3: 0, blue3: 128, red4: 128, green4: 0, blue4: 128 }, { color: '#ffffff', opacity: 1 })
    expect(cells.every((cell) => cell.opacity === 1)).toBe(true)
    expect(cells[0].color).toBe('#800080')
  })

  it('draws no beam for a dark cell while the lit cells keep theirs', () => {
    const cells = previewCellBeams(barFixture, { ...barValues, red2: 0, green2: 0, blue2: 0 }, { color: '#ffffff', opacity: 1 })
    expect(cells).toHaveLength(4)
    expect(cells[1]).toEqual({ id: 'cell-2', name: 'Cell 2', color: '#000000', opacity: 0 })
    expect(cells[0].opacity).toBe(1)
    expect(cells[2].opacity).toBe(1)
  })

  it('falls back to the fixture colour and brightness where a cell carries no data', () => {
    const cells = previewCellBeams(barFixture, {}, { color: '#123456', opacity: 0.5 })
    expect(cells).toHaveLength(4)
    expect(cells.every((cell) => cell.color === '#123456' && cell.opacity === 0.5)).toBe(true)
  })

  it('returns no cells for a single-pod fixture', () => {
    const fixture: FixtureDef = { id: 'w', name: 'Wash', type: 'led-wash', channelStart: 1, channels: 7 }
    expect(previewCellBeams(fixture, { intensity: 255, red: 255 }, { color: '#ff0000', opacity: 1 })).toEqual([])
  })
})

describe('cell beam geometry', () => {
  it('is much shorter than the single beam at full brightness, with the same cone angle', () => {
    expect(CELL_BEAM_FULL_LENGTH).toBeLessThan(SINGLE_BEAM_FULL_LENGTH)
    const full = cellBeamGeometry(1)
    expect(full.length).toBe(CELL_BEAM_FULL_LENGTH)
    expect(full.nearHalf).toBe(3)
    expect(full.farHalf).toBeCloseTo(3 + 27 * (CELL_BEAM_FULL_LENGTH / SINGLE_BEAM_FULL_LENGTH), 5)
  })

  it('scales length and far width with brightness, and vanishes at zero', () => {
    expect(cellBeamGeometry(0.5).length).toBeCloseTo(CELL_BEAM_FULL_LENGTH / 2, 5)
    expect(cellBeamGeometry(0.5).farHalf).toBeCloseTo(3 + 27 * (CELL_BEAM_FULL_LENGTH / 2 / SINGLE_BEAM_FULL_LENGTH), 5)
    expect(cellBeamGeometry(0)).toEqual({ length: 0, nearHalf: 3, farHalf: 3 })
  })
})

describe('live preview output', () => {
  it('reads actual channel values rather than the target cue', () => {
    const fixture: FixtureDef = { id: 'f', name: 'LED', type: 'generic-led', channelStart: 2, channels: 4 }
    expect(previewFixtureValues(fixture, [0, 100, 200, 30, 10], { intensity: 255, red: 255 })).toEqual({ intensity: 100, red: 200, green: 30, blue: 10 })
  })
  it('keeps a dimmer preview colour while using live output for its brightness', () => {
    const fixture: FixtureDef = { id: 'd', name: 'Dimmer', type: 'dimmer', channelStart: 1, channels: 1 }
    expect(previewFixtureValues(fixture, [0], { intensity: 255, red: 255, green: 50, blue: 0 })).toEqual({ intensity: 0, red: 255, green: 50, blue: 0 })
  })
})

it('uses the stored beam direction and the fixture live colour, without changing the decoded DMX output', () => {
 const fixture: FixtureDef = { id: 'd', name: 'Dimmer', type: 'dimmer', channels: 1, channelStart: 1, previewBeam: { direction: 45 } }
 expect(previewBeamAppearance(fixture, { x: 100, y: 100 }, '#ffffff')).toEqual({ direction: 45, color: '#ffffff' })
 expect(previewFixtureValues(fixture, [128])).toEqual({ intensity: 128 })
 expect(previewBeamAppearance({ ...fixture, previewBeam: { direction: 'auto' } }, { x: 100, y: 250 }, '#123456')).toEqual({ direction: 180, color: '#123456' })
})
