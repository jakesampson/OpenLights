// LightKey's Position HUD (Guide ch.10, pp.167-169) and the uniform
// movement-path tiles (Jake's "Effects Showcase" screenshots, 26 Nov
// 2026): the polar pan/tilt mapping, the add-point-on-line rule, the
// Command-drag negative-tilt rule, and the chart overlay portalled into
// the Preview while a movement effect is being edited.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { EffectEditor } from '../src/renderer/src/components/EffectEditor'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import {
  chartOffsetToNormalized,
  cmdDragTiltSign,
  formatPanTiltDegrees,
  nearestSegmentMidpoint,
  normalizedToChartOffset,
  samplePathPoints
} from '../src/renderer/src/lib/movementChart'
import { pathPointAt } from '../src/renderer/src/lib/movementRuntime'
import type { EffectDef, MovementPathDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECT = { left: 0, top: 0, width: 150, height: 150, right: 150, bottom: 150, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

let container: HTMLDivElement | undefined
let rootNode: Root | undefined
let chartHost: HTMLDivElement | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(node) })
  return el
}

function setShow() {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    effectTemplates: [],
    movementPaths: [],
    fixtures: [{ id: 'fx1', name: 'Test Wash', type: 'led-wash', channelStart: 1, channels: 7 }],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity: 255, red: 255, green: 0, blue: 0 } }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({
      show,
      cues: show.cues,
      presets: [],
      effects: [],
      selectedFixtureIds: ['fx1'],
      activeCueId: 'c1',
      editingPresetId: null,
      editingCueAdHocId: null,
      manualOverrides: {},
      showOverrideLabels: false,
      editingEffectId: null,
      editingEffectTemplateId: null,
      editingLiveEffectId: null,
      effectChooserAttribute: null
    })
  })
}

function movementEffect(patch: Partial<EffectDef> = {}): EffectDef {
  return {
    id: 'e-move',
    name: 'Position Effect',
    fixtureIds: ['fx1'],
    attribute: 'position',
    speed: 1,
    syncToBpm: false,
    size: 255,
    offset: 128,
    phaseSpread: 0,
    enabled: true,
    kind: 'movement',
    movementPathId: 'builtin-circle',
    durationMs: 2000,
    timingMode: 'fixed',
    ...patch
  }
}

