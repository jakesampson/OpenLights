// @vitest-environment jsdom
// Multipart colour sliders in the Design tab (Jake, 19 Nov 2026,
// batch 3): the White/Amber/UV sliders beside the wheel read beam 1
// only and wrote beam 1 only. They now read the average across the
// fixture's beams — the same linked read the wheel uses — and write
// every beam. The preset wheel edit is covered here too: dragging the
// wheel while editing a preset stores the colour on every beam.
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

const fixturesDir = resolve(__dirname, 'fixtures')

function loadOfl(file: string) {
  const manufacturers = JSON.parse(readFileSync(join(fixturesDir, 'manufacturers.json'), 'utf8')) as Record<string, { name?: string }>
  const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const manufacturerKey = typeof raw.manufacturerKey === 'string' ? raw.manufacturerKey : basename(dirname(join(fixturesDir, file)))
  const fixtureKey = typeof raw.fixtureKey === 'string' ? raw.fixtureKey : basename(file, '.json')
  return importOflFixture(raw, { manufacturerKey, manufacturer: manufacturers[manufacturerKey]?.name, fixtureKey, preserveSource: false })
}

const q5 = loadOfl('chauvet-dj/fxarray-q5.json')
const bar4 = loadOfl('chauvet-dj/4bar.json')

function q5Fixture(): FixtureDef {
  return { id: 'q5', name: 'Q5', type: 'led-wash', channelStart: 1, channels: 30, profile: q5, modeId: q5.modes[0].id }
}

function barFixture(): FixtureDef {
  return { id: 'bar4', name: '4Bar', type: 'led-wash', channelStart: 1, channels: 15, profile: bar4, modeId: bar4.modes[0].id }
}

function cueValues(fixtureId: string) {
  const state = useShowStore.getState()
  return findInlineCue(state.show, state.cueLists, 'c1')?.cue.fixtureValues[fixtureId] ?? {}
}

// A cue survives migration only in a holder: the seed button carries
// it. A fresh object per seed — migrateShow shallow-copies its input
// and writes the inlined cue onto the button.
const cuePage = () => ({ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', cueId: 'c1', presetIds: [] }] })

// A Design write defines an override (LightKey's real Overrides).
function overrideValues(fixtureId: string) {
  return useShowStore.getState().manualOverrides[fixtureId] ?? {}
}

describe('additional-colour sliders across beams', () => {
  it('the UV slider reads the average UV across the Q5 five pods', () => {
    // UV 0 / 200 / 100 / 100 / 100 averages to 100 — beam 1 alone
    // would read 0, so 100 proves the linked read across all five.
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [q5Fixture()],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { q5: { intensity: 255, red: 0, green: 0, blue: 0, uv: 0, 'uv 2': 200, 'uv 3': 100, 'uv 4': 100, 'uv 5': 100 } } }],
      livePages: [cuePage()],
    }))
    useShowStore.setState({ selectedFixtureIds: ['q5'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    renderInRoot(<DesignTab />)
    expect(sliderEl('UV for selected fixtures').getAttribute('aria-valuenow')).toBe('100')
  })

  it('dragging the UV slider to full writes all five Q5 pods', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [q5Fixture()],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { q5: { intensity: 255, red: 0, green: 0, blue: 0 } } }],
      livePages: [cuePage()],
    }))
    useShowStore.setState({ selectedFixtureIds: ['q5'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
    renderInRoot(<DesignTab />)
    // Pointer at the top of the 150-tall mocked track: full (255).
    act(() => { sliderEl('UV for selected fixtures').dispatchEvent(pointer('pointerdown', 75, 0)) })
    expect(overrideValues('q5')).toMatchObject({ uv: 255, 'uv 2': 255, 'uv 3': 255, 'uv 4': 255, 'uv 5': 255 })
    // And the slider now reads the linked value back.
    expect(sliderEl('UV for selected fixtures').getAttribute('aria-valuenow')).toBe('255')
  })
})

describe('preset wheel edit across beams', () => {
  it('a wheel drag while editing a preset stores red on all four 4Bar cells', () => {
    const allGreen: Record<string, number> = {
      red: 0, green: 255, blue: 0,
      'red 2': 0, 'green 2': 255, 'blue 2': 0,
      'red 3': 0, 'green 3': 255, 'blue 3': 0,
      'red 4': 0, 'green 4': 255, 'blue 4': 0
    }
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: [barFixture()],
      cues: [{ id: 'c1', name: 'Cue 1', fadeMs: 0, fixtureValues: { bar4: { intensity: 255, ...allGreen } } }],
      livePages: [cuePage()],
      presets: [{ id: 'p1', name: 'Red', category: 'color', fixtureValues: { bar4: { intensity: 255, red: 0, green: 255, blue: 0 } } }]
    }))
    useShowStore.setState({ selectedFixtureIds: ['bar4'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: 'p1' })
    renderInRoot(<DesignTab />)
    const wheel = container?.querySelector('.color-wheel')
    if (!wheel) throw new Error('no .color-wheel in the rendered output')
    // Drag the hue ring to the top — hue 0, red.
    act(() => { (wheel as HTMLElement).dispatchEvent(pointer('pointerdown', 75, 16)) })
    act(() => { (wheel as HTMLElement).dispatchEvent(pointer('pointermove', 75, 16)) })
    act(() => { (wheel as HTMLElement).dispatchEvent(pointer('pointerup', 75, 16, 0)) })
    expect(s().presets[0].fixtureValues.bar4).toMatchObject({
      red: 255, green: 0, blue: 0,
      'red 2': 255, 'green 2': 0, 'blue 2': 0,
      'red 3': 255, 'green 3': 0, 'blue 3': 0,
      'red 4': 255, 'green 4': 0, 'blue 4': 0
    })
  })
})
