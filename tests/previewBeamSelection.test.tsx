// Preview beam/label selection and beam length: clicking a fixture's
// label selects the fixture in the store exactly as clicking the icon
// does (Jake, 19 Nov 2026 — the white box used to be only a focus
// outline, not a selection); clicking a light beam does NOT select it
// (Jake, 27 Nov 2026 — reversing the 19 Nov beam half: only the
// fixture itself is clickable, not the beam coming out of it). The
// drawn beam's length follows its brightness — 0 is no beam, 100% is
// the full 146, so fading in grows the beam and fading out shrinks it.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { StagePreview } from '../src/renderer/src/components/StagePreview'
import { useShowStore } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECT = { left: 0, top: 0, width: 800, height: 340, right: 800, bottom: 340, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

let container: HTMLDivElement | undefined
let rootNode: Root | undefined
let channels: number[] = []

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
    fixtures: [
      { id: 'fx1', name: 'Test Wash 1', type: 'led-wash', channelStart: 1, channels: 7 },
      { id: 'fx2', name: 'Test Wash 2', type: 'led-wash', channelStart: 8, channels: 7 }
    ],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: {
      fx1: { intensity: 255, red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 },
      fx2: { intensity: 255, red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 }
    }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [], activeCueId: 'c1', editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false, previewEditing: false })
  })
}

// The live DMX output the Preview reads: led-wash maps intensity to
// offset 0, red to 1. fx1 starts at channel 1, fx2 at channel 8.
function setChannels(intensity1: number, intensity2 = intensity1) {
  channels = new Array(512).fill(0)
  channels[0] = intensity1
  channels[1] = 255
  channels[7] = intensity2
  channels[8] = 255
}

async function renderPreview() {
  setShow()
  renderInRoot(<StagePreview />)
  // The Preview polls getChannels on mount; flush the async read so
  // the beam renders from the stubbed output.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  stubSvgPointMapping()
}

// jsdom has no getScreenCTM/createSVGPoint, so pointAt() returns null
// and the edit-mode pointerdown never arms a drag — which would make
// the beam-drag test pass vacuously (without the fix, the drag would
// never arm and the fixture would never move). Stub an identity
// transform so the drag path runs as in the real app.
function stubSvgPointMapping() {
  const svg = container?.querySelector('svg.stage-preview') as unknown as Record<string, unknown> | null
  if (svg) {
    svg.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) })
    svg.createSVGPoint = () => {
      const point = { x: 0, y: 0, matrixTransform: () => ({ x: point.x, y: point.y }) }
      return point
    }
  }
}

function labelFor(name: string) {
  const texts = [...(container?.querySelectorAll('text') ?? [])]
  const found = texts.find((t) => t.textContent === name)
  if (!found) throw new Error(`no label for ${name}`)
  return found as unknown as HTMLElement
}

function beamFor(name: string) {
  const label = labelFor(name)
  const group = label.closest('g')
  const polygon = group?.querySelector('polygon')
  if (!polygon) throw new Error(`no beam polygon for ${name}`)
  return polygon as unknown as HTMLElement
}

// The polygon's points are "x,y ..." pairs; its length is the spread
// of the y values (top to far end), its far half-width half the spread
// of the far end's x values.
function beamGeometry(polygon: HTMLElement) {
  const points = (polygon.getAttribute('points') ?? '').split(' ').map((pair) => pair.split(',').map(Number))
  const ys = points.map(([, y]) => y)
  const farYs = Math.max(...ys)
  const farXs = points.filter(([, y]) => y === farYs).map(([x]) => x)
  return { length: Math.max(...ys) - Math.min(...ys), farHalfWidth: (Math.max(...farXs) - Math.min(...farXs)) / 2 }
}

function click(el: HTMLElement, shiftKey = false) {
  act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey })) })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.getBoundingClientRect = () => RECT as unknown as DOMRect
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    setChannels: () => {},
    getChannels: async () => [...channels]
  }
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

