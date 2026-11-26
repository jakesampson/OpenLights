// Curve editor point placement (Jake, 26 Nov 2026): clicking to add a
// point in a custom Dimmer effect's curve editor put the point all the
// way left at 0% instead of where he clicked, and dragged points would
// not follow the pointer either. Root cause was svgToCurvePoint in
// EffectEditor.tsx: the x value was clamped to 0..1 BEFORE being divided
// by the inner width, so every x collapsed to 1/616 (≈0%). These tests
// drive the real CurveCanvas through pointer events with a stubbed SVG
// rect (640×200, exactly the viewBox, so client coords map 1:1).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { EffectEditor } from '../src/renderer/src/components/EffectEditor'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { EffectDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

const CURVE_EFFECT: EffectDef = {
  id: 'eff-curve',
  name: 'Dimmer Effect',
  fixtureIds: ['fx1'],
  attribute: 'intensity',
  waveform: 'sine',
  speed: 1,
  syncToBpm: false,
  size: 255,
  offset: 128,
  phaseSpread: 0,
  enabled: true,
  kind: 'curve',
  durationMs: 2000,
  timingMode: 'fixed',
  curveComponents: [{
    component: 'intensity',
    points: [
      { id: 'point-0', x: 0, y: 0.5 },
      { id: 'point-1', x: 1, y: 0.5 }
    ],
    curvedSegments: [false]
  }]
}

function renderCurveEditor() {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    effectTemplates: [],
    fixtures: [{ id: 'fx1', name: 'Test Wash', type: 'led-wash', channelStart: 1, channels: 7 }],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity: 255 } }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({
      show,
      cues: show.cues,
      presets: [],
      effects: [structuredClone(CURVE_EFFECT)],
      selectedFixtureIds: ['fx1'],
      activeCueId: 'c1',
      editingPresetId: null,
      editingCueAdHocId: null,
      manualOverrides: {},
      showOverrideLabels: false,
      editingEffectId: 'eff-curve',
      editingEffectTemplateId: null,
      editingLiveEffectId: null,
      effectChooserAttribute: null
    })
  })
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(<EffectEditor />) })
  const svg = el.querySelector('svg[aria-label="Curve for intensity"]') as SVGSVGElement | null
  if (!svg) throw new Error('curve canvas not rendered')
  // jsdom has no layout: stub the rect to exactly the viewBox so client
  // coordinates map 1:1 onto SVG units.
  svg.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 640, height: 200, right: 640, bottom: 200, x: 0, y: 0, toJSON: () => ({})
  } as DOMRect)
  return svg
}

function pointer(type: string, x: number, y: number, target: Element) {
  return new window.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 })
}

function points() {
  const effect = useShowStore.getState().effects.find((e) => e.id === 'eff-curve')
  return [...(effect?.curveComponents?.[0]?.points ?? [])].sort((a, b) => a.x - b.x)
}

describe('CurveCanvas point placement', () => {
  beforeEach(() => { renderCurveEditor() })
  afterEach(() => {
    if (rootNode) act(() => { rootNode.unmount() })
    container?.remove()
    container = undefined
    rootNode = undefined
  })

  it('adds a point at the clicked position, not at 0%', () => {
    const svg = container!.querySelector('svg[aria-label="Curve for intensity"]') as SVGSVGElement
    // Mid-canvas: x = (320 - 12) / 616 = 0.5, y = 1 - (60 - 12) / 176 ≈ 0.727.
    act(() => { svg.dispatchEvent(pointer('pointerdown', 320, 60, svg)) })
    const added = points()
    expect(added).toHaveLength(3)
    expect(added[1].x).toBeCloseTo(0.5, 2)
    expect(added[1].y).toBeCloseTo(0.727, 2)
  })

  it('drags a point to the dragged position', () => {
    const svg = container!.querySelector('svg[aria-label="Curve for intensity"]') as SVGSVGElement
    // Grab the point at (0, 0.5) — SVG (12, 100) — and drag it right.
    act(() => { svg.dispatchEvent(pointer('pointerdown', 12, 100, svg)) })
    // x = (166 - 12) / 616 = 0.25 exactly.
    act(() => { svg.dispatchEvent(pointer('pointermove', 166, 100, svg)) })
    act(() => { svg.dispatchEvent(pointer('pointerup', 166, 100, svg)) })
    const moved = points()
    expect(moved).toHaveLength(2)
    expect(moved[0].x).toBeCloseTo(0.25, 2)
    expect(moved[0].y).toBeCloseTo(0.5, 2)
  })

  it('adds two points in a row where clicked (Jake’s exact case)', () => {
    const svg = container!.querySelector('svg[aria-label="Curve for intensity"]') as SVGSVGElement
    act(() => { svg.dispatchEvent(pointer('pointerdown', 320, 60, svg)) })
    // x = (474 - 12) / 616 = 0.75, y = 1 - (140 - 12) / 176 ≈ 0.273.
    act(() => { svg.dispatchEvent(pointer('pointerdown', 474, 140, svg)) })
    const added = points()
    expect(added).toHaveLength(4)
    expect(added.map((p) => p.x)).toEqual([
      expect.closeTo(0, 2),
      expect.closeTo(0.5, 2),
      expect.closeTo(0.75, 2),
      expect.closeTo(1, 2)
    ])
  })
})
