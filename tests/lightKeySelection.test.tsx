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

function setShow(grouped = false) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [
      { id: 'f1', name: 'Wash 1', type: 'par', channelStart: 1, channels: 1, ...(grouped ? { group: 'Wash' } : {}) },
      { id: 'f2', name: 'Wash 2', type: 'par', channelStart: 2, channels: 1, ...(grouped ? { group: 'Wash' } : {}) }
    ],
    fixtureGroups: grouped ? [{ id: 'group:Wash', name: 'Wash', parentId: null, fixtureIds: ['f1', 'f2'] }] : [],
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

async function renderPreview(grouped = false, selected: string[] = [], editing = false) {
  setShow(grouped)
  setChannels()
  act(() => { useShowStore.setState({ selectedFixtureIds: selected, previewEditing: editing }) })
  renderInRoot(<StagePreview />)
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
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
