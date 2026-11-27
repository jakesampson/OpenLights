// @vitest-environment jsdom
// Jake, 20 Nov 2026 (screenshot image-16.png, project "PRBC Default"):
// a fresh 4-LED bar, wheel at Hue 22°, Dimmer at 100%, beams visibly
// coloured in the Preview — yet all twelve per-beam faders read 0.
// The wheel and the Dimmer show their values but the channel faders
// don't, because every fader value was guarded by `activeCue ? … : 0`:
// with no cue active the faders render 0 even when the values exist in
// the manual-overrides layer (Design writes no longer mint a cue, so
// "values exist but no cue is active" is the normal state after
// touching the wheel). The faders must show what the fixture carries —
// overrides, then cue, then defaults — exactly like the wheel and the
// Dimmer already do.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'

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

function sliderValue(label: string) {
  const el = container?.querySelector(`[aria-label="${label}"]`)
  if (!el) throw new Error(`no slider labelled ${label}`)
  return Number(el.getAttribute('aria-valuenow'))
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

const BAR = { id: 'bar', name: 'PAN 4x1x30', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }

// The wheel's fanned write (baseColorChannels): the same RGB on every cell.
const ORANGE = { red: 255, green: 90, blue: 0, red2: 255, green2: 90, blue2: 0, red3: 255, green3: 90, blue3: 0, red4: 255, green4: 90, blue4: 0, intensity: 255 }

describe('channel faders with no active cue', () => {
  it('show the override values the wheel wrote, instead of 0', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({ fixtures: [BAR] }))
    useShowStore.setState({ selectedFixtureIds: ['bar'], activeCueRef: null, editingPresetId: null, editingCueAdHocId: null, manualOverrides: { bar: ORANGE }, showOverrideLabels: false })
    renderInRoot(<DesignTab />)
    expect(sliderValue('Red 1 for selected fixtures')).toBe(255)
    expect(sliderValue('Green 1 for selected fixtures')).toBe(90)
    expect(sliderValue('Blue 1 for selected fixtures')).toBe(0)
    expect(sliderValue('Red2 for selected fixtures')).toBe(255)
    expect(sliderValue('Green2 for selected fixtures')).toBe(90)
    expect(sliderValue('Blue2 for selected fixtures')).toBe(0)
    expect(sliderValue('Red4 for selected fixtures')).toBe(255)
  })

  it('show the fixture defaults when nothing is defined (blue, like the wheel)', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({ fixtures: [BAR] }))
    useShowStore.setState({ selectedFixtureIds: ['bar'], activeCueRef: null, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    renderInRoot(<DesignTab />)
    expect(sliderValue('Red 1 for selected fixtures')).toBe(0)
    expect(sliderValue('Blue 1 for selected fixtures')).toBe(255)
    expect(sliderValue('Blue2 for selected fixtures')).toBe(255)
  })
})
