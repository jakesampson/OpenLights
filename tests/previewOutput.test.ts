import { describe, expect, it } from 'vitest'
import { previewFixtureValues, previewBeamAppearance, previewBeamVector, previewCellBeams, cellBeamGeometry, CELL_BEAM_FULL_LENGTH, SINGLE_BEAM_FULL_LENGTH } from '../src/renderer/src/lib/previewOutput'
import { degreesToChannel } from '../src/renderer/src/lib/calibration'
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
 expect(previewBeamAppearance(fixture, { x: 100, y: 100 }, '#ffffff')).toEqual({ direction: 45, lengthFactor: 1, color: '#ffffff' })
 expect(previewFixtureValues(fixture, [128])).toEqual({ intensity: 128 })
 expect(previewBeamAppearance({ ...fixture, previewBeam: { direction: 'auto' } }, { x: 100, y: 250 }, '#123456')).toEqual({ direction: 180, lengthFactor: 1, color: '#123456' })
})

describe('beam direction from live pan/tilt (Guide p.91)', () => {
  // Built-in moving head: intensity 0, pan 1, tilt 2; 540°/270° defaults.
  const head = (calibration?: FixtureDef['calibration']): FixtureDef => ({ id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 1, channels: 8, previewBeam: { direction: 90 }, ...(calibration ? { calibration } : {}) })
  const values = (panDeg: number, tiltDeg: number) => ({ pan: degreesToChannel(540, panDeg), tilt: degreesToChannel(270, tiltDeg) })

  it('points in the home direction at full length at the home position', () => {
    // Home = pan centre, tilt 90°; home direction 90° (left, in the
    // clockwise-from-down convention the stored direction uses).
    // (Channel rounding moves the angles ~0.5°, hence the 5° tolerance.)
    const v = previewBeamVector(head({ perspective: 'down' }), values(0, 90), { x: 100, y: 100 })
    expect(v.direction).toBeCloseTo(90, -1)
    expect(v.lengthFactor).toBeCloseTo(1, 2)
  })

  it('turns the same way as the Rotation dial arrow as pan increases (Guide p.59)', () => {
    // Jake, 26 Nov 2026: the Preview beam rotated opposite to the dial
    // arrow, and reversing flipped both, so they stayed opposite. The
    // dial arrow at pan angle θ points at polar(180° − θ), i.e. screen
    // vector (sin θ, cos θ); the beam must point the same way on
    // screen. The beam direction is clockwise from down, so its screen
    // vector is (−sin d, cos d) — the two agree when d = −θ.
    const atPan = (panDeg: number) => previewBeamVector(
      { id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 1, channels: 8, previewBeam: { direction: 0 }, calibration: { perspective: 'down' } },
      values(panDeg, 90), { x: 100, y: 100 })
    for (const pan of [-120, -90, -45, 0, 45, 90, 120]) {
      const d = atPan(pan).direction
      const beam = { x: -Math.sin((d * Math.PI) / 180), y: Math.cos((d * Math.PI) / 180) }
      const arrow = { x: Math.sin((pan * Math.PI) / 180), y: Math.cos((pan * Math.PI) / 180) }
      expect(Math.hypot(beam.x - arrow.x, beam.y - arrow.y)).toBeLessThan(0.05)
    }
  })

  it('points in the perspective direction at the centre of the tilt range', () => {
    const down = previewBeamVector(head({ perspective: 'down' }), values(0, 0), { x: 100, y: 100 })
    expect(down.direction).toBeCloseTo(0, -1)
    expect(down.lengthFactor).toBeCloseTo(1, 2)
    const up = previewBeamVector(head({ perspective: 'up' }), values(0, 0), { x: 100, y: 100 })
    expect(up.direction).toBeCloseTo(180, -1)
    expect(up.lengthFactor).toBeCloseTo(1, 2)
  })

  it('gives the same beam for the two pan/tilt combinations the guide says are one direction', () => {
    // Guide p.91: pan −60°, tilt +45° and pan +120°, tilt −45° point
    // the beam in the same direction.
    const a = previewBeamVector(head({ perspective: 'down' }), values(-60, 45), { x: 100, y: 100 })
    const b = previewBeamVector(head({ perspective: 'down' }), values(120, -45), { x: 100, y: 100 })
    expect(a.direction).toBeCloseTo(b.direction, 5)
    expect(a.lengthFactor).toBeCloseTo(b.lengthFactor, 5)
  })

  it('is a dot for a parallel fixture at the centre of the tilt range', () => {
    const v = previewBeamVector(head({ perspective: 'parallel' }), values(0, 0), { x: 100, y: 100 })
    expect(v.lengthFactor).toBeLessThan(0.05)
  })

  it('swings the beam sideways with pan when tilt is off-centre', () => {
    // Jake, 25 Nov 2026: the beam "just seems to go up and down, no side
    // to side action". A calibrated head (home up, perspective down) at
    // tilt 45° must move sideways with pan, not just change length.
    const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
    const sideways = (panDeg: number) => previewBeamVector(
      { id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 1, channels: 8, previewBeam: { direction: 180 }, calibration: { perspective: 'down' } },
      values(panDeg, 45), { x: 100, y: 300 })
    expect(angleDiff(sideways(90).direction, 45)).toBeLessThan(5)
    expect(angleDiff(sideways(-90).direction, 315)).toBeLessThan(5)
    expect(sideways(90).lengthFactor).toBeGreaterThan(0.5)
    expect(sideways(-90).lengthFactor).toBeGreaterThan(0.5)
  })

  it('keeps the beam on the perspective direction at the exact centre of the tilt range', () => {
    // At tilt centre the beam points along the pan axis, so pan has no
    // visible effect at that one instant — the same as LightKey's
    // position-control circle, where the centre point is pan-independent
    // (Guide p.91). A movement effect passes through it and keeps moving.
    const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
    const atCentre = (panDeg: number) => previewBeamVector(
      { id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 1, channels: 8, previewBeam: { direction: 180 }, calibration: { perspective: 'down' } },
      values(panDeg, 0), { x: 100, y: 300 })
    expect(angleDiff(atCentre(90).direction, 0)).toBeLessThan(5)
    expect(angleDiff(atCentre(-120).direction, 0)).toBeLessThan(5)
    expect(atCentre(90).lengthFactor).toBeCloseTo(1, 2)
  })

  it('points an explicit down perspective down even when the fixture sits low on the canvas', () => {
    // The canvas-position heuristic (low on the canvas aims up) applies
    // only when no perspective was picked; an explicit 'down' wins.
    const v = previewBeamVector(head({ perspective: 'down' }), values(0, 0), { x: 100, y: 300 })
    expect(v.direction).toBeCloseTo(0, -1)
    expect(v.lengthFactor).toBeCloseTo(1, 2)
  })

  it('traces a figure eight: the two lobes point to opposite sides', () => {
    // Figure Eight path points (normalised −1..1): pan = sin(a)·0.8,
    // tilt = sin(2a)·0.8, mapped onto the 540°/270° ranges.
    // Directions wrap at 0°/360°, so compare by circular distance.
    // (Jake, 26 Nov 2026: the beam was mirrored — the lobes were on
    // the wrong sides. The values below are the un-mirrored ones: the
    // phase-45 lobe points down-right, the phase-135 lobe up-left.)
    const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
    const at = (phaseDeg: number) => {
      const a = (phaseDeg * Math.PI) / 180
      return previewBeamVector(head({ perspective: 'down' }), values(Math.sin(a) * 0.8 * 270, Math.sin(a * 2) * 0.8 * 135), { x: 100, y: 100 })
    }
    expect(angleDiff(at(0).direction, 0)).toBeLessThan(5) // crossing at the bottom
    expect(angleDiff(at(45).direction, 277)).toBeLessThan(5) // down-right
    expect(angleDiff(at(90).direction, 0)).toBeLessThan(5) // crossing again
    expect(angleDiff(at(135).direction, 130)).toBeLessThan(5) // up-left
    expect(at(45).lengthFactor).toBeGreaterThan(0.5)
    expect(at(135).lengthFactor).toBeGreaterThan(0.5)
  })

  it('keeps the stored home direction at full length for a fixture with no pan/tilt', () => {
    const v = previewBeamVector(head(), {}, { x: 100, y: 100 })
    expect(v).toEqual({ direction: 90, lengthFactor: 1 })
  })
})