function openMovementEditor(patch: Partial<EffectDef> = {}) {
  act(() => {
    useShowStore.getState().addEffect(movementEffect(patch))
    useShowStore.setState({ editingEffectId: 'e-move' })
  })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.getBoundingClientRect = () => RECT as unknown as DOMRect
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { setChannels: () => {} }
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
  chartHost?.remove()
  chartHost = undefined
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

describe('polar chart mapping (Rotation-dial convention)', () => {
  const R = 118

  it('maps pan 0° to the bottom, +90° to the right, ±180° to the top, −90° to the left', () => {
    expect(normalizedToChartOffset(0, 1, R)).toEqual({ x: 0, y: R })
    expect(normalizedToChartOffset(0.5, 1, R).x).toBeCloseTo(R)
    expect(normalizedToChartOffset(0.5, 1, R).y).toBeCloseTo(0)
    expect(normalizedToChartOffset(1, 1, R).x).toBeCloseTo(0)
    expect(normalizedToChartOffset(1, 1, R).y).toBeCloseTo(-R)
    expect(normalizedToChartOffset(-1, 1, R).y).toBeCloseTo(-R)
    expect(normalizedToChartOffset(-0.5, 1, R).x).toBeCloseTo(-R)
    expect(normalizedToChartOffset(-0.5, 1, R).y).toBeCloseTo(0)
  })

  it('maps |tilt| to radius from the centre', () => {
    expect(normalizedToChartOffset(0, 0, R)).toEqual({ x: 0, y: 0 })
    expect(normalizedToChartOffset(0, 0.5, R)).toEqual({ x: 0, y: R / 2 })
    // Tilt sign is not encoded in the position: +tilt and −tilt draw
    // at the same point (the sign is carried by the drag state).
    expect(normalizedToChartOffset(0.25, -0.5, R)).toEqual(normalizedToChartOffset(0.25, 0.5, R))
  })

  it('round-trips through the inverse mapping', () => {
    for (const [pan, tilt] of [[0, 0.8], [0.5, 0.4], [-0.5, 1], [1, 0.25], [-0.25, -0.6]] as const) {
      const at = normalizedToChartOffset(pan, tilt, R)
      const back = chartOffsetToNormalized(at.x, at.y, R, Math.sign(tilt))
      expect(back.pan).toBeCloseTo(pan)
      expect(back.tilt).toBeCloseTo(tilt)
    }
  })

  it('formats pan/tilt degrees LightKey’s way', () => {
    expect(formatPanTiltDegrees(-113.5)).toBe('−113.5°')
    expect(formatPanTiltDegrees(78.1)).toBe('+78.1°')
    expect(formatPanTiltDegrees(0)).toBe('+0.0°')
  })
})

describe('Command-drag negative tilt (Guide p.169)', () => {
  it('keeps the point’s tilt sign until the pointer crosses the centre, then flips it once', () => {
    let state = { sign: 1, armed: false }
    // Circling far from the centre never arms or flips.
    state = cmdDragTiltSign(state, 0.8)
    expect(state).toEqual({ sign: 1, armed: false })
    // Dipping to the centre arms the flip; coming out flips the sign.
    state = cmdDragTiltSign(state, 0.05)
    expect(state).toEqual({ sign: 1, armed: true })
    state = cmdDragTiltSign(state, 0.3)
    expect(state).toEqual({ sign: -1, armed: false })
    // Crossing again flips it back.
    state = cmdDragTiltSign(state, 0.02)
    state = cmdDragTiltSign(state, 0.5)
    expect(state.sign).toBe(1)
  })

  it('does not flip when the pointer never reaches the centre', () => {
    let state = { sign: -1, armed: false }
    for (const fraction of [0.9, 0.5, 0.25, 0.21, 0.6]) state = cmdDragTiltSign(state, fraction)
    expect(state).toEqual({ sign: -1, armed: false })
  })
})

describe('path drawing and the add-point-on-line rule', () => {
  it('samples the path with the runtime’s interpolation, so the live dot sits on the drawn curve', () => {
    const points = [{ pan: 0, tilt: 0.4 }, { pan: 0.4, tilt: -0.3 }, { pan: -0.4, tilt: -0.3 }]
    const sampled = samplePathPoints(points, 'smooth', 12)
    expect(sampled).toHaveLength(12)
    sampled.forEach((point, i) => {
      expect(point).toEqual(pathPointAt(points, 'smooth', i / 12))
    })
  })

  it('a points path samples to its control points (no connection lines)', () => {
    const points = [{ pan: -0.6, tilt: 0.4 }, { pan: 0.3, tilt: -0.7 }]
    expect(samplePathPoints(points, 'points')).toEqual(points)
  })

  it('finds the midpoint of the nearest connection line', () => {
    const points = [{ pan: -0.8, tilt: 0.5 }, { pan: 0.8, tilt: 0.5 }]
    const at = normalizedToChartOffset(0, 0.5, 118)
    const mid = nearestSegmentMidpoint(points, 'line', at.x, at.y, 118, 12)
    expect(mid?.index).toBe(0)
    expect(mid?.point.pan).toBeCloseTo(0)
    expect(mid?.point.tilt).toBeCloseTo(0.5)
  })

  it('has no midpoint to add on a points path, or far from any line', () => {
    const points = [{ pan: -0.8, tilt: 0.5 }, { pan: 0.8, tilt: 0.5 }]
    const at = normalizedToChartOffset(0, 0.5, 118)
    expect(nearestSegmentMidpoint(points, 'points', at.x, at.y, 118, 12)).toBeNull()
    const far = normalizedToChartOffset(0, -1, 118)
    expect(nearestSegmentMidpoint(points, 'line', far.x, far.y, 118, 12)).toBeNull()
  })
})

describe('Position HUD overlay', () => {
  it('renders into the Preview host while the movement editor is open, and leaves when it closes', () => {
    setShow()
    openMovementEditor()
    chartHost = document.createElement('div')
    document.body.appendChild(chartHost)
    renderInRoot(<EffectEditor movementChartHost={chartHost} />)
    expect(chartHost.querySelector('[data-testid="movement-chart"]')).not.toBeNull()
    // The chart is portalled out of the editor: the bottom panel holds
    // only the tile grid and the params.
    expect(container?.querySelector('[data-testid="movement-chart"]')).toBeNull()
    expect(chartHost.querySelector('svg[aria-label="Movement path Circle"]')).not.toBeNull()
    act(() => { useShowStore.getState().setEditingEffectId(null) })
    expect(chartHost.querySelector('[data-testid="movement-chart"]')).toBeNull()
    expect(chartHost.innerHTML).toBe('')
  })

  it('shows LightKey’s hint wording, dismissible for the session', () => {
    setShow()
    openMovementEditor()
    renderInRoot(<EffectEditor />)
    const hint = container?.querySelector('[data-testid="movement-chart-hint"]')
    expect(hint?.textContent).toContain(
      'Click in the center of a connection line to add a control point. Hold down Command and drag a point beyond the center to move it to a negative tilt angle.'
    )
    const dismiss = hint?.querySelector('[aria-label="Dismiss hint"]') as HTMLButtonElement
    act(() => { dismiss.click() })
    expect(container?.querySelector('[data-testid="movement-chart-hint"]')).toBeNull()
  })

  it('shows the live PAN/TILT readout in degrees', async () => {
    setShow()
    openMovementEditor()
    renderInRoot(<EffectEditor />)
    // The live dot is driven by a requestAnimationFrame loop; let a
    // frame run before reading the readout.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    const chart = container?.querySelector('[data-testid="movement-chart"]')
    expect(chart?.textContent).toMatch(/PAN/)
    expect(chart?.textContent).toMatch(/TILT/)
    expect(chart?.textContent).toMatch(/[+−]\d+\.\d°/)
  })

  it('clicking the middle of a connection line inserts a point there', () => {
    setShow()
    const linePath: MovementPathDef = {
      id: 'user-line', name: 'Line Path', type: 'line',
      points: [{ pan: -0.8, tilt: 0.5 }, { pan: 0.8, tilt: 0.5 }]
    }
    act(() => { useShowStore.getState().addMovementPath(linePath) })
    openMovementEditor({ movementPathId: 'user-line' })
    renderInRoot(<EffectEditor />)
    const svg = container?.querySelector('[data-testid="movement-chart"] svg')
    if (!svg) throw new Error('no chart svg')
    // The segment midpoint is (pan 0, tilt 0.5): chart (140, 199) of
    // 280, i.e. client (75, 106.6) against the mocked 150×150 rect.
    act(() => {
      svg.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 75, clientY: 106.6, pointerId: 1, button: 0 }))
    })
    const updated = useShowStore.getState().show?.movementPaths.find((p) => p.id === 'user-line')
    expect(updated?.points).toHaveLength(3)
    expect(updated?.points[1].pan).toBeCloseTo(0)
    expect(updated?.points[1].tilt).toBeCloseTo(0.5)
  })

  it('dragging a built-in path’s point duplicates it first, then moves the point', () => {
    setShow()
    openMovementEditor()
    renderInRoot(<EffectEditor />)
    const svg = container?.querySelector('[data-testid="movement-chart"] svg')
    if (!svg) throw new Error('no chart svg')
    // Circle point 4 is (pan 0, tilt 0.8): chart (140, 234.4) of 280,
    // i.e. client (75, 125.6) against the mocked 150×150 rect. Each
    // gesture step is its own act() so the drag state from the
    // pointerdown is applied before the pointermove reads it.
    act(() => {
      svg.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 75, clientY: 125.6, pointerId: 1, button: 0 }))
    })
    act(() => {
      svg.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, clientX: 90, clientY: 125.6, pointerId: 1, button: 0 }))
    })
    act(() => {
      svg.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, clientX: 90, clientY: 125.6, pointerId: 1, button: 0 }))
    })
    const state = useShowStore.getState()
    const copies = state.show?.movementPaths.filter((p) => p.name === 'Circle copy') ?? []
    expect(copies).toHaveLength(1)
    expect(state.effects.find((e) => e.id === 'e-move')?.movementPathId).toBe(copies[0].id)
    // The dragged point moved right (pan > 0) and kept positive tilt.
    expect(copies[0].points[4].pan).toBeGreaterThan(0)
    expect(copies[0].points[4].tilt).toBeGreaterThan(0.5)
  })
})

