// LightKey fixture selection (Jake, 26 Nov 2026 — his LightKey
// screenshot): a selected fixture gets one light black opaque rounded
// box behind its icon, white border, and its label gets a blue
// background — one box per fixture, hugging the icon only, never the
// beam. Fixture labels must not be text-selectable (marquee drags kept
// highlighting them).
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

function setShow(grouped = false, specs: Array<{ id: string; name: string; type: 'par' | 'moving-head' | 'pixel-bar-17ch'; namePosition?: 'above' | 'below' }> = [
  { id: 'f1', name: 'Wash 1', type: 'par' },
  { id: 'f2', name: 'Wash 2', type: 'par' }
]) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    fixtures: specs.map((s, i) => ({
      id: s.id, name: s.name, type: s.type, channelStart: i + 1, channels: 1,
      ...(s.namePosition ? { namePosition: s.namePosition } : {}),
      ...(grouped ? { group: 'Wash' } : {})
    })),
    fixtureGroups: grouped ? [{ id: 'group:Wash', name: 'Wash', parentId: null, fixtureIds: specs.map((s) => s.id) }] : [],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: {
      f1: { intensity: 255 },
      f2: { intensity: 255 }
    }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [], activeCueId: 'c1', editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false, previewEditing: false })
  })
}

function setChannels() {
  channels = new Array(512).fill(0)
  channels[0] = 255
  channels[1] = 255
}

async function renderPreview(grouped = false, selected: string[] = [], editing = false, specs?: Array<{ id: string; name: string; type: 'par' | 'moving-head' | 'pixel-bar-17ch'; namePosition?: 'above' | 'below' }>) {
  setShow(grouped, specs)
  setChannels()
  act(() => { useShowStore.setState({ selectedFixtureIds: selected, previewEditing: editing }) })
  renderInRoot(<StagePreview />)
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  // jsdom has no getScreenCTM/createSVGPoint, so pointAt() returns
  // null and the edit-mode pointerdown never arms a drag — which would
  // make the right-click tests pass vacuously (the single-out only
  // applies on pointerup after a drag was armed). Stub an identity
  // transform so the drag path runs as in the real app.
  const svg = container?.querySelector('svg.stage-preview') as unknown as Record<string, unknown> | null
  if (svg) {
    svg.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) })
    svg.createSVGPoint = () => {
      const point = { x: 0, y: 0, matrixTransform: () => ({ x: point.x, y: point.y }) }
      return point
    }
  }
}

function fixtureGroupEl(id: string) {
  const el = container?.querySelector(`g[data-fixture-id="${id}"]`)
  if (!el) throw new Error(`no fixture group for ${id}`)
  return el as unknown as HTMLElement
}

// The label pill is the 13-tall rounded rect (rx 6.5) inside the
// fixture's group; the selection box is the black rect there. The gap
// between them is what Jake's Q4 close-up complained about.
function labelGapFor(id: string) {
  const group = fixtureGroupEl(id)
  const pill = group.querySelector('rect[fill="#0A84FF"][rx="6.5"]')
  const box = group.querySelector('rect[fill="#000000"]')
  if (!pill || !box) throw new Error(`no pill/box for ${id}`)
  const pillY = Number(pill.getAttribute('y'))
  const boxY = Number(box.getAttribute('y'))
  const boxBottom = boxY + Number(box.getAttribute('height'))
  // Above: pill bottom (pillY + 13) sits above the box top; below: the
  // pill top (pillY) sits below the box bottom.
  return pillY + 13 <= boxY ? boxY - (pillY + 13) : pillY - boxBottom
}

function labelPillY(id: string) {
  const pill = fixtureGroupEl(id).querySelector('rect[fill="#0A84FF"][rx="6.5"]')
  if (!pill) throw new Error(`no pill for ${id}`)
  return Number(pill.getAttribute('y'))
}

// A real right-click: pointerdown + pointerup with button 2, then the
// contextmenu event the menu opens from. Each dispatch gets its own
// act() so the component re-renders between them — otherwise the
// contextmenu handler keeps the pre-pointerdown selection in its
// closure and masks what the pointerdown did (the stale closure
// singles the fixture out again, hiding the group-select).
function rightClick(id: string) {
  const el = fixtureGroupEl(id)
  act(() => { el.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 2, pointerId: 1, clientX: 100, clientY: 100 })) })
  act(() => { el.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, button: 2, pointerId: 1, clientX: 100, clientY: 100 })) })
  act(() => { el.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })) })
}

function selectedIds() {
  return [...useShowStore.getState().selectedFixtureIds]
}

function labelFor(name: string) {
  const texts = [...(container?.querySelectorAll('text') ?? [])]
  const found = texts.find((t) => t.textContent === name)
  if (!found) throw new Error(`no label for ${name}`)
  return found as unknown as HTMLElement
}

function selectionBoxes() {
  return [...(container?.querySelectorAll('rect[fill="#000000"]') ?? [])] as unknown as HTMLElement[]
}

function labelPills() {
  // The pill is the 13-tall rounded rect (rx 6.5); edit mode also
  // draws small #0A84FF corner handles, which are not pills.
  return [...(container?.querySelectorAll('rect[fill="#0A84FF"][rx="6.5"]') ?? [])] as unknown as HTMLElement[]
}

function beamFor(name: string) {
  const group = labelFor(name).closest('g')
  const polygon = group?.querySelector('polygon')
  if (!polygon) throw new Error(`no beam polygon for ${name}`)
  return polygon as unknown as HTMLElement
}

