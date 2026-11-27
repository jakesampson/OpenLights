// @vitest-environment jsdom
// Beam 1's own RGB sliders (Jake, 20 Nov 2026, voice call): the linked
// wheel drives every beam of a multipart fixture, and beams 2–4 already
// had per-beam sliders — but beam 1's bare `red`/`green`/`blue` are the
// wheel's own keys, so there was no way to set LED 1 on its own: using
// the wheel for LED 1 re-drove all the others. Beam 1 now gets its own
// sliders (Red 1 / Green 1 / Blue 1) that write only its first cell.
// Bug 2 (same call) is covered here too: with a beam selected, a Dimmer
// drag was silently dropped — updateSelectedBeamValues only wrote
// attributes the beam owns, and `intensity` is a fixture attribute, not
// a beam one — so colour set + Dimmer full still left the fixture dark.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore, findInlineCue } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import { resolveCue } from '../src/shared/cueResolution'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

function sliderEl(label: string) {
  const el = container?.querySelector(`[aria-label="${label}"]`)
  if (!el) throw new Error(`no slider labelled ${label}`)
  return el as HTMLElement
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
const PAR = { id: 'par', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }

function cueValues(fixtureId: string) {
  const state = useShowStore.getState()
  return findInlineCue(state.show, state.cueLists, 'c1')?.cue.fixtureValues[fixtureId] ?? {}
}

// A cue survives migration only in a holder (Jake, 27 Nov 2026 —
// inline cues): the seed button below carries it, so the migrated
// show keeps the cue and the tests can activate it. A fresh object
// per seed — migrateShow shallow-copies its input and writes the
// inlined cue onto the button, so a shared const would leak the first
// test's cue values into every later test.
const cuePage = () => ({ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', cueId: 'c1', presetIds: [] }] })

describe('beam 1 sliders on a multipart fixture', () => {
  it('shows Red 1 / Green 1 / Blue 1 sliders for the 4-LED bar', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [BAR],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { bar: { intensity: 255, red: 0, green: 0, blue: 0 } } }]
   ,
      livePages: [cuePage()]
    }))
    useShowStore.setState({ selectedFixtureIds: ['bar'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    renderInRoot(<DesignTab />)
    expect(sliderEl('Red 1 for selected fixtures')).toBeTruthy()
    expect(sliderEl('Green 1 for selected fixtures')).toBeTruthy()
    expect(sliderEl('Blue 1 for selected fixtures')).toBeTruthy()
  })

  it('dragging Red 1 to full moves only LED 1 — beams 2–4 stay put', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [BAR],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { bar: { intensity: 255, red: 0, green: 0, blue: 0, red2: 0, green2: 0, blue2: 0, red3: 0, green3: 0, blue3: 0, red4: 0, green4: 0, blue4: 0 } } }]
   ,
      livePages: [cuePage()]
    }))
    useShowStore.setState({ selectedFixtureIds: ['bar'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    renderInRoot(<DesignTab />)
    // Pointer at the top of the 150-tall mocked track: full (255).
    act(() => { sliderEl('Red 1 for selected fixtures').dispatchEvent(pointer('pointerdown', 75, 0)) })
    // A Design write defines an override, not a cue edit — and only
    // LED 1's red is overridden; beams 2–4 stay put.
    expect(s().manualOverrides.bar).toMatchObject({ red: 255 })
    expect(s().manualOverrides.bar.red2).toBeUndefined()
    expect(s().manualOverrides.bar.red3).toBeUndefined()
    expect(s().manualOverrides.bar.red4).toBeUndefined()
    expect(cueValues('bar').red).toBe(0)
    // And the slider reads its own beam back.
    expect(sliderEl('Red 1 for selected fixtures').getAttribute('aria-valuenow')).toBe('255')
  })

  it('shows no beam-1 sliders for a single-beam fixture — the wheel already is its beam 1', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [PAR],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { par: { intensity: 255, red: 0, green: 0, blue: 0 } } }]
   ,
      livePages: [cuePage()]
    }))
    useShowStore.setState({ selectedFixtureIds: ['par'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[aria-label="Red 1 for selected fixtures"]')).toBeNull()
    expect(container?.querySelector('[aria-label="Green 1 for selected fixtures"]')).toBeNull()
  })
})

describe('beam-selected writes keep fixture-level attributes (Bug 2)', () => {
  it('a Dimmer write with a beam selected lands on the fixture instead of being dropped', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [BAR],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { bar: { intensity: 0, red: 255, green: 0, blue: 0 } } }]
   ,
      livePages: [cuePage()]
    }))
    useShowStore.setState({ selectedFixtureIds: ['bar'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    s().selectFixtureBeam('bar', 'cell-2')
    s().updateSelectedBeamValues({ intensity: 200 })
    expect(cueValues('bar').intensity).toBe(200)
    // The colour write that came with it still only moves the beam.
    s().updateSelectedBeamValues({ red: 100 })
    expect(cueValues('bar')).toMatchObject({ red2: 100 })
    expect(cueValues('bar').red).toBe(255)
  })

  it('updateBeamValues writes one explicit beam without needing it selected', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [BAR],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { bar: { intensity: 255, red: 0, green: 0, blue: 0, red2: 0, green2: 0, blue2: 0, red3: 0, green3: 0, blue3: 0, red4: 0, green4: 0, blue4: 0 } } }]
   ,
      livePages: [cuePage()]
    }))
    useShowStore.setState({ selectedFixtureIds: ['bar'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    s().updateBeamValues('bar', 'cell-1', { red: 120 })
    expect(cueValues('bar')).toMatchObject({ red: 120 })
    expect(cueValues('bar').red2).toBe(0)
    expect(cueValues('bar').red3).toBe(0)
    expect(cueValues('bar').red4).toBe(0)
  })

  it('wheel colour + full Dimmer on a single fixture reaches the DMX frame', () => {
    // Lock-in for the working path: the overnight suspects (multipart
    // fan-out, dimmer limits, shutter) were exonerated for standard
    // fixtures — a PAR at ch 1 must produce intensity + red on the wire.
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [PAR],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { par: { intensity: 0, red: 0, green: 0, blue: 255 } } }]
   ,
      livePages: [cuePage()]
    }))
    useShowStore.setState({ selectedFixtureIds: ['par'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    s().setSelectedBaseColor({ red: 255, green: 0, blue: 0 })
    s().updateSelectedFixtures({ intensity: 255 })
    const state = s()
    const cue = findInlineCue(state.show, state.cueLists, 'c1')!.cue
    const fixtures = state.show?.fixtures ?? []
    const frame = computeCueChannels(fixtures, resolveCue(cue, [], fixtures), 255, true)
    expect(frame).toEqual({ 1: 255, 2: 255, 3: 0, 4: 0 })
  })
})
