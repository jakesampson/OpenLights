// Preview background images (Jake, 27 Nov 2026): corner-grab resize
// (uniform by default, Shift for free stretch), a Lock toggle in the
// image properties panel, and images always painting behind trusses and
// fixtures — even when the image was added after the truss.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { StagePreview } from '../src/renderer/src/components/StagePreview'
import { StageObjectTools } from '../src/renderer/src/components/StageObjects'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { StageObject } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECT = { left: 0, top: 0, width: 800, height: 340, right: 800, bottom: 340, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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

function setShow(locked = false) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const image: StageObject = { id: 'img', name: 'Auditorium', kind: 'image', x: 400, y: 170, width: 120, height: 60, rotation: 0, imageSrc: PIXEL, ...(locked ? { locked: true } : {}) }
  const rect: StageObject = { id: 'rect', name: 'Deck', kind: 'rectangle', x: 400, y: 260, width: 120, height: 60, rotation: 0 }
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [{ id: 'f1', name: 'Wash 1', type: 'par' as const, channelStart: 1, channels: 1 }],
    fixtureGroups: [],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { f1: { intensity: 255 } }, fadeMs: 0 }],
    previewTrusses: [{ id: 't1', name: 'Truss', shape: 'straight' as const, x: 400, y: 60, width: 200, height: 100, rotation: 0 }],
    // The image is added AFTER the truss and the rectangle — it must
    // still paint behind both.
    stageObjects: [rect, image]
  }
  act(() => {
    useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [], selectedStageObjectId: 'img', activeCueId: 'c1', editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false, previewEditing: true })
  })
}

async function renderPreview(locked = false) {
  setShow(locked)
  channels = new Array(512).fill(0)
  channels[0] = 255
  renderInRoot(<StagePreview />)
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  // jsdom has no getScreenCTM/createSVGPoint — stub an identity
  // transform so pointer math runs as in the real app.
  const svg = container?.querySelector('svg.stage-preview') as unknown as Record<string, unknown> | null
  if (svg) {
    svg.getScreenCTM = () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) })
    svg.createSVGPoint = () => {
      const point = { x: 0, y: 0, matrixTransform: () => ({ x: point.x, y: point.y }) }
      return point
    }
  }
}

function imageEl() {
  const el = container?.querySelector('svg image')
  if (!el) throw new Error('no stage image element')
  return el
}

function objectInStore(id: string) {
  const found = useShowStore.getState().show?.stageObjects?.find((o) => o.id === id)
  if (!found) throw new Error(`no stage object ${id}`)
  return found
}

function dragHandle(corner: string, from: { x: number; y: number }, to: { x: number; y: number }, shift = false) {
  const handle = container?.querySelector(`[data-resize-handle="${corner}"]`)
  if (!handle) throw new Error(`no ${corner} resize handle`)
  act(() => { handle.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: from.x, clientY: from.y })) })
  act(() => { handle.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, pointerId: 1, clientX: to.x, clientY: to.y, shiftKey: shift })) })
  act(() => { handle.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: to.x, clientY: to.y })) })
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

describe('Preview background images', () => {
  it('paints images behind trusses and fixtures even when added after them', async () => {
    await renderPreview()
    const image = imageEl()
    const trussPath = container?.querySelector('path[stroke-width="8"]')
    const fixtureIcon = container?.querySelector('g[data-fixture-icon="f1"]')
    const rectGroup = container?.querySelector('g[transform="translate(400 260) rotate(0) scale(1 1)"]')
    if (!trussPath || !fixtureIcon || !rectGroup) throw new Error('missing truss / fixture / rectangle in the Preview')
    expect(image.compareDocumentPosition(trussPath) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(image.compareDocumentPosition(fixtureIcon) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    // The non-image layer is unchanged: the rectangle still paints
    // after (above) the truss.
    expect(trussPath.compareDocumentPosition(rectGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('shows four corner handles on a selected image', async () => {
    await renderPreview()
    expect(container?.querySelectorAll('[data-resize-handle]')).toHaveLength(4)
  })

  it('scales uniformly by default on a corner drag', async () => {
    await renderPreview()
    // SE handle at (460, 200); out by (12, 6) is a 1.1× scale.
    dragHandle('se', { x: 460, y: 200 }, { x: 472, y: 206 })
    expect(objectInStore('img')).toMatchObject({ x: 406, y: 173, width: 132, height: 66 })
  })

  it('stretches freely with Shift — width and height move independently', async () => {
    await renderPreview()
    dragHandle('se', { x: 460, y: 200 }, { x: 472, y: 200 }, true)
    expect(objectInStore('img')).toMatchObject({ x: 406, y: 170, width: 132, height: 60 })
  })

  it('a locked image shows no handles, shows the lock mark, and does not move on drag', async () => {
    await renderPreview(true)
    expect(container?.querySelectorAll('[data-resize-handle]')).toHaveLength(0)
    expect(container?.querySelector('g[aria-label="Auditorium is locked"]')).not.toBeNull()
    const group = imageEl().closest('g')
    if (!group) throw new Error('no image group')
    act(() => { group.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 400, clientY: 170 })) })
    act(() => { group.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, button: 0, buttons: 1, pointerId: 1, clientX: 420, clientY: 180 })) })
    act(() => { group.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, clientX: 420, clientY: 180 })) })
    expect(objectInStore('img')).toMatchObject({ x: 400, y: 170, width: 120, height: 60 })
    // Still selectable — the click above selected it, so it can be
    // unlocked again from the panel.
    expect(useShowStore.getState().selectedStageObjectId).toBe('img')
  })

  it('the Lock checkbox in the panel toggles the lock, and only shows for images', async () => {
    await renderPreview()
    renderInRoot(<StageObjectTools editing selectedId="img" select={() => {}} />)
    const lock = container?.querySelector('input[aria-label="Lock image"]') as HTMLInputElement | null
    if (!lock) throw new Error('no Lock checkbox for the image')
    act(() => { lock.click() })
    expect(objectInStore('img').locked).toBe(true)
    act(() => { lock.click() })
    expect(objectInStore('img').locked).toBe(false)
    // A rectangle gets no Lock toggle.
    act(() => { rootNode?.unmount() })
    renderInRoot(<StageObjectTools editing selectedId="rect" select={() => {}} />)
    expect(container?.querySelector('input[aria-label="Lock image"]')).toBeNull()
  })
})
