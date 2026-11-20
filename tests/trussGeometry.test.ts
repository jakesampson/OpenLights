import { describe, expect, it } from 'vitest'
import { moveTruss, resizeTruss, rotateTruss, snapFixtureToTruss, snapTrussEndpoints, sweepTruss, trussArcAngles, trussArcPath, trussArcPoint, trussArcSamples, trussEndpoints } from '../src/renderer/src/lib/trussGeometry'
import type { PreviewTruss } from '../src/shared/types'
const truss: PreviewTruss = { id: 'u', name: 'U', shape: 'u', x: 400, y: 100, width: 200, height: 100, rotation: 0 }
const curved: PreviewTruss = { id: 'c', name: 'Curved', shape: 'curved', x: 400, y: 170, width: 200, height: 200, rotation: 0, startAngle: -90, endAngle: 0 }
const circular: PreviewTruss = { id: 'o', name: 'Circular', shape: 'circular', x: 400, y: 170, width: 200, height: 200, rotation: 0 }
describe('preview truss interaction', () => {
  it('rotates around the centre and handles the angle boundary', () => {
    expect(rotateTruss(truss, { x: 400, y: 50 }, { x: 450, y: 100 }).rotation).toBe(90)
    // Snap is a modifier, not always-on (Guide p.56: hold Shift to
    // constrain the angle to 45°) — without it the rotation stays free.
    expect(rotateTruss({ ...truss, rotation: 45 }, { x: 350, y: 99 }, { x: 350, y: 101 }).rotation).toBe(43)
    expect(rotateTruss({ ...truss, rotation: 45 }, { x: 350, y: 99 }, { x: 350, y: 101 }, true).rotation).toBe(45)
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

describe('curved and circular trusses', () => {
  it('places arc points on the ellipse and defaults to a 90° arc', () => {
    expect(trussArcAngles(curved)).toEqual({ start: -90, end: 0 })
    expect(trussArcAngles({ ...curved, startAngle: undefined, endAngle: undefined })).toEqual({ start: -90, end: 0 })
    expect(trussArcAngles(circular)).toEqual({ start: 0, end: 360 })
    expect(trussArcPoint(curved, -90)).toEqual({ x: 0, y: -100 })
    expect(trussArcPoint(curved, 0)).toEqual({ x: 100, y: 0 })
    const diagonal = trussArcPoint(curved, -45)
    expect(diagonal.x).toBeCloseTo(70.71, 2)
    expect(diagonal.y).toBeCloseTo(-70.71, 2)
    expect(trussArcSamples(curved).length).toBeGreaterThan(10)
    expect(trussArcSamples(curved)[0]).toEqual({ x: 0, y: -100 })
  })
  it('builds an SVG arc path with the right endpoints', () => {
    const path = trussArcPath(curved)
    expect(path).toMatch(/^M 0 -100 A 100 100 0 0 1 100 0$/)
    expect(trussArcPath(circular)).toContain('A 100 100 0 1 1')
  })
  it('scales a curved truss on both axes, and Shift constrains it to a circle segment', () => {
    const scaled = resizeTruss(curved, { x: 0, y: 0 }, { x: 20, y: 10 })
    expect(scaled.width).toBe(240)
    expect(scaled.height).toBe(220)
    const circled = resizeTruss(curved, { x: 0, y: 0 }, { x: 20, y: 10 }, true)
    expect(circled.width).toBe(240)
    expect(circled.height).toBe(240)
  })
  it('scales a circular truss uniformly and keeps it a circle', () => {
    const scaled = resizeTruss(circular, { x: 0, y: 0 }, { x: 20, y: 10 })
    expect(scaled.width).toBe(scaled.height)
    expect(scaled.width).toBeGreaterThan(200)
  })
  it('drags a green end handle along the radius to change the sweep', () => {
    // The end handle sits at (500, 170); dragging it down 90° of arc
    // (to the bottom of the circle) extends the sweep to 90° more.
    const swept = sweepTruss(curved, 'end', { x: 500, y: 170 }, { x: 400, y: 270 })
    expect(swept.endAngle).toBe(90)
    expect(swept.startAngle).toBe(-90)
    const startSwept = sweepTruss(curved, 'start', { x: 400, y: 70 }, { x: 300, y: 170 })
    expect(startSwept.startAngle).toBe(-180)
    // Shift constrains the sweep angle to 45°.
    const snapped = sweepTruss(curved, 'end', { x: 500, y: 170 }, { x: 470, y: 240 }, true)
    expect(snapped.endAngle! % 45).toBe(0)
    // The sweep never collapses below 5° or past 355°.
    const collapsed = sweepTruss(curved, 'end', { x: 500, y: 170 }, { x: 400, y: 70 })
    expect(collapsed.endAngle).toBe(-85)
  })
  it('joins curved truss endpoints and gives a circular truss no free endpoints', () => {
    expect(trussEndpoints(curved)).toEqual([{ x: 400, y: 70 }, { x: 500, y: 170 }])
    expect(trussEndpoints(circular)).toEqual([])
    const fixed: PreviewTruss = { ...curved, id: 'fixed', x: 100, y: 100 }
    const moving: PreviewTruss = { ...curved, id: 'moving', x: 195, y: 195 }
    const snapped = snapTrussEndpoints(moving, [fixed, moving])
    expect(snapped.x).toBeCloseTo(200)
    expect(snapped.y).toBeCloseTo(200)
  })
  it('snaps fixtures onto a curved arc and a circular truss', () => {
    // Just inside the arc (top of the circle, radius 100): snaps out to it.
    expect(snapFixtureToTruss({ x: 400, y: 80 }, [curved])).toEqual({ x: 400, y: 70 })
    // Just outside the arc's right end: snaps back onto it.
    expect(snapFixtureToTruss({ x: 508, y: 170 }, [curved])).toEqual({ x: 500, y: 170 })
    // A point on the circle's left side snaps onto the circular truss.
    expect(snapFixtureToTruss({ x: 308, y: 170 }, [circular])).toEqual({ x: 300, y: 170 })
    // A distant point is left alone.
    expect(snapFixtureToTruss({ x: 100, y: 100 }, [curved])).toEqual({ x: 100, y: 100 })
  })
})
