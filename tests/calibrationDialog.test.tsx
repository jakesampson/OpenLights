// Calibration dialog visuals (Jake's reports, 25–26 Nov 2026): the
// Rotation click must visibly reverse the arrow and the sweep must
// cover the whole dial; the Limits dial is LightKey's two rings
// (green max outer, red min inner, each 270° from 6 o'clock) with
// two inner tilt bars, and big bold handles that point at the
// centre; the Home arrow is LightKey's wide dart; the wizard Set…
// pill must paint above the fixture's invisible hit circle.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { CalibrationDialog } from '../src/renderer/src/components/CalibrationDialog'
import { StagePreview } from '../src/renderer/src/components/StagePreview'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { FixtureDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

const RECT = { left: 0, top: 0, width: 800, height: 340, right: 800, bottom: 340, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => {
    rootNode.render(node)
  })
  return el
}

afterEach(() => {
  if (rootNode) act(() => rootNode.unmount())
  rootNode = undefined
  if (container) container.remove()
  container = undefined
})

// Built-in moving head: intensity 0, pan 1, tilt 2; 540°/270° defaults.
const head: FixtureDef = { id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 1, channels: 8, calibration: { homeDirection: 90, perspective: 'down' } }

function setShow(fixtures: FixtureDef[] = [head]) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  act(() => {
    useShowStore.setState({
      show: { ...base, id: 'test-show', fixtures, cues: [] },
      cues: [],
      presets: [],
      selectedFixtureIds: [],
      activeCueId: null,
      editingPresetId: null,
      editingCueAdHocId: null,
      manualOverrides: {},
      showOverrideLabels: false,
      previewEditing: false,
      setupWizardStep: null
    })
  })
}

function clickStep(el: Element, label: string) {
  const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(label))
  if (!button) throw new Error(`no step button ${label}`)
  act(() => {
    button.dispatchEvent(new window.Event('click', { bubbles: true }))
  })
}

function dialSvg(el: Element): SVGSVGElement {
  const svg = el.querySelector('svg[aria-label$="dial"]')
  if (!svg) throw new Error('no dial svg')
  return svg as SVGSVGElement
}

/** Parse a single-arc path's endpoints (M x y A r r 0 f 1 x y). */
function arcEnds(d: string): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const m = d.match(/^M ([\d.e+-]+) ([\d.e+-]+) A [\d.]+ [\d.]+ 0 \d 1 ([\d.e+-]+) ([\d.e+-]+)$/)
  if (!m) throw new Error(`not a single arc: ${d}`)
  return { start: { x: Number(m[1]), y: Number(m[2]) }, end: { x: Number(m[3]), y: Number(m[4]) } }
}

/** Centroid of a polygon's points attribute. */
function polygonCentroid(points: string): { x: number; y: number } {
  const coords = points.trim().split(/\s+/).map((p) => p.split(',').map(Number))
  return { x: coords.reduce((s, c) => s + c[0], 0) / 3, y: coords.reduce((s, c) => s + c[1], 0) / 3 }
}

/** Dispatch a pointer event with dial coordinates (jsdom has no
 *  PointerEvent constructor, so a MouseEvent of the same type
 *  carries them — React listens by event type). The dial's rect is
 *  mocked to 800×340 while the SVG is 340×340, so svg x maps to
 *  clientX × 800/340 and svg y is clientY. */
function pointer(el: Element, type: string, svgX: number, svgY: number) {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: (svgX * 800) / 340, clientY: svgY })
  act(() => { el.dispatchEvent(event) })
}

