// @vitest-environment jsdom
// Real pointer interaction tests for the round Color control (LightKey
// Guide p.82–85) — the earlier tests were source-text assertions only,
// so a dead drag path passed them. These dispatch real PointerEvents
// into a rendered wheel and assert the callbacks, the marker and the
// value popup — including the two Jake bugs from 19 Nov 2026: the wheel
// looking dead on a black fixture / at brightness 0 (hue is lost in the
// RGB round-trip), and the `Label: value` popup replacing the white
// marker while dragging.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { ColorWheelControl } from '../src/renderer/src/components/ColorWheelControl'
import { displayHsv } from '../src/renderer/src/lib/colorWheel'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The wheel renders 150×150 at the origin in these tests — the same
// geometry its pointer math assumes (viewBox 220 over a 150px box).
const RECT = { left: 0, top: 0, width: 150, height: 150, right: 150, bottom: 150, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

function pointer(type: string, x: number, y: number, buttons = 1) {
  return new window.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons, pointerId: 1 })
}

let container: HTMLDivElement | undefined
let root: Root | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  root = createRoot(el)
  act(() => { root.render(node) })
  return el
}

function wheelEl() {
  const el = container?.querySelector('.color-wheel')
  if (!el) throw new Error('no .color-wheel in the rendered output')
  return el as HTMLElement
}

function whiteMarkers() {
  return container?.querySelectorAll('line[stroke="#fff"]').length ?? 0
}

function tooltipText() {
  return container?.querySelector('.color-wheel-tooltip')?.textContent ?? null
}

beforeEach(() => {
  // jsdom has no pointer capture — the wheel calls it on pointerdown.
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.getBoundingClientRect = () => RECT as unknown as DOMRect
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  root = undefined
  container?.remove()
  container = undefined
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

describe('displayHsv — hue/saturation are independent of brightness', () => {
  it('preserves the chosen hue and saturation while the colour is black', () => {
    // Brightness 0: RGB is (0,0,0) and rgbToHsv reports h=0, s=0 — the
    // wheel must still show the hue/saturation it was set to.
    expect(displayHsv({ h: 0, s: 0, v: 0 }, { h: 180, s: 80 })).toEqual({ h: 180, s: 80, v: 0 })
  })

  it('preserves the hue while the colour is grey', () => {
    expect(displayHsv({ h: 0, s: 0, v: 100 }, { h: 240, s: 60 })).toEqual({ h: 240, s: 0, v: 100 })
  })

  it('shows the fixture colour while it is non-degenerate', () => {
    expect(displayHsv({ h: 120, s: 90, v: 75 }, { h: 0, s: 100 })).toEqual({ h: 120, s: 90, v: 75 })
  })
})

describe('ColorWheelControl — pointer interaction', () => {
  const props = {
    hsv: { h: 0, s: 100, v: 100 },
    extraChannels: [],
    centreHex: '#ff0000',
    onHsvChange: vi.fn(),
    onExtraChange: vi.fn(),
    onCentrePick: vi.fn()
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('clicking the hue ring sets the hue and shows a Hue popup', () => {
    renderInRoot(<ColorWheelControl {...props} />)
    // Right side of the ring (green, 90°) — rendered (134, 75).
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 134, 75)) })
    expect(props.onHsvChange).toHaveBeenCalledWith({ h: 90, s: 100, v: 100 })
    expect(tooltipText()).toBe('Hue: 90')
    // The dragged zone's white marker is hidden while dragging.
    expect(whiteMarkers()).toBe(2)
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 134, 75, 0)) })
    expect(tooltipText()).toBeNull()
    expect(whiteMarkers()).toBe(3)
  })

  it('dragging the hue ring follows the pointer and ends on release', () => {
    renderInRoot(<ColorWheelControl {...props} />)
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 134, 75)) })
    // Left side of the ring (blue, 270°) — rendered (16, 75).
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 16, 75)) })
    expect(props.onHsvChange).toHaveBeenCalledWith({ h: 270, s: 100, v: 100 })
    expect(tooltipText()).toBe('Hue: 270')
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 16, 75, 0)) })
    // A later hover-back move (no button held) must not re-engage.
    const calls = props.onHsvChange.mock.calls.length
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 134, 75, 0)) })
    expect(props.onHsvChange.mock.calls.length).toBe(calls)
  })

  it('dragging the saturation arc sets saturation with a Saturation popup', () => {
    renderInRoot(<ColorWheelControl {...props} />)
    // Middle of the left (saturation) arc — rendered (38, 75).
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 38, 75)) })
    expect(props.onHsvChange).toHaveBeenCalledWith({ h: 0, s: 50, v: 100 })
    expect(tooltipText()).toBe('Saturation: 50')
    expect(whiteMarkers()).toBe(2)
  })

  it('dragging the brightness arc sets brightness with a Brightness popup', () => {
    renderInRoot(<ColorWheelControl {...props} />)
    // Top of the right (brightness) arc — rendered (75, 38).
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 75, 38)) })
    expect(props.onHsvChange).toHaveBeenCalledWith({ h: 0, s: 100, v: 100 })
    expect(tooltipText()).toBe('Brightness: 100')
  })

  it('clicking the centre disc does not change the hue', () => {
    renderInRoot(<ColorWheelControl {...props} />)
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 75, 75)) })
    expect(props.onHsvChange).not.toHaveBeenCalled()
    expect(tooltipText()).toBeNull()
  })

  it('is inert when disabled', () => {
    renderInRoot(<ColorWheelControl {...props} disabled />)
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 134, 75)) })
    expect(props.onHsvChange).not.toHaveBeenCalled()
    expect(tooltipText()).toBeNull()
  })
})

