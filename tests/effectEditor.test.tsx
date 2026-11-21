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

function templateTile(name: string): HTMLButtonElement {
  const found = container?.querySelector(`[aria-label="${name} template"]`) as HTMLButtonElement | null
  if (!found) throw new Error(`no template tile "${name}"`)
  return found
}

function pressEnter(input: HTMLElement) {
  act(() => {
    input.focus()
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
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
  it('shows LightKey’s template sections and adds a template on tile click', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[data-testid="effects-chooser"]')).not.toBeNull()
    for (const section of ['Dimmer', 'Color', 'Position', 'Zoom']) {
      expect(container?.querySelector(`[aria-label="${section} templates"]`)).not.toBeNull()
    }
    expect(container?.textContent).toContain('Custom Effect')
    // Hovering a tile reveals the green Add pill (Jake, 21 Nov 2026);
    // clicking the tile adds that template and opens its editor.
    const tile = templateTile('Marching Ants')
    act(() => { tile.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })) })
    expect(tile.textContent).toContain('Add')
    act(() => { tile.click() })
    const state = useShowStore.getState()
    expect(state.effects).toHaveLength(1)
    expect(state.effects[0].kind).toBe('pattern')
    expect(state.effects[0].pattern).toBe('chase')
    expect(state.effects[0].attribute).toBe('intensity')
    expect(state.effects[0].name).toBe('Marching Ants')
    expect(state.editingEffectId).toBe(state.effects[0].id)
    expect(container?.querySelector('[data-testid="effect-editor"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="effects-chooser"]')).toBeNull()
  })

  it('offers Replace or Overlay when the property already has an effect', () => {
    setShow()
    act(() => { useShowStore.getState().addEffect(chaseEffect()) })
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    act(() => { templateTile('Marching Ants').click() })
    expect(container?.textContent).toContain('already controls Dimmer')
    act(() => { buttonWithText('Overlay').click() })
    expect(useShowStore.getState().effects).toHaveLength(2)
  })

  it('offers only curves for a single colour channel, never a pattern', () => {
    // Guide ch.10, p.146: patterns apply to Dimmer and Color only — red
    // alone is automated with a curve on Color, so the template editor
    // for red must not offer a Pattern (whose colour samples would light
    // the fixture white).
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'red' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[data-testid="effects-chooser"]')).not.toBeNull()
    act(() => { buttonWithText('Custom Effect').click() })
    const kinds = container?.querySelector('[aria-label="Effect kind"]')
    expect(kinds?.textContent).toContain('Curve')
    expect(kinds?.textContent).not.toContain('Pattern')
    expect(kinds?.textContent).not.toContain('Movement')
  })

  it('offers a pattern for the whole Color property', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'color' }) })
    renderInRoot(<DesignTab />)
    act(() => { templateTile('Cop Light').click() })
    const state = useShowStore.getState()
    expect(state.effects).toHaveLength(1)
    expect(state.effects[0].kind).toBe('pattern')
    expect(state.effects[0].pattern).toBe('chase')
    expect(state.effects[0].attribute).toBe('color')
    expect(state.effects[0].samples?.[1]?.color).toBe('#ff0000')
  })

  it('greys out templates that don’t apply to the selected fixtures', () => {
    // The test wash has no pan/tilt, so the Position templates appear
    // gray (Guide p.148) and cannot be picked.
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    expect(templateTile('Bow Tie').disabled).toBe(true)
    expect(templateTile('Marching Ants').disabled).toBe(false)
  })

  it('opens the template editor and adds a fresh custom effect', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    act(() => { buttonWithText('Custom Effect').click() })
    const property = container?.querySelector('[aria-label="Fixture property"]') as HTMLSelectElement | null
    if (!property) throw new Error('no fixture property dropdown')
    expect(property.value).toBe('intensity')
    expect(container?.querySelector('[aria-label="Effect kind"]')?.textContent).toContain('Pattern')
    act(() => { buttonWithText('Add Effect').click() })
    const state = useShowStore.getState()
    expect(state.effects).toHaveLength(1)
    expect(state.effects[0].name).toBe('Dimmer Effect')
    expect(state.effects[0].kind).toBe('pattern')
    expect(state.effects[0].pattern).toBe('chase')
    expect(container?.querySelector('[data-testid="effect-editor"]')).not.toBeNull()
  })

  it('creates a beat-controlled effect from a beat template', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    act(() => { templateTile('Beat Meteor').click() })
    const state = useShowStore.getState()
    expect(state.effects[0].kind).toBe('pattern')
    expect(state.effects[0].pattern).toBe('meteor')
    expect(state.effects[0].timingMode).toBe('beat')
    expect(state.effects[0].beatMultiplier).toBe(1)
  })

  it('searches templates by name', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    const search = container?.querySelector('[aria-label="Search effects"]') as HTMLInputElement | null
    if (!search) throw new Error('no search field')
    setInputValue(search, 'K.I.T.T.')
    expect(container?.querySelector('[aria-label="K.I.T.T. template"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Barn Doors template"]')).toBeNull()
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
    const duration = container?.querySelector('[aria-label="Duration"]') as HTMLInputElement | null
    if (!duration) throw new Error('no duration input')
    expect(duration.value).toBe('00:02.0')
    setInputValue(duration, '00:04.0')
    pressEnter(duration)
    expect(useShowStore.getState().effects[0].durationMs).toBe(4000)
    // Switching to beat timing shows the multiplier LightKey-style.
    const beat = container?.querySelector('[aria-label="Beat-controlled"]') as HTMLButtonElement | null
    if (!beat) throw new Error('no beat toggle')
    act(() => { beat.click() })
    expect(useShowStore.getState().effects[0].timingMode).toBe('beat')
    expect(container?.querySelector('[aria-label="Beat multiplier"]')?.textContent).toBe('×1')
    expect(container?.textContent).toContain('Beat Multiplier')
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
    expect(container?.textContent).toContain('Steps p. Sample')
    expect(container?.textContent).toContain('Phase')
    expect(container?.textContent).toContain('Time Offset')
  })

  it('shows the full parameter set for each pattern', () => {
    const openPattern = (pattern: PatternEffect) => {
      setShow()
      act(() => {
        useShowStore.getState().addEffect({ ...chaseEffect(), id: 'e-pattern', name: 'Pattern', pattern })
        useShowStore.setState({ editingEffectId: 'e-pattern' })
      })
      renderInRoot(<DesignTab />)
    }
    openPattern('sparkle')
    for (const label of ['Interval', 'Lifetime', 'Fringe', 'Noise']) {
      expect(container?.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    }
  })

  it('shows Speed for jellyfish and snakes, and the length ranges for snakes', () => {
    const openPattern = (pattern: PatternEffect) => {
      setShow()
      act(() => {
        useShowStore.getState().addEffect({ ...chaseEffect(), id: 'e-pattern', name: 'Pattern', pattern })
        useShowStore.setState({ editingEffectId: 'e-pattern' })
      })
      renderInRoot(<DesignTab />)
    }
    openPattern('jellyfish')
    expect(container?.querySelector('[aria-label="Speed"]')).not.toBeNull()
    expect(container?.textContent).toContain('Use samples as palette')
  })

  it('offers per-component curves for Color, including the extra components', () => {
    // Guide ch.10, p.146: each component of Color has its own curve —
    // hue, saturation, brightness (or red, green, blue) plus the extras
    // the fixture supports (white, amber, ultraviolet on the led-wash).
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'color' }) })
    renderInRoot(<DesignTab />)
    act(() => { templateTile('Rainbow').click() })
    const state = useShowStore.getState()
    expect(state.effects[0].kind).toBe('curve')
    expect(state.effects[0].attribute).toBe('color')
    const tabs = container?.querySelector('[aria-label="Curve components"]')
    expect(tabs?.textContent).toContain('Hue')
    expect(tabs?.textContent).toContain('White')
    expect(tabs?.textContent).toContain('Amber')
    expect(tabs?.textContent).toContain('Ultraviolet')
    // Switch to the RGB model: the red, green and blue component curves
    // appear, with the extras still there.
    const model = container?.querySelector('[aria-label="Color model"]') as HTMLSelectElement | null
    if (!model) throw new Error('no color model select')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
      setter?.call(model, 'rgb')
      model.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    const rgbTabs = container?.querySelector('[aria-label="Curve components"]')
    expect(rgbTabs?.textContent).toContain('Red')
    expect(rgbTabs?.textContent).toContain('Green')
    expect(rgbTabs?.textContent).toContain('Blue')
    expect(rgbTabs?.textContent).toContain('Amber')
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
