// The visual effect editor and effects chooser (LightKey Guide ch.10):
// the chooser creates an effect from a template, the editor edits it, and
// Design shows an effect icon in place of a property's normal controls
// while that property is effect-controlled.
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

function setShow() {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [{ id: 'fx1', name: 'Test Wash', type: 'led-wash', channelStart: 1, channels: 7 }],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity: 255, red: 255, green: 0, blue: 0 } }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({
      show,
      cues: show.cues,
      presets: [],
      effects: [],
      selectedFixtureIds: ['fx1'],
      activeCueId: 'c1',
      editingPresetId: null,
      editingCueAdHocId: null,
      manualOverrides: {},
      showOverrideLabels: false,
      editingEffectId: null,
      effectChooserAttribute: null
    })
  })
}

function buttonWithText(text: string): HTMLButtonElement {
  const found = Array.from(container?.querySelectorAll('button') ?? []).find((b) =>
    b.textContent?.includes(text)
  ) as HTMLButtonElement | undefined
  if (!found) throw new Error(`no button with text "${text}"`)
  return found
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
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

function chaseEffect(): EffectDef {
  return {
    id: 'e-chase',
    name: 'Chase Dimmer',
    fixtureIds: ['fx1'],
    attribute: 'intensity',
    waveform: 'sine',
    speed: 1,
    syncToBpm: false,
    size: 255,
    offset: 128,
    phaseSpread: 0,
    enabled: true,
    kind: 'pattern',
    pattern: 'chase',
    samples: [{ id: 'sample-bg', value: 100 }, { id: 'sample-1', value: 0 }],
    durationMs: 2000,
    timingMode: 'fixed'
  }
}

describe('effects chooser', () => {
  it('creates a pattern effect from a template and opens the editor', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[data-testid="effects-chooser"]')).not.toBeNull()
    act(() => { buttonWithText('Chase').click() })
    const state = useShowStore.getState()
    expect(state.effects).toHaveLength(1)
    expect(state.effects[0].kind).toBe('pattern')
    expect(state.effects[0].pattern).toBe('chase')
    expect(state.effects[0].attribute).toBe('intensity')
    expect(state.editingEffectId).toBe(state.effects[0].id)
    expect(container?.querySelector('[data-testid="effect-editor"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="effects-chooser"]')).toBeNull()
  })

  it('offers Replace or Overlay when the property already has an effect', () => {
    setShow()
    act(() => { useShowStore.getState().addEffect(chaseEffect()) })
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    act(() => { buttonWithText('Chase').click() })
    expect(container?.textContent).toContain('already controls Dimmer')
    act(() => { buttonWithText('Overlay').click() })
    expect(useShowStore.getState().effects).toHaveLength(2)
  })
})

describe('effect editor', () => {
  it('edits the timing of the open effect', () => {
    setShow()
    act(() => {
      useShowStore.getState().addEffect(chaseEffect())
      useShowStore.setState({ editingEffectId: 'e-chase' })
    })
    renderInRoot(<DesignTab />)
    const duration = container?.querySelector('[aria-label="Duration (ms)"]') as HTMLInputElement | null
    if (!duration) throw new Error('no duration input')
    expect(duration.value).toBe('2000')
    setInputValue(duration, '4000')
    expect(useShowStore.getState().effects[0].durationMs).toBe(4000)
  })

  it('shows the pattern and its samples', () => {
    setShow()
    act(() => {
      useShowStore.getState().addEffect(chaseEffect())
      useShowStore.setState({ editingEffectId: 'e-chase' })
    })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[aria-label="Pattern"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Pattern samples"]')).not.toBeNull()
    expect(container?.textContent).toContain('Steps per value')
  })
})

describe('effect-controlled properties in Design', () => {
  it('replaces the Dimmer fader with an effect icon that opens the editor', () => {
    setShow()
    act(() => { useShowStore.getState().addEffect(chaseEffect()) })
    renderInRoot(<DesignTab />)
    // The normal Dimmer fader is gone…
    expect(container?.querySelector('[aria-label="Dimmer for selected fixtures"]')).toBeNull()
    // …replaced by the effect icon.
    const indicator = container?.querySelector('[title="Edit effect Chase Dimmer"]') as HTMLElement | null
    if (!indicator) throw new Error('no effect indicator for the Dimmer')
    expect(indicator.textContent).toContain('Chase Dimmer')
    act(() => { indicator.click() })
    expect(useShowStore.getState().editingEffectId).toBe('e-chase')
    expect(container?.querySelector('[data-testid="effect-editor"]')).not.toBeNull()
  })
})

describe('effect store actions', () => {
  it('duplicates an effect with a new id', () => {
    setShow()
    act(() => { useShowStore.getState().addEffect(chaseEffect()) })
    let copyId: string | null = null
    act(() => { copyId = useShowStore.getState().duplicateEffect('e-chase') })
    expect(copyId).not.toBeNull()
    expect(copyId).not.toBe('e-chase')
    const state = useShowStore.getState()
    expect(state.effects).toHaveLength(2)
    expect(state.effects[1].name).toBe('Chase Dimmer copy')
  })

  it('delete-and-keep-values bakes a flat curve into the active cue', () => {
    setShow()
    const flat: EffectDef = {
      ...chaseEffect(),
      id: 'e-flat',
      name: 'Flat Dimmer',
      kind: 'curve',
      pattern: undefined,
      samples: undefined,
      curveComponents: [{
        component: 'intensity',
        points: [{ id: 'a', x: 0, y: 0.5 }, { id: 'b', x: 1, y: 0.5 }],
        curvedSegments: [false]
      }]
    }
    act(() => { useShowStore.getState().addEffect(flat) })
    act(() => { useShowStore.getState().deleteEffectAndKeepValues('e-flat') })
    const state = useShowStore.getState()
    expect(state.effects).toHaveLength(0)
    expect(state.cues[0].fixtureValues.fx1.intensity).toBe(128)
  })

  it('save-as-template keeps fixture order only when asked', () => {
    setShow()
    const ordered: EffectDef = { ...chaseEffect(), fixtureOrder: 'reverse', fixtureGrouping: 2 }
    act(() => { useShowStore.getState().addEffect(ordered) })
    act(() => { useShowStore.getState().saveEffectTemplate('e-chase', false) })
    const without = useShowStore.getState().show?.effectTemplates?.[0]
    expect(without?.fixtureOrder).toBeUndefined()
    expect(without?.fixtureGrouping).toBeUndefined()
    act(() => { useShowStore.getState().saveEffectTemplate('e-chase', true) })
    const withOrder = useShowStore.getState().show?.effectTemplates?.[1]
    expect(withOrder?.fixtureOrder).toBe('reverse')
    expect(withOrder?.fixtureGrouping).toBe(2)
  })
})
