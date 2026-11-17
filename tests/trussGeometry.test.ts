import { describe, expect, it } from 'vitest'
import { moveTruss, resizeTruss, rotateTruss, snapFixtureToTruss, snapTrussEndpoints } from '../src/renderer/src/lib/trussGeometry'
import type { PreviewTruss } from '../src/shared/types'
const truss: PreviewTruss = { id: 'u', name: 'U', shape: 'u', x: 400, y: 100, width: 200, height: 100, rotation: 0 }
describe('preview truss interaction', () => {
  it('rotates around the centre and handles the angle boundary', () => {
    expect(rotateTruss(truss, { x: 400, y: 50 }, { x: 450, y: 100 }).rotation).toBe(90)
    expect(rotateTruss({ ...truss, rotation: 45 }, { x: 350, y: 99 }, { x: 350, y: 101 }).rotation).toBe(45)
    expect(rotateTruss({ ...truss, rotation: 30 }, { x: 350, y: 99 }, { x: 350, y: 101 }).rotation).toBe(28)
  })
  it('snaps the closest endpoints of rotated sections and leaves distant sections alone', () => {
    const fixed: PreviewTruss = { ...truss, id: 'fixed', shape: 'straight', x: 100, y: 100, width: 100 }
    const moving: PreviewTruss = { ...fixed, id: 'moving', x: 153, y: 153, rotation: 90 }
    const snapped = snapTrussEndpoints(moving, [fixed, moving])
    expect(snapped.x).toBeCloseTo(150)
    expect(snapped.y).toBeCloseTo(150)
    expect(snapTrussEndpoints({ ...moving, x: 300 }, [fixed]).x).toBe(300)
  })
  it('moves and resizes in local coordinates', () => {
    expect(moveTruss(truss, { x: 0, y: 0 }, { x: 20, y: 30 })).toMatchObject({ x: 420, y: 130 })
    expect(resizeTruss({ ...truss, rotation: 90 }, { x: 0, y: 0 }, { x: 0, y: 20 }).width).toBe(240)
  })
  it('snaps to U segments, including rotated trusses, and leaves distant fixtures alone', () => {
    expect(snapFixtureToTruss({ x: 350, y: 55 }, [truss])).toEqual({ x: 350, y: 50 })
    expect(snapFixtureToTruss({ x: 303, y: 110 }, [truss])).toEqual({ x: 300, y: 110 })
    expect(snapFixtureToTruss({ x: 400, y: 100 }, [truss])).toEqual({ x: 400, y: 100 })
    expect(snapFixtureToTruss({ x: 445, y: 100 }, [{ ...truss, rotation: 90 }])).toEqual({ x: 450, y: 100 })
  })
})