describe('Preview beam clicks do not select the fixture (Jake, 27 Nov 2026)', () => {
  it('clicking the beam polygon selects nothing', async () => {
    setChannels(255)
    await renderPreview()
    expect(useShowStore.getState().selectedFixtureIds).toEqual([])
    click(beamFor('Test Wash 1'))
    expect(useShowStore.getState().selectedFixtureIds).toEqual([])
  })

  it('clicking a beam leaves an existing selection untouched', async () => {
    setChannels(255)
    await renderPreview()
    click(labelFor('Test Wash 1'))
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['fx1'])
    click(beamFor('Test Wash 2'))
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['fx1'])
  })

  it('a multi-selection survives a beam click', async () => {
    setChannels(255)
    await renderPreview()
    click(labelFor('Test Wash 1'))
    click(labelFor('Test Wash 2'), true)
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['fx1', 'fx2'])
    click(beamFor('Test Wash 1'))
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['fx1', 'fx2'])
  })

  it('right-clicking a beam does not select its fixture either', async () => {
    setChannels(255)
    await renderPreview()
    act(() => { beamFor('Test Wash 1').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })) })
    expect(useShowStore.getState().selectedFixtureIds).toEqual([])
  })

  it('clicking the fixture icon still selects it', async () => {
    setChannels(255)
    await renderPreview()
    // The icon's own hit circle (r 16, transparent) — the beam
    // polygons are children of the same group, so clicking the group
    // element itself would not prove the icon path.
    const group = labelFor('Test Wash 1').closest('g')
    const hit = group?.querySelector('circle[aria-hidden="true"]')
    if (!hit) throw new Error('no icon hit circle for Test Wash 1')
    click(hit as unknown as HTMLElement)
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['fx1'])
  })

  it('dragging from a beam in edit mode does not move the fixture', async () => {
    setChannels(255)
    await renderPreview()
    act(() => { useShowStore.setState({ previewEditing: true }) })
    const svg = container?.querySelector('svg.stage-preview')
    if (!svg) throw new Error('no preview svg')
    const icon = labelFor('Test Wash 1').closest('g')?.querySelector('g[data-fixture-icon]')
    if (!icon) throw new Error('no fixture icon group for Test Wash 1')
    const before = icon.getAttribute('transform')
    const beam = beamFor('Test Wash 1')
    act(() => { beam.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 400, clientY: 100 })) })
    act(() => { svg.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, pointerId: 1, clientX: 450, clientY: 150 })) })
    act(() => { svg.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 450, clientY: 150 })) })
    expect(useShowStore.getState().selectedFixtureIds).toEqual([])
    expect(icon.getAttribute('transform')).toBe(before)
  })
})

describe('Preview label clicks select the fixture', () => {
  it('clicking the label selects the fixture, like the icon', async () => {
    setChannels(255)
    await renderPreview()
    click(labelFor('Test Wash 2'))
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['fx2'])
  })

  it('Shift-clicking a second label adds to the selection', async () => {
    setChannels(255)
    await renderPreview()
    click(labelFor('Test Wash 1'))
    click(labelFor('Test Wash 2'), true)
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['fx1', 'fx2'])
  })
})

