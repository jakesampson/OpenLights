import { describe, expect, it } from 'vitest'
import { movementPoint } from '../src/renderer/src/lib/movementEffects'

describe('movement effects', () => {
  it('generates circle, figure-eight and line positions at fixed times', () => {
    expect(movementPoint('circle', 0)).toEqual({ pan: 1, tilt: 0 })
    expect(movementPoint('circle', 0.25).pan).toBeCloseTo(0)
    expect(movementPoint('circle', 0.25).tilt).toBeCloseTo(1)
    expect(movementPoint('figure-eight', 0.25)).toEqual(expect.objectContaining({ pan: 1 }))
    expect(movementPoint('figure-eight', 0.25).tilt).toBeCloseTo(0)
    expect(movementPoint('line', 0.75)).toEqual({ pan: 0.5, tilt: 0 })
  })

  it('interpolates edited paths and applies scale, rotation and offset', () => {
    const path = [{ pan: 0, tilt: 0 }, { pan: 1, tilt: 0 }, { pan: 1, tilt: 1 }, { pan: 0, tilt: 1 }]
    expect(movementPoint(path, 0.125)).toEqual({ pan: 0.5, tilt: 0 })
    const transformed = movementPoint('line', 0.75, { scaleX: 2, rotation: 90, pan: 0.1, tilt: -0.2 })
    expect(transformed.pan).toBeCloseTo(0.1)
    expect(transformed.tilt).toBeCloseTo(0.8)
  })
})
