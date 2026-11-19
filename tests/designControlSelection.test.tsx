// Selection borders in the Design tab (Jake, 19 Nov 2026): the blue
// #0A84FF border means "this control is selected" — the one the
// shortcuts act on. Clicking a control (wheel, Dimmer, a slider, a
// channel fader) selects it; clicking spare space in the panel clears
// every selection. The wheel svg carries its viewBox size as its
// intrinsic size so the colour card sizes to its contents (narrow
// with just the wheel, wider only when the additional sliders are
// present) instead of the replaced-element default leaving a wide
// empty strip on the right.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

function setShow(intensity = 255, type: 'led-wash' | 'moving-head' = 'led-wash') {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [{ id: 'fx1', name: type === 'moving-head' ? 'Test Head' : 'Test Wash', type, channelStart: 1, channels: type === 'moving-head' ? 8 : 7 }],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity, red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0, pan: 128, tilt: 128, gobo: 0, strobe: 0 } }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: ['fx1'], activeCueId: 'c1', editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
  })
}

function colourCard() {
  return container?.querySelector('[data-testid="colour-card"]') as HTMLElement | null
}

function cardIsBordered() {
  return colourCard()?.className.includes('border-[#0A84FF]') ?? false
}

function clickSpareSpace() {
  const root = container?.querySelector('.design-fixture-inspector') as HTMLElement | null
  if (!root) throw new Error('no Design panel root')
  act(() => { root.dispatchEvent(pointer('pointerdown', 5, 5)) })
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

describe('selection borders in the Design tab', () => {
  it('the wheel starts unselected: the card has the plain border, no blue', () => {
    setShow()
    renderInRoot(<DesignTab />)
    expect(cardIsBordered()).toBe(false)
    expect(colourCard()?.className).toContain('border-line')
  })

  it('clicking the wheel selects it: the card gains the blue border', () => {
    setShow()
    renderInRoot(<DesignTab />)
    const wheel = container?.querySelector('.color-wheel') as HTMLElement | null
    if (!wheel) throw new Error('no colour wheel')
    act(() => { wheel.dispatchEvent(pointer('pointerdown', 75, 75)) })
    expect(cardIsBordered()).toBe(true)
  })

  it('clicking spare space clears the wheel selection', () => {
    setShow()
    renderInRoot(<DesignTab />)
    const wheel = container?.querySelector('.color-wheel') as HTMLElement | null
    if (!wheel) throw new Error('no colour wheel')
    act(() => { wheel.dispatchEvent(pointer('pointerdown', 75, 75)) })
    expect(cardIsBordered()).toBe(true)
    clickSpareSpace()
    expect(cardIsBordered()).toBe(false)
  })

  it('clicking the Dimmer selects it and deselects the wheel', () => {
    setShow()
    renderInRoot(<DesignTab />)
    const wheel = container?.querySelector('.color-wheel') as HTMLElement | null
    const dimmer = slider('Dimmer')
    if (!wheel || !dimmer) throw new Error('missing wheel or Dimmer')
    act(() => { wheel.dispatchEvent(pointer('pointerdown', 75, 75)) })
    expect(cardIsBordered()).toBe(true)
    act(() => { dimmer.dispatchEvent(pointer('pointerdown', 75, 75)) })
    expect(dimmer.className).toContain('design-fader-selected')
    expect(cardIsBordered()).toBe(false)
  })

  it('clicking spare space clears a fader selection', () => {
    setShow()
    renderInRoot(<DesignTab />)
    const dimmer = slider('Dimmer')
    if (!dimmer) throw new Error('no Dimmer')
    act(() => { dimmer.dispatchEvent(pointer('pointerdown', 75, 75)) })
    expect(dimmer.className).toContain('design-fader-selected')
    clickSpareSpace()
    expect(slider('Dimmer')?.className).not.toContain('design-fader-selected')
  })

  it('clicking a White slider selects that slider, not the wheel', () => {
    setShow()
    renderInRoot(<DesignTab />)
    const white = slider('White')
    if (!white) throw new Error('no White slider')
    act(() => { white.dispatchEvent(pointer('pointerdown', 75, 75)) })
    expect(white.className).toContain('design-fader-selected')
    expect(cardIsBordered()).toBe(false)
  })

  it('clicking a channel fader selects it, and the selection follows focus', () => {
    // A moving head: its Gobo/Strobe faders are the channel-fader
    // strip (an LED wash's colour channels live on the wheel, not
    // as faders), and pan/tilt become the Position pad.
    setShow(255, 'moving-head')
    renderInRoot(<DesignTab />)
    const gobo = slider('Gobo')
    if (!gobo) throw new Error('no Gobo channel fader')
    act(() => { gobo.dispatchEvent(pointer('pointerdown', 75, 75)) })
    expect(gobo.className).toContain('design-fader-selected')
    // Tabbing into the Dimmer moves the selection to it.
    const dimmer = slider('Dimmer')
    if (!dimmer) throw new Error('no Dimmer')
    act(() => { dimmer.focus() })
    expect(slider('Dimmer')?.className).toContain('design-fader-selected')
    expect(slider('Gobo')?.className).not.toContain('design-fader-selected')
  })

  it('the bordered fader is the one the arrow keys adjust; spare space blurs it', () => {
    setShow(100)
    renderInRoot(<DesignTab />)
    const dimmer = slider('Dimmer')
    if (!dimmer) throw new Error('no Dimmer')
    act(() => { dimmer.focus() })
    expect(dimmer.className).toContain('design-fader-selected')
    keydown(dimmer, 'ArrowUp')
    expect(slider('Dimmer')?.getAttribute('aria-valuenow')).toBe('101')
    // Spare space clears the border AND blurs the control, so the
    // arrow keys stop adjusting it.
    clickSpareSpace()
    expect(slider('Dimmer')?.className).not.toContain('design-fader-selected')
    expect(document.activeElement).not.toBe(dimmer)
  })
})

describe('colour card sizes to its contents', () => {
  it('the wheel svg carries its viewBox size (220) as its intrinsic size', () => {
    setShow()
    renderInRoot(<DesignTab />)
    const svg = container?.querySelector('.color-wheel svg') as SVGSVGElement | null
    if (!svg) throw new Error('no wheel svg')
    // The attributes are the intrinsic size the card's content-based
    // width follows; CSS 100% still fills the stretched box.
    expect(svg.getAttribute('width')).toBe('220')
    expect(svg.getAttribute('height')).toBe('220')
    expect(svg.style.width).toBe('100%')
    expect(svg.style.height).toBe('100%')
    // The card itself carries no fixed width — its width comes from
    // its contents (the wheel, plus the sliders when present).
    expect(colourCard()?.className).not.toMatch(/\bw-\d/)
  })
})
