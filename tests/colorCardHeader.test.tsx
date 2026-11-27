// LightKey-style colour card header (Jake, 19 Nov 2026, LightKey
// screenshots 8.57.26–8.57.58pm): the card above the wheel shows the
// active property top-left and its value top-right — "Hue 67°",
// "Saturation 61 %", "Brightness 98 %", "Off" at 0 and "Full" at 100
// for the percent properties, and "Color" with no value when nothing
// has been adjusted yet. The additional-colour sliders switch it to
// their LightKey property name (Cool White / Ultraviolet / Amber /
// Lime). The header tracks the last-adjusted property and persists
// after the drag ends.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const root = resolve(__dirname, '..')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')
const RECT = { left: 0, top: 0, width: 150, height: 150, right: 150, bottom: 150, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(node) })
  return el
}

function slider(label: string) {
  return container?.querySelector(`[aria-label="${label} for selected fixtures"]`) as HTMLElement | null
}

function keydown(el: HTMLElement, key: string) {
  act(() => { el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
}

function pointer(type: string, x: number, y: number, buttons = 1) {
  return new window.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons, pointerId: 1 })
}

function setShow(values: Record<string, number>) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  // Inline cues (Jake, 27 Nov 2026): the cue lives in the Live button
  // that holds it, and the active cue is that holder's reference.
  const cue = { id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity: 255, ...values } }, fadeMs: 0 }
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [{ id: 'fx1', name: 'Test Wash', type: 'led-wash', channelStart: 1, channels: 7 }],
    livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', presetIds: [], cue, x: 0, y: 0 }] }]
  }
  act(() => {
    useShowStore.setState({ show, presets: [], cueLists: [], selectedFixtureIds: ['fx1'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
  })
}

function header() {
  return container?.querySelector('[data-testid="colour-card-header"]') as HTMLElement | null
}

function headerValue() {
  return container?.querySelector('[data-testid="colour-card-header-value"]')?.textContent ?? null
}

function arc(label: string) {
  return container?.querySelector(`[aria-label="${label}"]`) as HTMLElement | null
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
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

describe('colour card header', () => {
  it('idle: shows "Color" with no value', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[data-testid="colour-card"]')).not.toBeNull()
    expect(header()?.textContent).toContain('Color')
    expect(headerValue()).toBeNull()
  })

  it('dragging the hue ring shows "Hue N°" and it persists after release', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const wheel = container?.querySelector('.color-wheel') as HTMLElement | null
    if (!wheel) throw new Error('no colour wheel')
    // Pointer down on the hue ring at 90° (134, 75 in the 150px box).
    act(() => { wheel.dispatchEvent(pointer('pointerdown', 134, 75)) })
    act(() => { wheel.dispatchEvent(pointer('pointerup', 134, 75, 0)) })
    expect(header()?.textContent).toContain('Hue')
    expect(headerValue()).toBe('90°')
    expect(arc('Colour hue')?.getAttribute('aria-valuenow')).toBe('90')
  })

  it('saturation to 0 shows "Saturation Off"', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const sat = arc('Saturation')
    if (!sat) throw new Error('no saturation arc')
    // PageDown steps 25 at a time: 100 → 0.
    keydown(sat, 'PageDown')
    keydown(arc('Saturation') ?? sat, 'PageDown')
    keydown(arc('Saturation') ?? sat, 'PageDown')
    keydown(arc('Saturation') ?? sat, 'PageDown')
    expect(header()?.textContent).toContain('Saturation')
    expect(headerValue()).toBe('Off')
  })

  it('saturation to 100 shows "Saturation Full"', () => {
    // From 50% (255, 128, 128): PageUp ×2 → 100.
    setShow({ red: 255, green: 128, blue: 128, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const sat = arc('Saturation')
    if (!sat) throw new Error('no saturation arc')
    keydown(sat, 'PageUp')
    keydown(arc('Saturation') ?? sat, 'PageUp')
    expect(header()?.textContent).toContain('Saturation')
    expect(headerValue()).toBe('Full')
  })

  it('brightness to 0 shows "Brightness Off"', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const bri = arc('Brightness')
    if (!bri) throw new Error('no brightness arc')
    keydown(bri, 'PageDown')
    keydown(arc('Brightness') ?? bri, 'PageDown')
    keydown(arc('Brightness') ?? bri, 'PageDown')
    keydown(arc('Brightness') ?? bri, 'PageDown')
    expect(header()?.textContent).toContain('Brightness')
    expect(headerValue()).toBe('Off')
  })

  it('brightness to 100 shows "Brightness Full"', () => {
    // From 50% brightness (128, 0, 0): PageUp ×2 → 100.
    setShow({ red: 128, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const bri = arc('Brightness')
    if (!bri) throw new Error('no brightness arc')
    keydown(bri, 'PageUp')
    keydown(arc('Brightness') ?? bri, 'PageUp')
    expect(header()?.textContent).toContain('Brightness')
    expect(headerValue()).toBe('Full')
  })

  it('mid values show a percent with a space ("61 %")', () => {
    setShow({ red: 255, green: 128, blue: 128, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const sat = arc('Saturation')
    if (!sat) throw new Error('no saturation arc')
    // 50% + 25 → 75%.
    keydown(sat, 'PageUp')
    expect(header()?.textContent).toContain('Saturation')
    expect(headerValue()).toBe('75 %')
  })

  it('moving a White slider switches the header to "Cool White"', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const white = slider('White')
    if (!white) throw new Error('no White slider')
    keydown(white, 'PageUp')
    expect(header()?.textContent).toContain('Cool White')
    expect(headerValue()).toBe('10 %')
  })

  it('White at full shows "Cool White Full"', () => {
    // From 230, one PageUp lands on 255.
    setShow({ red: 255, green: 0, blue: 0, white: 230, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const white = slider('White')
    if (!white) throw new Error('no White slider')
    keydown(white, 'PageUp')
    expect(header()?.textContent).toContain('Cool White')
    expect(headerValue()).toBe('Full')
  })

  it('moving the UV and Amber sliders switches the header to their LightKey names', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const uv = slider('UV')
    if (!uv) throw new Error('no UV slider')
    keydown(uv, 'PageUp')
    expect(header()?.textContent).toContain('Ultraviolet')
    expect(headerValue()).toBe('10 %')
    const amber = slider('Amber')
    if (!amber) throw new Error('no Amber slider')
    keydown(amber, 'PageUp')
    expect(header()?.textContent).toContain('Amber')
    expect(headerValue()).toBe('10 %')
  })

  it('the Colour options menu (fanning, Set/Load Default) is still reachable from the header', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const menu = container?.querySelector('[aria-label="Colour options"]') as HTMLElement | null
    expect(menu).not.toBeNull()
    act(() => { menu?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    const text = container?.textContent ?? ''
    expect(text).toContain('Add Colour Fanning…')
    expect(text).toContain('Set as Default')
    expect(text).toContain('Load Default')
  })
})

describe('Dimmer and colour card stretch to fill the panel height', () => {
  it('the wheel is a square box stretched to the card body, not a fixed 150px', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const wheel = container?.querySelector('.color-wheel') as HTMLElement | null
    if (!wheel) throw new Error('no colour wheel')
    const wrapper = wheel.parentElement
    expect(wrapper?.className).toContain('aspect-square')
    expect(wrapper?.className).toContain('self-stretch')
    // The card itself is the flexible part of its column.
    expect(container?.querySelector('[data-testid="colour-card"]')?.className).toContain('flex-1')
  })

  it('the Dimmer fader is the flexible part of its column', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const dimmer = container?.querySelector('[aria-label="Dimmer for selected fixtures"]')
    expect(dimmer?.className).toContain('design-fill-track')
    // The track's CSS makes it fill the column height (flex: 1).
    expect(css).toMatch(/\.design-fill-track \{[^}]*flex: 1 1 auto/s)
  })

  it('the additional sliders sit in the same card body as the wheel', () => {
    setShow({ red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 })
    renderInRoot(<DesignTab />)
    const white = slider('White')
    const wheel = container?.querySelector('.color-wheel')
    if (!white || !wheel) throw new Error('missing slider or wheel')
    expect(white.closest('[data-testid="colour-card"]')).toBe(wheel.closest('[data-testid="colour-card"]'))
    expect(white.closest('.chan')).not.toBeNull()
  })
})