function beamMaxY(polygon: HTMLElement) {
  const points = (polygon.getAttribute('points') ?? '').split(' ').map((pair) => pair.split(',').map(Number))
  return Math.max(...points.map(([, y]) => y))
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  ;(Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false
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

describe('LightKey selection boxes', () => {
  it('renders one black opaque rounded box with a white border per selected fixture, and a blue label', async () => {
    await renderPreview(false, ['f1'])
    const boxes = selectionBoxes()
    expect(boxes).toHaveLength(1)
    const box = boxes[0]
    expect(box.getAttribute('rx')).toBe('6')
    expect(box.getAttribute('stroke')).toBe('#ffffff')
    expect(box.getAttribute('fill-opacity')).toBe('0.55')
    // A par at default icon size: halfWidth 12, so 24 wide.
    expect(box.getAttribute('width')).toBe('24')
    // The label pill: blue rounded rect, white label text.
    expect(labelPills()).toHaveLength(1)
    expect(labelFor('Wash 1').getAttribute('fill')).toBe('#ffffff')
    // The unselected fixture gets neither.
    expect(labelFor('Wash 2').getAttribute('fill')).not.toBe('#ffffff')
  })

  it('hugs the icon only — the box ends well before the beam far end', async () => {
    await renderPreview(false, ['f1'])
    const box = selectionBoxes()[0]
    const boxBottom = Number(box.getAttribute('y')) + Number(box.getAttribute('height'))
    const beamEnd = beamMaxY(beamFor('Wash 1'))
    expect(boxBottom).toBeLessThan(beamEnd)
    expect(Number(box.getAttribute('height'))).toBeLessThan((beamEnd - Number(box.getAttribute('y'))) / 2)
  })

  it('gives every fixture in a selected group its own box', async () => {
    await renderPreview(true, ['f1', 'f2'])
    expect(selectionBoxes()).toHaveLength(2)
    expect(labelPills()).toHaveLength(2)
    // The two boxes are at different fixtures, not one enclosing box.
    const xs = selectionBoxes().map((box) => Number(box.getAttribute('x')))
    expect(new Set(xs).size).toBe(2)
  })

  it('keeps edit mode on the blue handles — no black box there', async () => {
    await renderPreview(false, ['f1'], true)
    expect(selectionBoxes()).toHaveLength(0)
    // The blue label pill still shows, and the icon keeps its blue
    // edit-mode surround.
    expect(labelPills()).toHaveLength(1)
    expect(container?.querySelectorAll('circle[stroke="#0A84FF"]').length).toBeGreaterThan(0)
  })

  it('makes fixture labels unselectable — the Preview svg is select-none', async () => {
    await renderPreview(false, ['f1'])
    const svg = container?.querySelector('svg.stage-preview')
    expect(svg).not.toBeNull()
    expect(svg?.classList.contains('select-none')).toBe(true)
  })
})

describe('Selection label gap (Jake, 26 Nov 2026 — his Q4 close-up)', () => {
  it('lifts the label pill clear of the box top for a par', async () => {
    await renderPreview(false, ['f1'])
    expect(labelGapFor('f1')).toBe(4)
  })

  it('lifts the label pill clear of the box top for a moving head and an LED bar', async () => {
    await renderPreview(false, ['f1'], false, [
      { id: 'f1', name: 'MH 1', type: 'moving-head' },
      { id: 'f2', name: 'Bar 1', type: 'pixel-bar-17ch' }
    ])
    expect(labelGapFor('f1')).toBe(4)
    act(() => { useShowStore.setState({ selectedFixtureIds: ['f2'] }) })
    expect(labelGapFor('f2')).toBe(4)
  })

  it('drops the label below the box with the same gap', async () => {
    await renderPreview(false, ['f1'], false, [
      { id: 'f1', name: 'Wash 1', type: 'par', namePosition: 'below' },
      { id: 'f2', name: 'Wash 2', type: 'par' }
    ])
    expect(labelGapFor('f1')).toBe(4)
  })

  it('keeps the legacy label position in edit mode — no box, no lift', async () => {
    await renderPreview(false, ['f1'], true)
    // A par: the icon circle sits at the fixture centre; the legacy
    // label is labelY y-13, so the pill (labelY - 10) starts at y-23.
    const icon = fixtureGroupEl('f1').querySelector('circle[r="5.5"]')
    const cy = Number(icon?.getAttribute('cy'))
    expect(labelPillY('f1')).toBe(cy - 23)
  })
})

describe('Right-click keeps the selection (Jake, 26 Nov 2026)', () => {
  it('right-clicking a fixture in a multi-selection leaves it untouched', async () => {
    await renderPreview(true, ['f1', 'f2'], true)
    rightClick('f1')
    expect(selectedIds()).toEqual(['f1', 'f2'])
  })

  it('right-clicking a fixture outside the selection selects just that fixture', async () => {
    await renderPreview(true, ['f1'], true)
    rightClick('f2')
    expect(selectedIds()).toEqual(['f2'])
  })

  it('right-clicking with nothing selected selects just that fixture', async () => {
    await renderPreview(true, [], true)
    rightClick('f1')
    expect(selectedIds()).toEqual(['f1'])
  })

  it('a right-drag on blank canvas does not start a marquee', async () => {
    await renderPreview(true, ['f1'], true)
    const blank = container?.querySelector('svg rect[fill="transparent"]')
    if (!blank) throw new Error('no blank canvas rect')
    act(() => { blank.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 2, pointerId: 1, clientX: 100, clientY: 100 })) })
    act(() => { blank.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, button: 2, buttons: 2, pointerId: 1, clientX: 700, clientY: 300 })) })
    act(() => { blank.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, button: 2, pointerId: 1, clientX: 700, clientY: 300 })) })
    expect(selectedIds()).toEqual(['f1'])
  })
})
