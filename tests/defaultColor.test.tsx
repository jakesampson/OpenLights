// @vitest-environment jsdom
// Default colour (LightKey Guide pp.85, 114 — Piece 11): a fixture whose
// Colour is not defined shows LightKey's default colour, normally blue,
// and the Colour property menu offers Set as Default / Load Default /
// Reset Default. Renders the real DesignTab with a synthetic show.
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

function click(el: HTMLElement) {
  act(() => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
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
    useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [fixture.id], activeCueId: 'c1', editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
  })
}

function cueValues(fixtureId: string) {
  return useShowStore.getState().cues.find((c) => c.id === 'c1')?.fixtureValues[fixtureId] ?? {}
}

function fixtureDefaults(fixtureId: string) {
  return useShowStore.getState().show?.fixtures.find((f) => f.id === fixtureId)?.defaultValues ?? {}
}

function wheelValue(label: string) {
  return container?.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-valuenow')
}

function centreHex() {
  return (container?.querySelector('[aria-label="Colour — open system colour picker"]') as HTMLInputElement | null)?.value
}

function menuItem(label: string) {
  return (Array.from(container?.querySelectorAll('[role="menuitem"]') ?? []).find((el) => el.textContent === label) as HTMLElement | undefined) ?? null
}

function openColourMenu() {
  const button = container?.querySelector('[aria-label="Colour options"]') as HTMLElement | null
  if (!button) throw new Error('no Colour menu button')
  click(button)
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

describe('Default colour (blue) and the Colour default menu', () => {
  it('shows blue on the wheel when no colour is defined in the cue', () => {
    setShow(LED_WASH, {})
    renderInRoot(<DesignTab />)
    expect(wheelValue('Colour hue')).toBe('240')
    expect(wheelValue('Saturation')).toBe('100')
    expect(wheelValue('Brightness')).toBe('100')
    expect(centreHex()).toBe('#0000ff')
  })

  it('shows the defined colour instead of the default', () => {
    setShow(LED_WASH, { red: 255, green: 0, blue: 0 })
    renderInRoot(<DesignTab />)
    expect(wheelValue('Colour hue')).toBe('0')
    expect(centreHex()).toBe('#ff0000')
  })

  it('Set as Default stores the current colour, Load Default applies it, Reset Default restores blue', () => {
    setShow(LED_WASH, { red: 255, green: 0, blue: 0 })
    renderInRoot(<DesignTab />)
    // No custom default yet: the menu offers Load but not Reset.
    openColourMenu()
    expect(menuItem('Set as Default')).not.toBeNull()
    expect(menuItem('Load Default')).not.toBeNull()
    expect(menuItem('Reset Default')).toBeNull()
    click(menuItem('Set as Default')!)
    expect(fixtureDefaults('fx1')).toEqual({ red: 255, green: 0, blue: 0 })
    // Change the cue colour to green, then load the stored default back.
    act(() => { useShowStore.getState().setSelectedBaseColor({ red: 0, green: 255, blue: 0 }) })
    expect(cueValues('fx1')).toMatchObject({ red: 0, green: 255, blue: 0 })
    openColourMenu()
    expect(menuItem('Reset Default')).not.toBeNull()
    click(menuItem('Load Default')!)
    // Load Default defines an override (LightKey's real Overrides) —
    // the cue keeps its green until Add Overrides merges it in.
    expect(useShowStore.getState().manualOverrides.fx1).toMatchObject({ red: 255, green: 0, blue: 0 })
    expect(cueValues('fx1')).toMatchObject({ red: 0, green: 255, blue: 0 })
    // Reset clears the custom default; loading the default now gives
    // the built-in blue, and Reset leaves the menu.
    openColourMenu()
    click(menuItem('Reset Default')!)
    expect(fixtureDefaults('fx1')).toEqual({})
    openColourMenu()
    expect(menuItem('Reset Default')).toBeNull()
    click(menuItem('Load Default')!)
    expect(useShowStore.getState().manualOverrides.fx1).toMatchObject({ red: 0, green: 0, blue: 255 })
    expect(centreHex()).toBe('#0000ff')
  })
})
