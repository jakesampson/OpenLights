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
import { arcRelAngle, displayHsv } from '../src/renderer/src/lib/colorWheel'
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
  it('preserves the chosen hue and saturation while the colour is black, with brightness defaulting to 100%', () => {
    // Brightness 0: RGB is (0,0,0) and rgbToHsv reports h=0, s=0 — the
    // wheel must still show the hue/saturation it was set to, and the
    // displayed saturation/brightness default to 100% so the wheel
    // works immediately (Jake, 19 Nov 2026).
    expect(displayHsv({ h: 0, s: 0, v: 0 }, { h: 180, s: 80, v: 100 })).toEqual({ h: 180, s: 80, v: 100 })
  })

  it('preserves the hue while the colour is grey', () => {
    expect(displayHsv({ h: 0, s: 0, v: 100 }, { h: 240, s: 60, v: 100 })).toEqual({ h: 240, s: 0, v: 100 })
  })

  it('shows the fixture colour while it is non-degenerate', () => {
    expect(displayHsv({ h: 120, s: 90, v: 75 }, { h: 0, s: 100, v: 100 })).toEqual({ h: 120, s: 90, v: 75 })
  })
})

describe('arcRelAngle — pointer angles clamp to the nearer arc end', () => {
  it('maps angles inside the arc unchanged', () => {
    expect(arcRelAngle(270, 180, 180)).toBe(90)
    expect(arcRelAngle(90, 0, 180)).toBe(90)
  })

  it('clamps past the start (100%) end to the start', () => {
    // Saturation's 100% end is the bottom (180°); just past it the
    // wrapped angle is ~350, which must not become the 0% end.
    expect(arcRelAngle(170, 180, 180)).toBe(0)
    // Brightness's 100% end is the top (0°); just past it the angle
    // wraps to ~355.
    expect(arcRelAngle(355, 0, 180)).toBe(0)
  })

  it('clamps past the finish (0%) end to the finish', () => {
    expect(arcRelAngle(5, 180, 180)).toBe(180)
    expect(arcRelAngle(185, 0, 180)).toBe(180)
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

  it('shows the value popup only while dragging, never on hover', () => {
    renderInRoot(<ColorWheelControl {...props} />)
    // Hover with no button held: no popup (Jake, 19 Nov 2026).
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 38, 75, 0)) })
    expect(tooltipText()).toBeNull()
    // Drag: the popup follows the pointer.
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 38, 75)) })
    expect(tooltipText()).toBe('Saturation: 50')
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 75, 112)) })
    expect(tooltipText()).toBe('Saturation: 100')
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 75, 112, 0)) })
    expect(tooltipText()).toBeNull()
  })

  it('dragging saturation past its 100% end stays at 100% on release', () => {
    // Jake, 19 Nov 2026: dragging the saturation marker off the bottom
    // (100%) end of the left arc jumped the value back to 0 on release
    // — the pointer angle wrapped past the arc start and read as the
    // 0% end. It must clamp to 100% and stay there.
    renderInRoot(<ColorWheelControl {...props} />)
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 38, 75)) })
    expect(props.onHsvChange).toHaveBeenCalledWith({ h: 0, s: 50, v: 100 })
    // Just past the bottom end of the left arc — angle ~170°.
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 81, 111)) })
    expect(props.onHsvChange).toHaveBeenLastCalledWith({ h: 0, s: 100, v: 100 })
    expect(tooltipText()).toBe('Saturation: 100')
    const calls = props.onHsvChange.mock.calls.length
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 81, 111, 0)) })
    // Release recomputes nothing: the last dragged value stands.
    expect(props.onHsvChange.mock.calls.length).toBe(calls)
    expect(tooltipText()).toBeNull()
  })

  it('dragging saturation past its 0% end stays at 0 on release', () => {
    renderInRoot(<ColorWheelControl {...props} />)
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 38, 75)) })
    // Just past the top (0%) end of the left arc — angle ~5°.
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 78, 38)) })
    expect(props.onHsvChange).toHaveBeenLastCalledWith({ h: 0, s: 0, v: 100 })
    expect(tooltipText()).toBe('Saturation: 0')
    const calls = props.onHsvChange.mock.calls.length
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 78, 38, 0)) })
    expect(props.onHsvChange.mock.calls.length).toBe(calls)
  })

  it('dragging brightness past its 100% end (top) stays at 100%', () => {
    // The brightness arc's 100% end is the top (0°); just past it the
    // angle wraps to ~355 and must clamp to 100%, not 0%.
    renderInRoot(<ColorWheelControl {...props} />)
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 112, 75)) })
    expect(props.onHsvChange).toHaveBeenCalledWith({ h: 0, s: 100, v: 50 })
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 71, 38)) })
    expect(props.onHsvChange).toHaveBeenLastCalledWith({ h: 0, s: 100, v: 100 })
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

describe('DesignTab — black fixture starts vivid; brightness 0 must not lock colour selection', () => {
  it('sat/brightness default to 100%; saturation past 100% stays 100%; hue works at brightness 0 and sticks', () => {
    // A synthetic show with one RGB-only par at black in its cue — the
    // same state as the demo's Center Moving Head (red/green/blue all
    // 0). (The store's default show differs between dev and prod, so
    // the test brings its own show instead of relying on the demo
    // fixture IDs.)
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
    const arcValue = (label: string) => container?.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-valuenow')

    // A black fixture: the wheel starts at saturation/brightness 100%
    // (Jake, 19 Nov 2026) so it works immediately, not dead at 0/0.
    expect(arcValue('Saturation')).toBe('100')
    expect(arcValue('Brightness')).toBe('100')
    expect(wheelEl().getAttribute('aria-valuenow')).toBe('0')

    // Saturation dragged past its 100% end (bottom of the left arc)
    // and released: stays 100, no jump back to 0.
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 38, 75)) })
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 81, 111)) })
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 81, 111, 0)) })
    expect(arcValue('Saturation')).toBe('100')

    // Hue to green: the fixture lights up immediately (displayed
    // brightness is 100), it does not wait for a brightness drag.
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 134, 75)) })
    expect(wheelEl().getAttribute('aria-valuenow')).toBe('90')
    expect(cueValues().red).toBe(128)
    expect(cueValues().green).toBe(255)
    expect(cueValues().blue).toBe(0)
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 134, 75, 0)) })

    // Brightness to 0 (drag past the bottom end of the right arc):
    // the fixture goes black.
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 112, 75)) })
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 72, 112)) })
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 72, 112, 0)) })
    expect(cueValues().red).toBe(0)
    expect(cueValues().green).toBe(0)
    expect(cueValues().blue).toBe(0)

    // Hue to blue at brightness 0: the marker moves and sticks, the
    // fixture stays black until the brightness comes back.
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 24, 105)) })
    expect(wheelEl().getAttribute('aria-valuenow')).toBe('240')
    expect(cueValues().red).toBe(0)
    expect(cueValues().green).toBe(0)
    expect(cueValues().blue).toBe(0)
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 24, 105, 0)) })

    // Brightness back to full (top of the right arc): the fixture
    // comes up in the chosen hue, not black or red.
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 75, 38)) })
    expect(cueValues().red).toBe(0)
    expect(cueValues().green).toBe(0)
    expect(cueValues().blue).toBe(255)
    expect(wheelEl().getAttribute('aria-valuenow')).toBe('240')
  })
})