describe('DesignTab — brightness 0 must not lock colour selection', () => {
  it('hue drags at brightness 0 move the marker and stick; brightness back up shows the chosen hue', () => {
    // A synthetic show with one RGB-only par at black in its cue — the
    // same state as the demo's Center Moving Head (red/green/blue all
    // 0). Before the fix the wheel was dead on it: every hue change
    // round-tripped through black and the marker never moved. (The
    // store's default show differs between dev and prod, so the test
    // brings its own show instead of relying on the demo fixtures.)
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const show = {
      ...base,
      id: 'test-show',
      fixtures: [{ id: 'fx1', name: 'Test Par', type: 'par', channelStart: 1, channels: 4 }],
      cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity: 255, red: 0, green: 0, blue: 0 } }, fadeMs: 0 }]
    }
    act(() => {
      useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: ['fx1'], activeCueId: 'c1', editingPresetId: null })
    })
    renderInRoot(<DesignTab />)
    const cueValues = () => useShowStore.getState().cues.find((c) => c.id === 'c1')?.fixtureValues['fx1'] ?? {}
    expect(wheelEl().getAttribute('aria-valuenow')).toBe('0')

    // Saturation to full first (bottom of the left arc — (75, 112)).
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 75, 112)) })
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 75, 112, 0)) })
    // Hue to green at brightness 0 (right of the ring — (134, 75)).
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 134, 75)) })
    expect(wheelEl().getAttribute('aria-valuenow')).toBe('90')
    expect(tooltipText()).toBe('Hue: 90')
    // The fixture is still black — the hue lives in the wheel's own
    // state until the brightness comes back — but the marker moved.
    expect(cueValues().red).toBe(0)
    expect(cueValues().green).toBe(0)
    expect(cueValues().blue).toBe(0)
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 134, 75, 0)) })

    // Brightness back to full (top of the right arc — (75, 38)): the
    // fixture must come up in the chosen hue, not black or red.
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 75, 38)) })
    expect(cueValues().red).toBe(128)
    expect(cueValues().green).toBe(255)
    expect(cueValues().blue).toBe(0)
    expect(wheelEl().getAttribute('aria-valuenow')).toBe('90')
  })
})