describe('multibeams: one beam per cell', () => {
  // Jake's 4-LED bar (EP4 / pixel-bar-17ch): 4 cells, RGB per cell on
  // DMX offsets 0-11 and the master dimmer on offset 12.
  function setBarShow() {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const show = {
      ...base,
      id: 'test-show',
      fixtures: [
        { id: 'bar', name: 'EP4 Bar', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }
      ],
      cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { bar: { intensity: 255 } }, fadeMs: 0 }]
    }
    act(() => {
      useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [], activeCueId: 'c1', editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false, previewEditing: false })
    })
  }

  // Cell colours as [r, g, b] per cell; the master dimmer is separate.
  function setBarChannels(intensity: number, cells: Array<[number, number, number]> = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]) {
    channels = new Array(512).fill(0)
    channels[12] = intensity
    cells.forEach(([r, g, b], i) => {
      channels[i * 3] = r
      channels[i * 3 + 1] = g
      channels[i * 3 + 2] = b
    })
  }

  async function renderBarPreview() {
    setBarShow()
    renderInRoot(<StagePreview />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    stubSvgPointMapping()
  }

  function polygonsFor(name: string) {
    const group = labelFor(name).closest('g')
    return [...(group?.querySelectorAll('polygon') ?? [])] as unknown as HTMLElement[]
  }

  // Midpoint of the polygon's top edge — the beam's origin, which
  // should sit on its cell. A single fixture lands at x 400 (the
  // demo-arc position for one fixture), so the four cell centres are
  // 386.5, 395.5, 404.5, 413.5 and the top edge is y 63.
  function beamTopCentre(polygon: HTMLElement) {
    const points = (polygon.getAttribute('points') ?? '').split(' ').map((pair) => pair.split(',').map(Number))
    const topY = Math.min(...points.map(([, y]) => y))
    const topXs = points.filter(([, y]) => y === topY).map(([x]) => x)
    return { x: (Math.min(...topXs) + Math.max(...topXs)) / 2, y: topY }
  }

  it('renders one beam polygon per cell', async () => {
    setBarChannels(255)
    await renderBarPreview()
    expect(polygonsFor('EP4 Bar')).toHaveLength(4)
  })

  it('starts each beam at its own cell, not at the fixture centre', async () => {
    setBarChannels(255)
    await renderBarPreview()
    const centres = polygonsFor('EP4 Bar').map(beamTopCentre)
    expect(centres.map((c) => c.x)).toEqual([386.5, 395.5, 404.5, 413.5])
    expect(centres.every((c) => c.y === 63)).toBe(true)
  })

  it('draws per-cell beams much shorter than the single beam', async () => {
    setBarChannels(255)
    await renderBarPreview()
    for (const polygon of polygonsFor('EP4 Bar')) {
      expect(beamGeometry(polygon).length).toBeCloseTo(64, 5)
    }
  })

  it('scales per-cell beam length with the dimmer', async () => {
    setBarChannels(128)
    await renderBarPreview()
    for (const polygon of polygonsFor('EP4 Bar')) {
      expect(beamGeometry(polygon).length).toBeCloseTo(64 * (128 / 255), 5)
    }
  })

  it('draws no beam for a dark cell while the lit cells keep theirs, in place', async () => {
    setBarChannels(255, [[255, 0, 0], [0, 0, 0], [0, 0, 255], [255, 255, 0]])
    await renderBarPreview()
    const polygons = polygonsFor('EP4 Bar')
    expect(polygons).toHaveLength(3)
    expect(polygons.map(beamTopCentre).map((c) => c.x)).toEqual([386.5, 404.5, 413.5])
  })

  it('clicking a cell beam does not select the fixture', async () => {
    setBarChannels(255)
    await renderBarPreview()
    click(polygonsFor('EP4 Bar')[2])
    expect(useShowStore.getState().selectedFixtureIds).toEqual([])
  })

  it('a single-beam fixture still renders exactly one beam', async () => {
    setChannels(255)
    await renderPreview()
    expect(polygonsFor('Test Wash 1')).toHaveLength(1)
    expect(beamGeometry(polygonsFor('Test Wash 1')[0]).length).toBeCloseTo(146, 5)
  })
})

describe('beam length follows brightness', () => {
  it('at full intensity the beam is the full 146 long', async () => {
    setChannels(255)
    await renderPreview()
    const { length, farHalfWidth } = beamGeometry(beamFor('Test Wash 1'))
    expect(length).toBeCloseTo(146, 5)
    expect(farHalfWidth).toBeCloseTo(34, 5)
  })

  it('at half intensity the beam is about half as long and narrower at the far end', async () => {
    setChannels(128)
    await renderPreview()
    const { length, farHalfWidth } = beamGeometry(beamFor('Test Wash 1'))
    expect(length).toBeCloseTo(146 * (128 / 255), 5)
    expect(farHalfWidth).toBeCloseTo(7 + 27 * (128 / 255), 5)
  })

  it('at zero intensity there is no beam at all', async () => {
    setChannels(0)
    await renderPreview()
    const group = labelFor('Test Wash 1').closest('g')
    expect(group?.querySelector('polygon')).toBeNull()
  })
})
