// @vitest-environment jsdom
// The virtual dimmer (LightKey, verified 19 Nov 2026 from Jake's RGBAW
// fixture): a fixture with colour channels but no dimmer channel still
// gets a working Dimmer fader in the Design panel — it writes an
// intensity value into the cue and the output scales the fixture's LED
// channels by it. Renders the real DesignTab with a synthetic show.
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
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { [fixture.id]: { ...values } }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [fixture.id], activeCueId: 'c1', editingPresetId: null })
  })
}

function cueValues(fixtureId: string) {
  return useShowStore.getState().cues.find((c) => c.id === 'c1')?.fixtureValues[fixtureId] ?? {}
}

function dimmerFader() {
  return container?.querySelector('[aria-label="Dimmer for selected fixtures"]') as HTMLElement | null
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

// Simger Q12BT: RGBA, 4 channels, no dimmer channel — the virtual
// dimmer applies. LED Wash: RGBAW+UV with a dimmer channel — hardware
// dims, and the fader behaves as before.
const RGBA = { id: 'fx1', name: 'Test RGBA', type: 'rgba-4ch', channelStart: 1, channels: 4 }
const LED_WASH = { id: 'fx1', name: 'Test Wash', type: 'led-wash', channelStart: 1, channels: 7 }

describe('Virtual dimmer in the Design panel', () => {
  it('enables the Dimmer fader for a fixture with no dimmer channel', () => {
    setShow(RGBA, { red: 255, green: 0, blue: 0 })
    renderInRoot(<DesignTab />)
    const fader = dimmerFader()
    expect(fader).not.toBeNull()
    expect(fader?.getAttribute('aria-disabled')).toBeNull()
    // The wheel is there too — this is a colour fixture.
    expect(container?.querySelector('.color-wheel')).not.toBeNull()
  })

  it('reads full open when the virtual dimmer is not set, and the cue value when it is', () => {
    setShow(RGBA, { red: 255, green: 0, blue: 0 })
    renderInRoot(<DesignTab />)
    expect(dimmerFader()?.getAttribute('aria-valuenow')).toBe('255')
    expect(container?.textContent).toContain('100%')
  })

  it('reads the cue intensity for a virtual-dimmer fixture', () => {
    setShow(RGBA, { intensity: 128, red: 255, green: 0, blue: 0 })
    renderInRoot(<DesignTab />)
    expect(dimmerFader()?.getAttribute('aria-valuenow')).toBe('128')
    expect(container?.textContent).toContain('50%')
  })

  it('keyboard on the Dimmer fader writes the intensity into the cue', () => {
    setShow(RGBA, { intensity: 128, red: 255, green: 0, blue: 0 })
    renderInRoot(<DesignTab />)
    const fader = dimmerFader()
    if (!fader) throw new Error('no Dimmer fader')
    keydown(fader, 'ArrowUp')
    expect(cueValues('fx1').intensity).toBe(129)
    keydown(fader, 'ArrowDown')
    keydown(fader, 'ArrowDown')
    expect(cueValues('fx1').intensity).toBe(127)
    // The colour is untouched by the dimmer.
    expect(cueValues('fx1').red).toBe(255)
  })

  it('reads the cue intensity as before for a fixture with a dimmer channel', () => {
    setShow(LED_WASH, { intensity: 128, red: 255, green: 0, blue: 0 })
    renderInRoot(<DesignTab />)
    expect(dimmerFader()?.getAttribute('aria-valuenow')).toBe('128')
    expect(container?.textContent).toContain('50%')
  })
})