describe('calibration dialog', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.getBoundingClientRect = function () {
      return RECT as DOMRect
    }
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      setChannels: () => {},
      getChannels: async () => new Array(512).fill(0)
    }
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
    vi.unstubAllGlobals()
  })

  it('Home arrow is LightKey\'s long dart with a notched tail, not a diamond', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const svg = dialSvg(el)
    // The home arrow is the blue polygon in the dial (the fixture glyph
    // is a circle, not a polygon).
    const arrow = svg.querySelector('polygon[fill="#2563eb"]')
    if (!arrow) throw new Error('no home arrow polygon')
    const points = (arrow.getAttribute('points') ?? '').trim().split(/\s+/).map((p) => {
      const [x, y] = p.split(',').map(Number)
      return { x, y }
    })
    expect(points).toHaveLength(4)
    // Jake, 26 Nov 2026: the c08f5a1 dial rework had made the arrow a
    // symmetric diamond — one point at the top, one at the bottom,
    // widest in the middle. LightKey's is a dart: a single sharp point
    // at the front and a notched tail at the back.
    const ys = points.map((p) => p.y)
    const top = Math.min(...ys), bottom = Math.max(...ys)
    // One vertex at the top (the point) and two at the bottom (the
    // tail peaks) — a diamond would have one at each end.
    expect(points.filter((p) => p.y === top)).toHaveLength(1)
    expect(points.filter((p) => p.y === bottom)).toHaveLength(2)
    // The fourth vertex is the notch: between the peaks in x, and
    // above them (it dips into the tail, not out past it).
    const notch = points.find((p) => p.y !== top && p.y !== bottom)
    if (!notch) throw new Error('no notch vertex')
    expect(notch.x).toBeCloseTo(170, 0)
    expect(notch.y).toBeGreaterThan(top)
    expect(notch.y).toBeLessThan(bottom)
    // The tail is wide — about half the dart's length.
    const peaks = points.filter((p) => p.y === bottom)
    expect(Math.abs(peaks[0].x - peaks[1].x)).toBeGreaterThan(100)
  })

  it('Rotation dial labels the full ±180° dial at the rim, with a thick curved arrow', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    clickStep(el, 'Rotation')
    const svg = dialSvg(el)
    // Degree labels at the rim (LightKey's), including the far end.
    expect(svg.textContent).toContain('+150°')
    expect(svg.textContent).toContain('0°')
    // The sweep arrow is a thick curved band, not a thin line.
    const arc = svg.querySelector('path[stroke="#2563eb"]')
    if (!arc) throw new Error('no rotation arc')
    expect(arc.getAttribute('stroke-width')).toBe('7')
    // A large triangular head at the leading end.
    expect(svg.querySelector('polygon[fill="#2563eb"]')).not.toBeNull()
  })

  it('clicking inside the Rotation circle visibly reverses the arrow', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    clickStep(el, 'Rotation')
    expect(el.textContent).not.toContain('Reversed — the arrow now travels the other way')
    act(() => {
      dialSvg(el).dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
    })
    // The reversed state is shown in the side panel (the in-dial hint
    // used to sit across the dial's lower ticks).
    expect(el.textContent).toContain('Reversed — the arrow now travels the other way')
    expect(dialSvg(el).textContent).not.toContain('reverse the direction')
  })

  it('Rotation sweep scrolls continuously for two full turns, with no blackout rewind', async () => {
    // Jake, 26 Nov 2026: in LightKey the Rotation arrow "just
    // infinitely scrolls"; ours swept once and then rewound to the
    // start in blackout. Drive the rAF loop with synthetic timestamps
    // and read the pan channel it sends: it must climb steadily and
    // only ever drop at the ±180° wrap (once per turn), with the
    // dimmer full throughout.
    const patches: Record<number, number>[] = []
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      setChannels: (patch: Record<number, number>) => { patches.push({ ...patch }) },
      getChannels: async () => new Array(512).fill(0)
    }
    let rafCallback: ((now: number) => void) | null = null
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: (now: number) => void) => { rafCallback = cb; return 1 }))
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    clickStep(el, 'Rotation')
    if (!rafCallback) throw new Error('rotation rAF loop never started')
    const start = performance.now()
    const pans: number[] = []
    const intensities: number[] = []
    for (let s = 0; s <= 16; s++) {
      patches.length = 0
      const cb = rafCallback
      act(() => { cb(start + s * 1000) })
      const last = patches[patches.length - 1]
      if (!last) throw new Error(`no calibration output at ${s}s`)
      pans.push(last[2])
      intensities.push(last[1])
    }
    // No blackout at any point: the dimmer stays full for the whole sweep.
    expect(intensities.every((v) => v === 255)).toBe(true)
    // The pan channel climbs steadily and only ever drops at the ±180°
    // wrap (once per turn) — never a gradual rewind.
    let drops = 0
    for (let i = 1; i < pans.length; i++) {
      const diff = pans[i] - pans[i - 1]
      if (diff < -50) drops++
      else expect(diff).toBeGreaterThan(0)
    }
    expect(drops).toBe(2)
    // Two full turns: the unwrapped climb is ~340 channel steps
    // (43 → 213 per turn).
    const unwrapped = pans.reduce((total, v, i) => (i === 0 ? total : total + (v - pans[i - 1] < -50 ? v - pans[i - 1] + 170 : v - pans[i - 1])), 0)
    expect(unwrapped).toBeGreaterThan(300)
  })

  it('Rotation dial has one 180° label and no duplicate-key warning', async () => {
    setShow()
    const errors: unknown[][] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => { errors.push(args) }
    try {
      const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      clickStep(el, 'Rotation')
      const svg = dialSvg(el)
      // +180° and −180° are the same dial point, so only one label
      // sits at the top — the old dial rendered both on top of each
      // other (and React warned about the duplicated key 180, since
      // the tick at 180° and the label at 180° shared it).
      const farEnd = Array.from(svg.querySelectorAll('text')).filter((t) => t.textContent?.includes('180°'))
      expect(farEnd).toHaveLength(1)
      expect(farEnd[0].textContent).toBe('+180°')
      // The Limits step's tilt bars sit at fixed positions (red up,
      // green down), so a full-range fixture has no angle collision
      // there either.
      clickStep(el, 'Limits')
      expect(errors.flat().join(' ')).not.toContain('same key')
    } finally {
      console.error = originalError
    }
  })

  it('Limits dial is LightKey two rings: green max outer, red min inner, each 270° from 6 o’clock', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    clickStep(el, 'Limits')
    const svg = dialSvg(el)
    // The head has no limits set: full range, pan ±270°, tilt ±135°.
    // Green (max) arc runs clockwise from 6 o'clock to the 3 o'clock
    // handle; red (min) arc runs clockwise from the 9 o'clock handle
    // to 6 o'clock — each a single 270° arc (large-arc flag), not a
    // full circle and not the old allowed/excluded pair.
    const green = svg.querySelector('path[stroke="#22c55e"]')
    const red = svg.querySelector('path[stroke="#ef4444"]')
    if (!green || !red) throw new Error('missing Limits arcs')
    expect((green.getAttribute('d') ?? '')).toContain('A 150 150 0 1 1')
    const greenEnds = arcEnds(green.getAttribute('d') ?? '')
    expect(greenEnds.start.x).toBeCloseTo(170, 0) // 6 o'clock
    expect(greenEnds.start.y).toBeCloseTo(320, 0)
    expect(greenEnds.end.x).toBeCloseTo(320, 0) // 3 o'clock
    expect(greenEnds.end.y).toBeCloseTo(170, 0)
    expect((red.getAttribute('d') ?? '')).toContain('A 142 142 0 1 1')
    const redEnds = arcEnds(red.getAttribute('d') ?? '')
    expect(redEnds.start.x).toBeCloseTo(28, 0) // 9 o'clock
    expect(redEnds.start.y).toBeCloseTo(170, 0)
    expect(redEnds.end.x).toBeCloseTo(170, 0) // 6 o'clock
    expect(redEnds.end.y).toBeCloseTo(312, 0)
    // Four handles, each a big triangle with a white outline — and
    // every one points at the centre: its apex (the vertex nearest
    // the centre) is strictly closer than its base vertices.
    const handles = Array.from(svg.querySelectorAll('polygon[stroke="#ffffff"]'))
    expect(handles).toHaveLength(4)
    const byCentroid = (x: number, y: number) => handles.find((h) => {
      const c = polygonCentroid(h.getAttribute('points') ?? '')
      return Math.abs(c.x - x) < 5 && Math.abs(c.y - y) < 5
    })
    expect(byCentroid(315, 170)).toBeTruthy() // green pan handle, 3 o'clock
    expect(byCentroid(33, 170)).toBeTruthy() // red pan handle, 9 o'clock
    expect(byCentroid(162, 74)).toBeTruthy() // red tilt handle, top
    expect(byCentroid(178, 266)).toBeTruthy() // green tilt handle, bottom
    for (const handle of handles) {
      const coords = (handle.getAttribute('points') ?? '').trim().split(/\s+/).map((p) => p.split(',').map(Number))
      const dists = coords.map(([x, y]) => Math.hypot(x - 170, y - 170)).sort((a, b) => a - b)
      expect(dists[0]).toBeLessThan(dists[1])
    }
    // Tilt stems: red runs up from the centre glyph, green down,
    // both to 2R/3 (full extent = ±135°).
    const redStem = svg.querySelector('line[stroke="#ef4444"]')
    const greenStem = svg.querySelector('line[stroke="#22c55e"]')
    if (!redStem || !greenStem) throw new Error('missing tilt stems')
    expect(Number(redStem.getAttribute('x1'))).toBeCloseTo(167, 0)
    expect(Number(redStem.getAttribute('y1'))).toBeCloseTo(142, 0)
    expect(Number(redStem.getAttribute('y2'))).toBeCloseTo(83, 0)
    expect(Number(greenStem.getAttribute('x1'))).toBeCloseTo(173, 0)
    expect(Number(greenStem.getAttribute('y1'))).toBeCloseTo(198, 0)
    expect(Number(greenStem.getAttribute('y2'))).toBeCloseTo(257, 0)
  })

  it('Limits pan handles move only their own way from 6 o’clock, up to 270°', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    clickStep(el, 'Limits')
    const svg = dialSvg(el)
    const handles = Array.from(svg.querySelectorAll('polygon[stroke="#ffffff"]'))
    const greenPan = handles.find((h) => polygonCentroid(h.getAttribute('points') ?? '').x > 300)
    const redPan = handles.find((h) => polygonCentroid(h.getAttribute('points') ?? '').x < 50)
    if (!greenPan || !redPan) throw new Error('missing pan handles')
    // Green (max) clockwise from 6 o'clock: drag the 3 o'clock handle
    // to 9 o'clock — 90° of travel — and the max becomes +90°.
    pointer(greenPan, 'pointerdown', 320, 170)
    pointer(svg, 'pointermove', 20, 170)
    expect(el.textContent).toContain('MAX. PAN +90.0°')
    pointer(svg, 'pointerup', 20, 170)
    expect(el.textContent).toContain('Pan −270.0° – +90.0°')
    // Green past the 6 o'clock start (anticlockwise side) snaps to
    // 0, not to a negative value or a 340° travel.
    pointer(greenPan, 'pointerdown', 320, 170)
    pointer(svg, 'pointermove', 221, 311) // just anticlockwise of 6 o'clock
    expect(el.textContent).toContain('MAX. PAN +0.0°')
    pointer(svg, 'pointerup', 221, 311)
    // Red (min) anticlockwise from 6 o'clock: drag the 9 o'clock
    // handle to 3 o'clock — 90° of travel — and the min becomes −90°.
    pointer(redPan, 'pointerdown', 28, 170)
    pointer(svg, 'pointermove', 320, 170)
    expect(el.textContent).toContain('MIN. PAN −90.0°')
    pointer(svg, 'pointerup', 320, 170)
    expect(el.textContent).toContain('Pan −90.0° – +0.0°')
  })

  it('Limits tilt bars map pointer distance from the centre to the limit', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    clickStep(el, 'Limits')
    const svg = dialSvg(el)
    const handles = Array.from(svg.querySelectorAll('polygon[stroke="#ffffff"]'))
    const redTilt = handles.find((h) => {
      const c = polygonCentroid(h.getAttribute('points') ?? '')
      return c.y < 100
    })
    const greenTilt = handles.find((h) => {
      const c = polygonCentroid(h.getAttribute('points') ?? '')
      return c.y > 250
    })
    if (!redTilt || !greenTilt) throw new Error('missing tilt handles')
    // Red (min) half-extent above the centre is −67.5° (half of 135°).
    pointer(redTilt, 'pointerdown', 167, 70)
    pointer(svg, 'pointermove', 167, 120)
    expect(el.textContent).toContain('MIN. TILT −67.5°')
    pointer(svg, 'pointerup', 167, 120)
    // Dragging the red handle below the centre clamps it to 0.
    pointer(redTilt, 'pointerdown', 167, 70)
    pointer(svg, 'pointermove', 167, 270)
    expect(el.textContent).toContain('MIN. TILT +0.0°')
    pointer(svg, 'pointerup', 167, 270)
    // Green (max) half-extent below the centre is +67.5°.
    pointer(greenTilt, 'pointerdown', 173, 270)
    pointer(svg, 'pointermove', 173, 220)
    expect(el.textContent).toContain('MAX. TILT +67.5°')
    pointer(svg, 'pointerup', 173, 220)
    expect(el.textContent).toContain('Tilt +0.0° – +67.5°')
  })

  it('Limits dial carries no degree labels and big white-outlined handles', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    clickStep(el, 'Limits')
    const svg = dialSvg(el)
    // No degree numbers anywhere on the dial (they live in the side
    // panel's Pan/Tilt readout instead).
    expect(svg.textContent).not.toMatch(/\d+°/)
    // Four handles, each a big triangle with a white outline — not the
    // old ~3px slivers (whose bounding box was ~3 units on one side).
    const handles = Array.from(svg.querySelectorAll('polygon[stroke="#ffffff"]'))
    expect(handles).toHaveLength(4)
    for (const handle of handles) {
      const points = (handle.getAttribute('points') ?? '').trim().split(/\s+/)
      expect(points).toHaveLength(3)
      const xs = points.map((p) => Number(p.split(',')[0]))
      const ys = points.map((p) => Number(p.split(',')[1]))
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(10)
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(10)
    }
    // Tilt stems from the centre glyph to the tilt handles.
    expect(svg.querySelectorAll('line[stroke="#ef4444"], line[stroke="#22c55e"]').length).toBeGreaterThanOrEqual(2)
  })
})

describe('wizard Set… pill hit handling', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.getBoundingClientRect = function () {
      return RECT as DOMRect
    }
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      setChannels: () => {},
      getChannels: async () => new Array(512).fill(0)
    }
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
  })

  it('paints the Set… pill above the fixture hit circle, so its centre is clickable', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    act(() => {
      useShowStore.setState({
        show: { ...base, id: 'test-show', fixtures: [head], cues: [] },
        cues: [],
        presets: [],
        selectedFixtureIds: [],
        activeCueId: null,
        editingPresetId: null,
        editingCueAdHocId: null,
        manualOverrides: {},
        showOverrideLabels: false,
        previewEditing: false,
        setupWizardStep: 'directions'
      })
    })
    const el = renderInRoot(<StagePreview />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const pill = el.querySelector('g[aria-label="Set beam direction for MH1"]')
    const hit = el.querySelector('circle[r="16"]')
    if (!pill || !hit) throw new Error('pill or hit circle missing')
    // Later in document order paints above in SVG, so the pill wins
    // hit-testing over the hit circle where they overlap.
    expect(pill.compareDocumentPosition(hit) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })
})
