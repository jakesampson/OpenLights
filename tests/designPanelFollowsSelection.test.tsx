// Design panel follows the selected fixtures (Jake, 26 Nov 2026): after
// clicking the K.I.T.T. colour effect in the palette, the Design tab kept
// showing the effect card even for fixtures the effect does not touch,
// and the Dimmer read 0% while fixtures lit by an active preset were
// visibly lit. Jake's rule: the Design tab should only ever reflect the
// selected fixtures, OR a palette preset whose yellow Edit button was
// clicked (draft edit mode).
//
// Two fixes under test, both in DesignTab:
// (1) effectForAttribute only matches an enabled effect whose fixture
//     list covers every selected fixture (empty = no fixtures — the
//     effect runs on nothing, Jake, 27 Nov 2026) —
//     Guide ch.10, p.149: the property area shows the effect icon when
//     an effect is *controlling* the property.
// (2) fixtureAttr/positionAttr read the active palette presets layer
//     (cue -> presets -> overrides, as in effectiveIntensityLevels) —
//     a fixture lit by an active preset no longer reads 0/dark.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { EffectDef } from '../src/shared/types'

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

function kittEffect(fixtureIds: string[]): EffectDef {
  return {
    id: 'e-kitt', name: 'K.I.T.T.', fixtureIds, attribute: 'color',
    waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 128,
    phaseSpread: 0, enabled: true, kind: 'pattern', pattern: 'scanner',
    samples: [{ id: 'sample-bg', color: '#000000' }, { id: 'sample-1', color: '#ff0000' }],
    durationMs: 2000, timingMode: 'fixed'
  }
}

function setShow(options: { effects?: EffectDef[]; activePresetIds?: string[]; selectedFixtureIds?: string[]; editingPresetId?: string | null }) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [
      { id: 'fx1', name: 'W4', type: 'led-wash', channelStart: 1, channels: 7 },
      { id: 'fx2', name: 'PB1', type: 'par', channelStart: 8, channels: 4 }
    ]
  }
  const presets = [
    { id: 'p-fullon', name: 'Full On', category: 'intensity' as const, fixtureValues: { fx1: { intensity: 255 }, fx2: { intensity: 255 } } },
    { id: 'p-blue', name: 'Blue', category: 'color' as const, fixtureValues: { fx1: { red: 0, green: 0, blue: 255 } } },
    { id: 'p-red', name: 'Red', category: 'color' as const, fixtureValues: { fx1: { red: 255, green: 0, blue: 0 } } }
  ]
  act(() => {
    useShowStore.setState({
      show, presets,
      effects: options.effects ?? [],
      activePresetIds: options.activePresetIds ?? [],
      selectedFixtureIds: options.selectedFixtureIds ?? ['fx1'],
      selectedBeams: [],
      activeCueRef: null, editingPresetId: options.editingPresetId ?? null,
      editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false
    })
  })
}

function colourCard() {
  return container?.querySelector('[data-testid="colour-card"]')
}
function showsEffectCard() {
  return container?.querySelector('button[title="Edit effect K.I.T.T."]') !== null
}
function showsWheel() {
  return colourCard()?.querySelector('.color-wheel') !== null
}
function dimmerValue() {
  return container?.querySelector('[aria-label="Dimmer for selected fixtures"]')?.getAttribute('aria-valuenow') ?? null
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

describe('Design panel follows the selected fixtures', () => {
  it('an effect scoped to another fixture does not hijack the colour card', () => {
    setShow({ effects: [kittEffect(['fx2'])], selectedFixtureIds: ['fx1'] })
    renderInRoot(<DesignTab />)
    expect(colourCard()).not.toBeNull()
    expect(showsEffectCard()).toBe(false)
    expect(showsWheel()).toBe(true)
  })

  it('an effect scoped to the selected fixture still shows its card', () => {
    setShow({ effects: [kittEffect(['fx2'])], selectedFixtureIds: ['fx2'] })
    renderInRoot(<DesignTab />)
    expect(showsEffectCard()).toBe(true)
    expect(showsWheel()).toBe(false)
  })

  it('an effect with an empty fixture list (no fixtures) shows no card for any selection', () => {
    setShow({ effects: [kittEffect([])], selectedFixtureIds: ['fx1'] })
    renderInRoot(<DesignTab />)
    expect(showsEffectCard()).toBe(false)
    expect(showsWheel()).toBe(true)
  })

  it('a mixed selection keeps the wheel when the effect does not cover every selected fixture', () => {
    setShow({ effects: [kittEffect(['fx2'])], selectedFixtureIds: ['fx1', 'fx2'] })
    renderInRoot(<DesignTab />)
    expect(showsEffectCard()).toBe(false)
    expect(showsWheel()).toBe(true)
  })

  it('a fixture lit by an active preset reads the preset value, not 0', () => {
    setShow({ activePresetIds: ['p-fullon'], selectedFixtureIds: ['fx1'] })
    renderInRoot(<DesignTab />)
    expect(dimmerValue()).toBe('255')
  })

  it('an active colour preset reaches the wheel (not just the dimmer)', () => {
    setShow({ activePresetIds: ['p-red'], selectedFixtureIds: ['fx1'] })
    renderInRoot(<DesignTab />)
    // Red preset (red 255, green 0, blue 0): the wheel reads hue 0° —
    // without the preset layer it would read the default blue (240°).
    expect(container?.querySelector('[aria-label="Colour hue"]')?.getAttribute('aria-valuenow')).toBe('0')
    expect(dimmerValue()).toBe('0')
  })

  it('preset draft edit still takes precedence over the active-preset layer', () => {
    // Editing "Full On" (intensity 255 on fx1) while "Blue" is the
    // active preset: the panel reads the edited preset, and an active
    // preset on another fixture cannot leak in.
    setShow({ activePresetIds: ['p-blue'], selectedFixtureIds: ['fx1'], editingPresetId: 'p-fullon' })
    renderInRoot(<DesignTab />)
    expect(dimmerValue()).toBe('255')
  })
})
