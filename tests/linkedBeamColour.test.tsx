// @vitest-environment jsdom
// Linked beam colour (Jake, 19 Nov 2026, voice call): his Event Lighting
// PAN 4x1x30 bar showed one colour wheel driving beam 1 only, with beams
// 2–4 as red/green/blue sliders. First step: ONE wheel drives all four
// LEDs together — the wheel writes every beam's colour channels and reads
// the average across the beams, so the wheel shows the colour it writes.
// The per-beam sliders stay as the individual-beam control: moving one
// separates that beam until the wheel moves again and re-links them.
// The four-wheel variant is the later step, not built here.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore, findInlineCue } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { importOflFixture } from '../src/shared/oflFixtureFormat'
import type { FixtureDef } from '../src/shared/types'

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

function wheelEl() {
  const el = container?.querySelector('.color-wheel')
  if (!el) throw new Error('no .color-wheel in the rendered output')
  return el as HTMLElement
}

function wheelValue(label: string) {
  return container?.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-valuenow')
}

function centreHex() {
  return (container?.querySelector('[aria-label="Colour — open system colour picker"]') as HTMLInputElement | null)?.value
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

// Jake's bar itself: the built-in PAN 4x1x30 (17ch) — four beams, the
// built-in "red2" spelling. The OFL 4Bar below covers the "red 2"
// spelling.
const PAN = { id: 'bar', name: 'PAN 4x1x30', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }

const ALL_GREEN: Record<string, number> = {
  red: 0, green: 255, blue: 0,
  red2: 0, green2: 255, blue2: 0,
  red3: 0, green3: 255, blue3: 0,
  red4: 0, green4: 255, blue4: 0
}

const cuePage = (cueId: string) => ({ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue', type: 'push', cueId, presetIds: [] }] })

// A seeded cue, read through its holder (Jake, 27 Nov 2026 —
// inline cues: there is no project-wide `cues` slice any more).
const cueS = () => {
  const state = useShowStore.getState()
  return findInlineCue(state.show, state.cueLists, 's')!.cue
}

function setShow(fixture: { id: string; name: string; type: string; channelStart: number; channels: number }, values: Record<string, number>, extra: Record<string, unknown> = {}) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [fixture],
    livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', cue: { id: 'c1', name: 'Cue 1', fixtureValues: { [fixture.id]: { intensity: 255, ...values } }, fadeMs: 0, presetIds: [], sequenceIds: [] }, presetIds: [] }] }],
    cueLists: [],
    ...extra
  }
  act(() => {
    useShowStore.setState({ show, presets: (extra.presets as never[]) ?? [], selectedFixtureIds: [fixture.id], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
  })
}

function cueValues(fixtureId: string) {
  const state = useShowStore.getState()
  return findInlineCue(state.show, state.cueLists, 'c1')?.cue.fixtureValues[fixtureId] ?? {}
}

// A Design write defines an override (LightKey's real Overrides).
function overrideValues(fixtureId: string) {
  return useShowStore.getState().manualOverrides[fixtureId] ?? {}
}

const fixturesDir = resolve(__dirname, 'fixtures')

function loadOfl(file: string) {
  const manufacturers = JSON.parse(readFileSync(join(fixturesDir, 'manufacturers.json'), 'utf8')) as Record<string, { name?: string }>
  const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const manufacturerKey = typeof raw.manufacturerKey === 'string' ? raw.manufacturerKey : basename(dirname(join(fixturesDir, file)))
  const fixtureKey = typeof raw.fixtureKey === 'string' ? raw.fixtureKey : basename(file, '.json')
  return importOflFixture(raw, { manufacturerKey, manufacturer: manufacturers[manufacturerKey]?.name, fixtureKey, preserveSource: false })
}

describe('Linked beam colour — one wheel drives every LED', () => {
  it('the wheel reads the average colour across the beams', () => {
    // Three beams green, beam 4 blue: the average is (0, 191, 64) —
    // hue 140, saturation 100, brightness 75, centre #00bf40.
    setShow(PAN, { ...ALL_GREEN, green4: 0, blue4: 255 })
    renderInRoot(<DesignTab />)
    expect(wheelValue('Colour hue')).toBe('140')
    expect(wheelValue('Saturation')).toBe('100')
    expect(wheelValue('Brightness')).toBe('75')
    expect(centreHex()).toBe('#00bf40')
  })

  it('a real wheel drag to red re-links all four beams', () => {
    setShow(PAN, ALL_GREEN)
    renderInRoot(<DesignTab />)
    // Separate beam 2 with its own slider first: red 100 on top of green.
    act(() => { useShowStore.getState().updateSelectedFixtures({ red2: 100 }) })
    expect(cueValues('bar')).toMatchObject({ red2: 100, green2: 255 })
    // Drag the hue ring to the top — hue 0, red — keeping the
    // averaged saturation/brightness (100/100).
    act(() => { wheelEl().dispatchEvent(pointer('pointerdown', 75, 16)) })
    act(() => { wheelEl().dispatchEvent(pointer('pointermove', 75, 16)) })
    act(() => { wheelEl().dispatchEvent(pointer('pointerup', 75, 16, 0)) })
    expect(overrideValues('bar')).toMatchObject({
      red: 255, green: 0, blue: 0,
      red2: 255, green2: 0, blue2: 0,
      red3: 255, green3: 0, blue3: 0,
      red4: 255, green4: 0, blue4: 0
    })
  })

  it('setSelectedBaseColor fans out to every beam of an OFL fixture ("red 2" spelling)', () => {
    const bar4 = loadOfl('chauvet-dj/4bar.json')
    const fixture: FixtureDef = { id: 'bar4', name: '4Bar', type: 'led-wash', channelStart: 1, channels: 15, profile: bar4, modeId: bar4.modes[0].id }
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { bar4: { intensity: 255 } } }],
      livePages: [cuePage('s')],
    }))
    s().activateCue('s')
    useShowStore.setState({ selectedFixtureIds: ['bar4'] })
    act(() => { s().setSelectedBaseColor({ red: 255, green: 128, blue: 0 }) })
    expect(cueS().fixtureValues.bar4).toMatchObject({
      red: 255, green: 128, blue: 0,
      'red 2': 255, 'green 2': 128, 'blue 2': 0,
      'red 3': 255, 'green 3': 128, 'blue 3': 0,
      'red 4': 255, 'green 4': 128, 'blue 4': 0
    })
    // The centre picker / colour favourite path (setSelectedColor)
    // links the same way.
    act(() => { s().setSelectedColor({ red: 0, green: 0, blue: 255 }) })
    expect(cueS().fixtureValues.bar4).toMatchObject({
      red: 0, green: 0, blue: 255,
      'red 2': 0, 'green 2': 0, 'blue 2': 255,
      'red 3': 0, 'green 3': 0, 'blue 3': 255,
      'red 4': 0, 'green 4': 0, 'blue 4': 255
    })
  })

  it('a single-cell fixture is unchanged — no numbered channels appear', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [{ id: 'fx1', name: 'Test Wash', type: 'led-wash', channelStart: 1, channels: 7 }],
      cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { fx1: { intensity: 255 } } }],
      livePages: [cuePage('s')],
    }))
    s().activateCue('s')
    useShowStore.setState({ selectedFixtureIds: ['fx1'] })
    act(() => { s().setSelectedBaseColor({ red: 10, green: 20, blue: 30 }) })
    expect(cueS().fixtureValues.fx1).toMatchObject({ red: 10, green: 20, blue: 30 })
    expect(cueS().fixtureValues.fx1).not.toHaveProperty('red 2')
    expect(cueS().fixtureValues.fx1).not.toHaveProperty('red2')
  })

  it('a per-beam slider still separates one beam, and the wheel re-links it', () => {
    const bar4 = loadOfl('chauvet-dj/4bar.json')
    const fixture: FixtureDef = { id: 'bar4', name: '4Bar', type: 'led-wash', channelStart: 1, channels: 15, profile: bar4, modeId: bar4.modes[0].id }
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [fixture],
      cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { bar4: { intensity: 255 } } }],
      livePages: [cuePage('s')],
    }))
    s().activateCue('s')
    useShowStore.setState({ selectedFixtureIds: ['bar4'] })
    act(() => { s().setSelectedBaseColor({ red: 255, green: 0, blue: 0 }) })
    // Beam 2's own red slider: only that beam moves.
    act(() => { s().updateSelectedFixtures({ 'red 2': 50 }) })
    expect(cueS().fixtureValues.bar4).toMatchObject({ red: 255, 'red 2': 50, 'red 3': 255, 'red 4': 255 })
    // The wheel again: every beam re-links to the one colour.
    act(() => { s().setSelectedBaseColor({ red: 0, green: 0, blue: 255 }) })
    expect(cueS().fixtureValues.bar4).toMatchObject({
      red: 0, green: 0, blue: 255,
      'red 2': 0, 'green 2': 0, 'blue 2': 255,
      'red 3': 0, 'green 3': 0, 'blue 3': 255,
      'red 4': 0, 'green 4': 0, 'blue 4': 255
    })
  })

  it('preset editing fans the colour out too — the preset stores every beam (batch 3)', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [{ id: 'bar', name: 'PAN 4x1x30', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }],
      cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { bar: { intensity: 255 } } }],
      livePages: [cuePage('s')],
      presets: [{ id: 'p', name: 'Red', category: 'color', fixtureValues: {} }]
    }))
    s().activateCue('s')
    s().startEditingPreset('p')
    useShowStore.setState({ selectedFixtureIds: ['bar'] })
    act(() => { s().updateEditingPresetValues({ red: 255, green: 0, blue: 0 }) })
    // Was bare RGB only (the linked-wheel commit left preset editing
    // beam-1-only); batch 3 fans it like the wheel, built-in "red2"
    // spelling for this bar.
    expect(s().presets[0].fixtureValues.bar).toEqual({
      red: 255, green: 0, blue: 0,
      red2: 255, green2: 0, blue2: 0,
      red3: 255, green3: 0, blue3: 0,
      red4: 255, green4: 0, blue4: 0
    })
    // And the cue itself was not touched by the preset edit.
    expect(cueS().fixtureValues.bar).toEqual({ intensity: 255 })
  })

  it('Set as Default / Load Default cover every beam', () => {
    setShow(PAN, ALL_GREEN)
    renderInRoot(<DesignTab />)
    // Set as Default stores the linked colour for all four beams…
    act(() => { useShowStore.getState().setColorDefault() })
    expect(useShowStore.getState().show?.fixtures.find((f) => f.id === 'bar')?.defaultValues).toMatchObject({
      red: 0, green: 255, blue: 0,
      red2: 0, green2: 255, blue2: 0,
      red3: 0, green3: 255, blue3: 0,
      red4: 0, green4: 255, blue4: 0
    })
    // …so loading the default restores all four, not just beam 1.
    act(() => { useShowStore.getState().setSelectedBaseColor({ red: 255, green: 0, blue: 0 }) })
    act(() => { useShowStore.getState().loadColorDefault() })
    expect(overrideValues('bar')).toMatchObject(ALL_GREEN)
  })
})
