// Calibration dialog visuals (Jake's reports, 25 Nov 2026): the Rotation
// click must visibly reverse the arrow and the sweep must cover the
// whole dial; the Limits dial must carry no degree labels and big bold
// handles; the Home arrow is LightKey's wide dart; the wizard Set… pill
// must paint above the fixture's invisible hit circle.
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

  it('Home arrow is LightKey\'s wide dart, not a thin shaft', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const svg = dialSvg(el)
    // The home arrow is the blue polygon in the dial (the fixture glyph
    // is a circle, not a polygon).
    const arrow = svg.querySelector('polygon[fill="#2563eb"]')
    if (!arrow) throw new Error('no home arrow polygon')
    const points = (arrow.getAttribute('points') ?? '').trim().split(/\s+/)
    expect(points).toHaveLength(4) // tip, two wings, tail — a kite
    const xs = points.map((p) => Number(p.split(',')[0]))
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100) // wide wings
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
      // The Limits step had the same collision in its needle lines:
      // a full-range fixture puts both tilt needles at 180°.
      clickStep(el, 'Limits')
      expect(errors.flat().join(' ')).not.toContain('same key')
    } finally {
      console.error = originalError
    }
  })

  it('Limits dial draws full circles for a full-range fixture, no excluded arc', async () => {
    setShow()
    const el = renderInRoot(<CalibrationDialog fixtureIds={['mh1']} onClose={() => {}} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    clickStep(el, 'Limits')
    const svg = dialSvg(el)
    // The head has no limits set, so pan and tilt both span the whole
    // axis: the allowed (green) arcs are full circles and the excluded
    // (red) arcs are empty. The old code drew degenerate zero-length
    // arcs for both, so the default Limits dial showed no arcs at all.
    const green = Array.from(svg.querySelectorAll('path[stroke="#22c55e"]'))
    expect(green).toHaveLength(2)
    for (const arc of green) {
      const d = arc.getAttribute('d') ?? ''
      expect(d).toContain('A ')
      expect(d.split(' A ').length).toBe(3) // two arc segments = a circle
    }
    const red = Array.from(svg.querySelectorAll('path[stroke="#ef4444"]'))
    expect(red).toHaveLength(2)
    for (const arc of red) expect(arc.getAttribute('d')).toBe('')
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
    // Needle lines from the centre to the tilt handles.
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
