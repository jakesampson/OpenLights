import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flipPosition, positionDegrees, positionFractions, positionFromPoint, positionPoint, positionValues, splitPosition } from '../src/renderer/src/lib/position'
describe('fixture position mapping', () => {
  it('splits fine channels', () => {
    expect(splitPosition(1)).toEqual({ coarse: 255, fine: 255 })
    expect(positionValues(0.5, 0, ['pan', 'panFine', 'tilt'])).toEqual({ pan: 128, panFine: 0, tilt: 0 })
  })
})

describe('position circle (Guide ch.8, pp.90–91)', () => {
  it('maps home to the centre and pan around the circle, tilt as radius', () => {
    expect(positionPoint(0.5, 0.5)).toEqual({ x: 0.5, y: 0.5 })
    // Pan +90° (fraction 0.75) sits at the right rim at full tilt.
    const right = positionPoint(0.75, 1)
    expect(right.x).toBeCloseTo(1, 5)
    expect(right.y).toBeCloseTo(0.5, 5)
    // Pan −90° (fraction 0.25) sits at the left rim at full tilt.
    const left = positionPoint(0.25, 1)
    expect(left.x).toBeCloseTo(0, 5)
    expect(left.y).toBeCloseTo(0.5, 5)
    // Full negative tilt sits at the rim on the pan ray (the same point
    // as full positive tilt — the guide's circle shows both signs there).
    const top = positionPoint(0.5, 0)
    expect(top.x).toBeCloseTo(0.5, 5)
    expect(top.y).toBeCloseTo(0, 5)
    expect(positionPoint(0.5, 1)).toEqual(top)
  })

  it('round-trips a point to the same fractions, keeping the tilt sign', () => {
    for (const [pan, tilt] of [[0.6, 0.8], [0.3, 0.2], [0.9, 0.65], [0.1, 0.4]] as const) {
      const point = positionPoint(pan, tilt)
      const back = positionFromPoint(point.x, point.y, tilt >= 0.5 ? 1 : -1)
      expect(back.pan).toBeCloseTo(pan, 5)
      expect(back.tilt).toBeCloseTo(tilt, 5)
    }
    // Outside the disc clamps to the rim.
    expect(positionFromPoint(1, 0.5, 1)).toEqual({ pan: 0.75, tilt: 1 })
  })

  it('reads pan/tilt in degrees on the calibration ranges (±270° / ±135°)', () => {
    expect(positionDegrees(0.5, 0.5)).toEqual({ pan: 0, tilt: 0 })
    expect(positionDegrees(1, 1)).toEqual({ pan: 270, tilt: 135 })
    expect(positionDegrees(0, 0)).toEqual({ pan: -270, tilt: -135 })
  })

  it('flips one angle around home, a one-off change (Guide p.93)', () => {
    expect(flipPosition(0.75, 0.8, 'pan').pan).toBeCloseTo(0.25, 5)
    expect(flipPosition(0.75, 0.8, 'pan').tilt).toBeCloseTo(0.8, 5)
    expect(flipPosition(0.75, 0.8, 'tilt').pan).toBeCloseTo(0.75, 5)
    expect(flipPosition(0.75, 0.8, 'tilt').tilt).toBeCloseTo(0.2, 5)
  })

  it('has no invert/swap options anywhere — they were not LightKey behaviour', () => {
    const position = readFileSync(resolve(__dirname, '..', 'src/renderer/src/lib/position.ts'), 'utf8')
    expect(position).not.toContain('invertPan')
    expect(position).not.toContain('swapPanTilt')
    const types = readFileSync(resolve(__dirname, '..', 'src/shared/types.ts'), 'utf8')
    expect(types).not.toContain('positionOptions')
    const control = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/PositionControl.tsx'), 'utf8')
    expect(control).not.toContain('invertPan')
    expect(control).not.toContain('swapPanTilt')
    expect(control).toContain('Flip Pan')
    expect(control).toContain('Flip Tilt')
  })
})

describe('position axis locks (Guide ch.8, p.93)', () => {
  it('reads the current pan/tilt as fractions, centre when absent', () => {
    expect(positionFractions({}, ['pan', 'tilt'])).toEqual({ pan: 0.5, tilt: 0.5 })
    expect(positionFractions({ pan: 0, tilt: 255 }, ['pan', 'tilt'])).toEqual({ pan: 0, tilt: 1 })
    expect(positionFractions({ pan: 128 }, ['pan', 'tilt'])).toEqual({ pan: 128 / 255, tilt: 0.5 })
  })

  it('combines 16-bit coarse + fine so the lock holds the exact angle', () => {
    expect(positionFractions({ pan: 128, panFine: 0, tilt: 64, tiltFine: 128 }, ['pan', 'panFine', 'tilt', 'tiltFine'])).toEqual({
      pan: (128 * 256) / 65535,
      tilt: (64 * 256 + 128) / 65535
    })
    // A locked fraction round-trips through positionValues unchanged.
    const start = positionFractions({ pan: 200, panFine: 30, tilt: 10, tiltFine: 0 }, ['pan', 'panFine', 'tilt', 'tiltFine'])
    expect(positionValues(start.pan, start.tilt, ['pan', 'panFine', 'tilt', 'tiltFine'])).toEqual({ pan: 200, panFine: 30, tilt: 10, tiltFine: 0 })
  })

  it('wires Ctrl to lock pan and Shift to lock tilt in the control', () => {
    const control = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/PositionControl.tsx'), 'utf8')
    expect(control).toContain('event.ctrlKey ? start.pan : point.pan')
    expect(control).toContain('event.shiftKey ? start.tilt : point.tilt')
    // The locked values are captured at drag start, not read live.
    expect(control).toContain('dragStartRef.current = now')
    expect(control).toContain('Hold Ctrl to lock pan, Shift to lock tilt.')
    const design = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
    // The control's current position comes from positionNow, which
    // reads the same precedence as every other Design control (preset,
    // then override, then cue) — not the cue values alone, or a drag
    // would leave the dot frozen (26 Nov 2026 probe).
    expect(design).toContain('positionFractions(')
    expect(design).toContain("const positionAttr = (attribute: 'pan' | 'tilt')")
    expect(design).toContain('manualOverrides[fixtureId]?.[attribute]')
  })
})
