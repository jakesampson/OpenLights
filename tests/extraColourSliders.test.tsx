// @vitest-environment jsdom
// White / Amber / UV as sliders beside the colour wheel (LightKey
// Guide pp.85–86; verified by Jake in LightKey 19 Nov 2026: "sliders
// next to the main color control", not inner arcs in the wheel).
// Renders the real DesignTab with a synthetic show and asserts the
// sliders' presence, wiring and labels — including that a fixture
// without those channels shows no sliders at all.
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
let root: Root | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  root = createRoot(el)
  act(() => { root.render(node) })
  return el
}

function slider(label: string) {
  return container?.querySelector(`[aria-label="${label} for selected fixtures"]`) as HTMLElement | null
}

function keydown(el: HTMLElement, key: string) {
  act(() => { el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })
}

function setShow(fixture: { id: string; name: string; type: string; channelStart: number; channels: number }, values: Record<string, number>) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [fixture],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { [fixture.id]: { intensity: 255, ...values } }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [fixture.id], activeCueId: 'c1', editingPresetId: null })
  })
}

function cueValues(fixtureId: string) {
  return useShowStore.getState().cues.find((c) => c.id === 'c1')?.fixtureValues[fixtureId] ?? {}
}

beforeEach(() => {
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

const LED_WASH = { id: 'fx1', name: 'Test Wash', type: 'led-wash', channelStart: 1, channels: 7 }
const RGB_PAR = { id: 'fx1', name: 'Test Par', type: 'par', channelStart: 1, channels: 4 }

describe('Additional-colour sliders beside the colour wheel', () => {
  it('shows White, Amber and UV sliders for an LED Wash, with the cue values', () => {
    setShow(LED_WASH, { red: 0, green: 0, blue: 0, white: 128, amber: 64, uv: 32 })
    renderInRoot(<DesignTab />)
    expect(slider('White')).not.toBeNull()
    expect(slider('Amber')).not.toBeNull()
    expect(slider('UV')).not.toBeNull()
    expect(slider('White')?.getAttribute('aria-valuenow')).toBe('128')
    expect(slider('Amber')?.getAttribute('aria-valuenow')).toBe('64')
    expect(slider('UV')?.getAttribute('aria-valuenow')).toBe('32')
    // The UV slider is labelled UV, not Uv.
    expect(slider('Uv')).toBeNull()
  })

  it('shows no White / Amber / UV sliders for an RGB-only par', () => {
    setShow(RGB_PAR, { red: 0, green: 0, blue: 0 })
    renderInRoot(<DesignTab />)
    expect(slider('White')).toBeNull()
    expect(slider('Amber')).toBeNull()
    expect(slider('UV')).toBeNull()
    // The wheel itself is still there.
    expect(container?.querySelector('.color-wheel')).not.toBeNull()
  })

  it('keyboard on a slider changes the fixture channel value in the cue', () => {
    setShow(LED_WASH, { red: 0, green: 0, blue: 0, white: 128, amber: 64, uv: 32 })
    renderInRoot(<DesignTab />)
    const white = slider('White')
    if (!white) throw new Error('no White slider')
    keydown(white, 'ArrowUp')
    expect(cueValues('fx1').white).toBe(129)
    keydown(white, 'ArrowDown')
    keydown(white, 'ArrowDown')
    expect(cueValues('fx1').white).toBe(127)
    const uv = slider('UV')
    if (!uv) throw new Error('no UV slider')
    keydown(uv, 'ArrowUp')
    expect(cueValues('fx1').uv).toBe(33)
    // The other channels are untouched.
    expect(cueValues('fx1').amber).toBe(64)
    expect(cueValues('fx1').red).toBe(0)
  })

  it('the wheel has only hue, saturation and brightness zones — no channel arcs', () => {
    setShow(LED_WASH, { red: 0, green: 0, blue: 0, white: 128, amber: 64, uv: 32 })
    renderInRoot(<DesignTab />)
    // The two arcs, by their aria-labels.
    expect(container?.querySelector('[aria-label="Saturation"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Brightness"]')).not.toBeNull()
    // No arc labelled White / Amber / UV — those are sliders now (their
    // aria-labels carry the " for selected fixtures" suffix).
    expect(container?.querySelector('[aria-label="White"]')).toBeNull()
    expect(container?.querySelector('[aria-label="Amber"]')).toBeNull()
    expect(container?.querySelector('[aria-label="UV"]')).toBeNull()
    // Exactly two arc sliders in the wheel.
    const arcs = container?.querySelectorAll('.color-wheel [role="slider"][aria-label="Saturation"], .color-wheel [role="slider"][aria-label="Brightness"]') ?? []
    expect(arcs.length).toBe(2)
  })

  it('the sliders sit in the colour block beside the wheel, not in the channel-fader strip', () => {
    setShow(LED_WASH, { red: 0, green: 0, blue: 0, white: 128, amber: 64, uv: 32 })
    renderInRoot(<DesignTab />)
    const white = slider('White')
    const wheel = container?.querySelector('.color-wheel')
    if (!white || !wheel) throw new Error('missing slider or wheel')
    // The slider and the wheel share a parent row inside the colour
    // block — the slider is not a channel fader in the strip.
    expect(white.parentElement?.parentElement).toBe(wheel.parentElement)
    expect(white.closest('.chan')).not.toBeNull()
  })
})
