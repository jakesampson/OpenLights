import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { positionFractions, positionValues, splitPosition, transformPosition } from '../src/renderer/src/lib/position'
describe('fixture position mapping', () => {
  it('splits fine channels and applies inversion and swapping', () => {
    expect(splitPosition(1)).toEqual({ coarse: 255, fine: 255 })
    expect(positionValues(0.5, 0, ['pan', 'panFine', 'tilt'])).toEqual({ pan: 128, panFine: 0, tilt: 0 })
    expect(transformPosition({ pan: 0, panFine: 0 }, { invertPan: true })).toEqual({ pan: 255, panFine: 255 })
    expect(transformPosition({ pan: 20 }, { swapPanTilt: true })).toEqual({ tilt: 20 })
    expect(transformPosition({ pan: 20, tilt: 90 }, { swapPanTilt: true })).toEqual({ tilt: 20, pan: 90 })
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

  it('wires Ctrl to lock pan and Shift to lock tilt in the pad', () => {
    const control = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/PositionControl.tsx'), 'utf8')
    expect(control).toContain('event.ctrlKey && start ? start.pan : rawX')
    expect(control).toContain('event.shiftKey && start ? start.tilt : rawY')
    // The locked values are captured at drag start, not read live.
    expect(control).toContain('dragStartRef.current = current ?? { pan: 0.5, tilt: 0.5 }')
    expect(control).toContain('Hold Ctrl to lock pan, Shift to lock tilt.')
    const design = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/DesignTab.tsx'), 'utf8')
    expect(design).toContain('positionFractions(cueValues[selectedFixtures[0].id]')
  })
})