describe('uniform movement-path tiles', () => {
  it('renders built-in, user and new-path tiles at identical dimensions with identical polar previews', () => {
    setShow()
    const userPath: MovementPathDef = {
      id: 'user-1', name: 'Circle copy', type: 'smooth',
      points: [{ pan: -0.5, tilt: 0 }, { pan: 0.5, tilt: 0 }]
    }
    act(() => { useShowStore.getState().addMovementPath(userPath) })
    openMovementEditor()
    renderInRoot(<EffectEditor />)
    const tiles = Array.from(container?.querySelectorAll('[data-testid="movement-path-tile"]') ?? [])
    // 17 built-ins + 1 user path + the New Path tile.
    expect(tiles).toHaveLength(19)
    for (const tile of tiles) {
      expect(tile.className).toContain('w-[76px]')
    }
    // Every path tile carries the same 56×56 polar preview; the New
    // Path tile is the same size but holds a "+" instead of a preview.
    const previews = tiles.map((tile) => tile.querySelector('svg')).filter((svg): svg is SVGSVGElement => svg !== null)
    expect(previews).toHaveLength(18)
    for (const svg of previews) {
      expect(svg.getAttribute('width')).toBe('56')
      expect(svg.getAttribute('height')).toBe('56')
    }
    const sizes = new Set(previews.map((svg) => `${svg.getAttribute('width')}x${svg.getAttribute('height')} ${svg.getAttribute('viewBox')}`))
    expect(sizes.size).toBe(1)
    const newPathTile = tiles.find((tile) => tile.textContent?.includes('New Path'))
    expect(newPathTile?.querySelector('svg')).toBeNull()
    expect(newPathTile?.textContent).toContain('+')
  })

  it('gives the user tile the same chart preview, with rename/delete as overlay affordances', () => {
    setShow()
    const userPath: MovementPathDef = {
      id: 'user-1', name: 'Circle copy', type: 'smooth',
      points: [{ pan: -0.5, tilt: 0 }, { pan: 0.5, tilt: 0 }]
    }
    act(() => { useShowStore.getState().addMovementPath(userPath) })
    openMovementEditor()
    renderInRoot(<EffectEditor />)
    const tiles = Array.from(container?.querySelectorAll('[data-testid="movement-path-tile"]') ?? [])
    const userTile = tiles.find((tile) => tile.textContent?.includes('Circle copy'))
    if (!userTile) throw new Error('no user tile')
    expect(userTile.querySelector('svg')).not.toBeNull()
    expect(userTile.querySelector('[aria-label="Rename path"]')).not.toBeNull()
    expect(userTile.querySelector('[aria-label="Delete path"]')).not.toBeNull()
    // The affordances overlay the tile; the tile keeps the standard size.
    expect(userTile.className).toContain('w-[76px]')
  })
})
