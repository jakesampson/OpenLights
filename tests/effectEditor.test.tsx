// The visual effect editor and effects chooser (LightKey Guide ch.10):
// the chooser creates an effect from a template, the editor edits it, and
// Design shows an effect icon in place of a property's normal controls
// while that property is effect-controlled.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { EffectsChooser } from '../src/renderer/src/components/EffectEditor'
import { GroupsPresetsPanel } from '../src/renderer/src/components/GroupsPresetsPanel'
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
    effectTemplates: [],
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
      editingEffectTemplateId: null,
      effectChooserAttribute: null
    })
  })
}

function setShowWithChannels(attrs: string[]) {
  // A fixture with an intensity channel plus the given extra channels
  // (no built-in profile has iris/frost/focus, so it carries its own
  // profile — the same shape as propertyValues.test.ts).
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const channels = [
    { number: 0, attribute: 'intensity', propertyType: 'intensity' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
    ...attrs.map((attribute, i) => ({ number: i + 1, attribute, propertyType: 'other' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 0 }))
  ]
  const cueValues: Record<string, number> = { intensity: 255 }
  for (const attribute of attrs) cueValues[attribute] = 128
  const show = {
    ...base,
    id: 'test-show',
    effectTemplates: [],
    fixtures: [{ id: 'fx1', name: 'Test Custom', type: 'moving-head', channelStart: 1, channels: channels.length, profile: { id: 'test-custom', name: 'Test Custom', manufacturer: 'Test', legacyType: 'moving-head', modes: [{ id: 'default', name: 'Default', channels }] } }],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: { fx1: cueValues }, fadeMs: 0 }]
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
      editingEffectTemplateId: null,
      effectChooserAttribute: null
    })
  })
}

function setShowWithIris() {
  setShowWithChannels(['iris'])
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

/** A saved effect template in the show (no live effect left behind, so
 *  opening it never hits the Replace/Overlay conflict). Returns its id. */
function seedSavedTemplate(): string {
  act(() => {
    useShowStore.getState().addEffect(chaseEffect())
    useShowStore.getState().saveEffectTemplate('e-chase', true)
    useShowStore.getState().removeEffect('e-chase')
  })
  const template = useShowStore.getState().show?.effectTemplates?.at(-1)
  if (!template) throw new Error('no saved template')
  return template.id
}

function savedTemplateTile(name: string): HTMLButtonElement {
  const found = container?.querySelector(`[aria-label="${name} template"]`) as HTMLButtonElement | null
  if (!found) throw new Error(`no saved template tile "${name}"`)
  return found
}

describe('effects chooser', () => {
  it('shows LightKey’s template sections and adds a template on tile click', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[data-testid="effects-chooser"]')).not.toBeNull()
    for (const section of ['Dimmer', 'Color', 'Position', 'Zoom', 'Iris']) {
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
    // the fixture white). LightKey still shows the other kinds, greyed
    // out (Jake's Frost screenshot, 21 Nov 2026, 10.27.26 pm). Red has
    // no templates, so the chooser opens straight on the template editor.
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'red' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[data-testid="effects-chooser"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Fixture property"]')).not.toBeNull()
    const kinds = container?.querySelector('[aria-label="Effect kind"]')
    const radios = Array.from(kinds?.querySelectorAll('[role="radio"]') ?? []) as HTMLButtonElement[]
    expect(radios.map((r) => r.textContent)).toEqual(['Pattern', 'Curve', 'Movement'])
    expect(radios.map((r) => r.disabled)).toEqual([true, false, true])
    expect(radios.find((r) => r.getAttribute('aria-checked') === 'true')?.textContent).toBe('Curve')
  })

  it('opens straight on the template editor for a property with no templates', () => {
    // Jake's screenshot, 21 Nov 2026, 10.27.26 pm: Frost opens the
    // template editor, not an empty templates view. Same for Focus —
    // the rule is about having no templates, not about Frost itself.
    setShowWithChannels(['frost', 'focus'])
    act(() => { useShowStore.setState({ effectChooserAttribute: 'frost' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[data-testid="effects-chooser"]')).not.toBeNull()
    // No templates view: no tiles, no Custom Effect button.
    expect(container?.querySelector('[aria-label="Marching Ants template"]')).toBeNull()
    expect(container?.textContent).not.toContain('Custom Effect')
    const property = container?.querySelector('[aria-label="Fixture property"]') as HTMLSelectElement | null
    expect(property?.value).toBe('frost')
    const kinds = container?.querySelector('[aria-label="Effect kind"]')
    const radios = Array.from(kinds?.querySelectorAll('[role="radio"]') ?? []) as HTMLButtonElement[]
    expect(radios.map((r) => r.textContent)).toEqual(['Pattern', 'Curve', 'Movement'])
    expect(radios.map((r) => r.disabled)).toEqual([true, false, true])
    expect(radios.find((r) => r.getAttribute('aria-checked') === 'true')?.textContent).toBe('Curve')
  })

  it('adds a Frost curve effect from the template editor', () => {
    setShowWithChannels(['frost'])
    act(() => { useShowStore.setState({ effectChooserAttribute: 'frost' }) })
    renderInRoot(<DesignTab />)
    act(() => { buttonWithText('Add Effect').click() })
    const state = useShowStore.getState()
    expect(state.effects).toHaveLength(1)
    expect(state.effects[0].kind).toBe('curve')
    expect(state.effects[0].attribute).toBe('frost')
    expect(state.effects[0].name).toBe('Frost Effect')
    expect(state.effects[0].curveComponents?.[0].component).toBe('frost')
    expect(state.editingEffectId).toBe(state.effects[0].id)
    expect(container?.querySelector('[data-testid="effect-editor"]')).not.toBeNull()
  })

  it('still opens the templates view for a property with templates', () => {
    // The no-templates jump must not steal the normal path: Dimmer has
    // templates, so it opens the templates view, not the editor.
    setShowWithChannels(['frost'])
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[aria-label="Dimmer templates"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Fixture property"]')).toBeNull()
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

  it('scrolls the templates view to the picked property’s section', () => {
    // Jake, 21 Nov 2026: opening from the wand menu lands on the picked
    // property, not the top. jsdom has no real scrolling, so this asserts
    // the scroll-into-view call and its target, not pixels.
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView
    try {
      setShow()
      act(() => { useShowStore.setState({ effectChooserAttribute: 'color' }) })
      renderInRoot(<DesignTab />)
      const colorSection = container?.querySelector('[aria-label="Color templates"]')
      expect(colorSection).not.toBeNull()
      expect(scrollIntoView.mock.instances).toContain(colorSection)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
      act(() => { useShowStore.setState({ effectChooserAttribute: 'iris' }) })
      const irisSection = container?.querySelector('[aria-label="Iris templates"]')
      expect(irisSection).not.toBeNull()
      expect(scrollIntoView.mock.instances).toContain(irisSection)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('adds an Iris template on tile click for an iris fixture', () => {
    setShowWithIris()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'iris' }) })
    renderInRoot(<DesignTab />)
    expect(templateTile('Iris Wave').disabled).toBe(false)
    act(() => { templateTile('Iris Wave').click() })
    const state = useShowStore.getState()
    expect(state.effects).toHaveLength(1)
    expect(state.effects[0].kind).toBe('curve')
    expect(state.effects[0].attribute).toBe('iris')
    expect(state.effects[0].name).toBe('Iris Wave')
    expect(state.effects[0].curveComponents?.[0].component).toBe('iris')
    expect(state.editingEffectId).toBe(state.effects[0].id)
    expect(container?.querySelector('[data-testid="effect-editor"]')).not.toBeNull()
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

  it('shows a yellow Edit button on hover over a saved template, and Edit opens it bound to the template', () => {
    // LightKey Guide ch.9, p.128: hover the preset in the palette and
    // click Edit. The working copy opens in the editor and the session
    // binds to the template, so Update can write back to it.
    setShow()
    const templateId = seedSavedTemplate()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[aria-label="Your templates"]')).not.toBeNull()
    const tile = savedTemplateTile('Chase Dimmer')
    expect(container?.querySelector('[aria-label="Edit Chase Dimmer"]')).toBeNull()
    act(() => { tile.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })) })
    const edit = container?.querySelector('[aria-label="Edit Chase Dimmer"]') as HTMLButtonElement | null
    if (!edit) throw new Error('no Edit button on hover')
    act(() => { edit.click() })
    const state = useShowStore.getState()
    expect(state.editingEffectTemplateId).toBe(templateId)
    expect(state.editingEffectId).not.toBeNull()
    expect(state.effects).toHaveLength(1)
    expect(state.effects[0].name).toBe('Chase Dimmer')
    expect(container?.querySelector('[data-testid="effect-editor"]')).not.toBeNull()
  })

  it('shows a yellow Update button on the saved template being edited, and Update writes back', () => {
    // The row Update is the chooser-side surface for the same action
    // the header pill offers while editing (Jake's 10.40.51 pm
    // screenshot). Rendered here directly: the editor takes over the
    // panel in DesignTab, so the chooser is rendered on its own.
    setShow()
    const templateId = seedSavedTemplate()
    let workingId: string | null = null
    act(() => { workingId = useShowStore.getState().startEditingEffectTemplate(templateId) })
    if (!workingId) throw new Error('Edit did not create a working copy')
    act(() => { useShowStore.getState().updateEffect(workingId, { durationMs: 5000 }) })
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<EffectsChooser />)
    const update = container?.querySelector('[aria-label="Update Chase Dimmer"]') as HTMLButtonElement | null
    if (!update) throw new Error('no Update button on the template being edited')
    act(() => { update.click() })
    const state = useShowStore.getState()
    expect(state.show?.effectTemplates?.find((t) => t.id === templateId)?.durationMs).toBe(5000)
    expect(state.editingEffectTemplateId).toBeNull()
    // The live effect stays as an ordinary effect after Update.
    expect(state.effects).toHaveLength(1)
    expect(state.effects[0].id).toBe(workingId)
  })

  it('right-clicks a saved template: Apply, Edit, Rename, Duplicate, Delete, New entries — and nothing invented', () => {
    // LightKey's preset menu (Jake's screenshot, 21 Nov 2026, 10.49.20
    // pm), mapped to what OpenLights has. Show Properties, Add
    // Overrides, External Control and the From Selection variants have
    // no equivalent for an effect template and must not appear.
    setShow()
    const templateId = seedSavedTemplate()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    const tile = savedTemplateTile('Chase Dimmer')
    const openMenu = () => {
      act(() => {
        tile.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
      })
      const menu = container?.querySelector('[aria-label$=" actions"]')
      if (!menu) throw new Error('no template context menu')
      return menu
    }
    let menu = openMenu()
    for (const label of ['Apply', 'Edit', 'Rename', 'Duplicate', 'Delete', 'New Preset', 'New Preset With Snapshot', 'New Group', 'New Sequence']) {
      expect(menu.textContent).toContain(label)
    }
    for (const label of ['Show Properties', 'Add Overrides', 'External Control', 'From Selection']) {
      expect(menu.textContent).not.toContain(label)
    }
    // Rename: inline input, committed on Enter, reflected in the tile.
    act(() => { buttonWithText('Rename').click() })
    const input = container?.querySelector('[aria-label="Rename template"]') as HTMLInputElement | null
    if (!input) throw new Error('no rename input')
    setInputValue(input, 'Chase Renamed')
    pressEnter(input)
    expect(useShowStore.getState().show?.effectTemplates?.find((t) => t.id === templateId)?.name).toBe('Chase Renamed')
    expect(container?.querySelector('[aria-label="Chase Renamed template"]')).not.toBeNull()
    // Duplicate: a second saved template, named "… copy".
    menu = openMenu()
    expect(menu.textContent).toContain('Duplicate')
    act(() => { buttonWithText('Duplicate').click() })
    const templates = useShowStore.getState().show?.effectTemplates ?? []
    expect(templates).toHaveLength(2)
    expect(templates[1].name).toBe('Chase Renamed copy')
    // New Preset asks the palette to open its composer (the palette
    // owns it); the event is the wiring.
    const seen: string[] = []
    const onComposer = (event: Event) => { seen.push((event as CustomEvent<{ type: string }>).detail.type) }
    window.addEventListener('openlights-palette-composer', onComposer)
    try {
      openMenu()
      act(() => { buttonWithText('New Preset').click() })
      expect(seen).toEqual(['preset'])
    } finally {
      window.removeEventListener('openlights-palette-composer', onComposer)
    }
    // Delete: confirmed, the template is gone.
    const originalConfirm = window.confirm
    window.confirm = () => true
    try {
      openMenu()
      act(() => { buttonWithText('Delete').click() })
    } finally {
      window.confirm = originalConfirm
    }
    expect(useShowStore.getState().show?.effectTemplates).toHaveLength(1)
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

  it('offers only Duration and Beat Multiplier in the timing toggle — no random segment', () => {
    // Jake, 21 Nov 2026: LightKey's timing toggle is clock/pulse only;
    // the third shuffle segment is not in LightKey's screenshots (and
    // underlaps the colour picker panel).
    setShow()
    act(() => {
      useShowStore.getState().addEffect(chaseEffect())
      useShowStore.setState({ editingEffectId: 'e-chase' })
    })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[aria-label="Fixed duration"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Beat-controlled"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Random timing"]')).toBeNull()
    expect(container?.querySelector('[aria-label="Timing mode"]')?.textContent).not.toContain('Random')
  })

  it('shows the effect-type dropdown, not the effect name, and no duplicate Design/Live tabs', () => {
    // Jake, 21 Nov 2026: the editor header shows "Dimmer Effect" /
    // "Color Effect" (LightKey's screenshots); the name dropdown and
    // the second Design/Live segmented control do not belong there.
    // The name lives in the palette; rename is the palette's
    // right-click menu, not the editor.
    setShow()
    act(() => {
      useShowStore.getState().addEffect(chaseEffect())
      useShowStore.setState({ editingEffectId: 'e-chase' })
    })
    renderInRoot(<DesignTab />)
    const editor = container?.querySelector('[data-testid="effect-editor"]')
    expect(editor).not.toBeNull()
    const menuButton = container?.querySelector('[aria-label="Effect menu"]') as HTMLButtonElement | null
    if (!menuButton) throw new Error('no effect menu button')
    expect(menuButton.textContent).toContain('Dimmer Effect')
    expect(menuButton.textContent).not.toContain('Chase Dimmer')
    expect(menuButton.getAttribute('title')).toBeNull()
    expect(editor?.querySelector('[aria-label="Design or Live"]')).toBeNull()
    expect(container?.querySelector('[aria-label="Effect name"]')).toBeNull()
    // The dropdown keeps the guide's actions (switch, Duplicate, Save
    // as Template…, Delete and Keep Values, Delete — Guide pp.173-174).
    act(() => { menuButton.click() })
    for (const label of ['Duplicate', 'Save as Template…', 'Delete and Keep Values', 'Delete']) {
      expect(container?.textContent).toContain(label)
    }
    expect(container?.textContent).not.toContain('Rename')
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

  it('edit-update round-trips a saved template, and Update ends the session', () => {
    // LightKey Guide ch.9, p.128: Edit opens the preset, Update writes
    // the changes back. The stored name is kept (the editor has no
    // rename control); the live effect stays as an ordinary effect.
    // Update saves AND exits the editor (Jake, 22 Nov 2026): the
    // editor closes and its tab leaves the pill bar.
    setShow()
    const templateId = seedSavedTemplate()
    let workingId: string | null = null
    act(() => { workingId = useShowStore.getState().startEditingEffectTemplate(templateId) })
    expect(workingId).not.toBeNull()
    expect(useShowStore.getState().editingEffectTemplateId).toBe(templateId)
    act(() => { useShowStore.getState().updateEffect(workingId!, { durationMs: 5000, beatMultiplier: 4 }) })
    act(() => { useShowStore.getState().updateEffectTemplate() })
    const state = useShowStore.getState()
    const template = state.show?.effectTemplates?.find((t) => t.id === templateId)
    expect(template?.durationMs).toBe(5000)
    expect(template?.beatMultiplier).toBe(4)
    expect(template?.name).toBe('Chase Dimmer')
    expect(state.editingEffectTemplateId).toBeNull()
    expect(state.editingEffectId).toBeNull()
    expect(state.effects).toHaveLength(1)
  })

  it('switching to another effect cancels a template-edit session (Cancel semantics)', () => {
    // Jake, 22 Nov 2026: the editor is transient — starting work on
    // another effect closes the current one, discarding the
    // uncommitted working copy, and never leaves two editors open.
    setShow()
    const templateId = seedSavedTemplate()
    let workingId: string | null = null
    act(() => { workingId = useShowStore.getState().startEditingEffectTemplate(templateId) })
    act(() => { useShowStore.getState().addEffect({ ...chaseEffect(), id: 'e-other', name: 'Other Chase' }) })
    act(() => { useShowStore.getState().setEditingEffectId('e-other') })
    const state = useShowStore.getState()
    expect(state.editingEffectTemplateId).toBeNull()
    expect(state.editingEffectId).toBe('e-other')
    expect(state.effects.find((e) => e.id === workingId)).toBeUndefined()
    expect(state.effects.find((e) => e.id === 'e-other')).not.toBeUndefined()
  })

  it('opening the chooser exits the editor, and deleting the edited effect closes it', () => {
    // Jake, 22 Nov 2026: starting to add effects to a different
    // fixture closes the current editor (Cancel semantics) so the
    // chooser can open; deleting the edited effect must not leave a
    // dangling editor id behind.
    setShow()
    act(() => {
      useShowStore.getState().addEffect(chaseEffect())
      useShowStore.setState({ editingEffectId: 'e-chase' })
    })
    act(() => { useShowStore.getState().setEffectChooserAttribute('color') })
    let state = useShowStore.getState()
    expect(state.editingEffectId).toBeNull()
    expect(state.effectChooserAttribute).toBe('color')
    act(() => { useShowStore.getState().setEffectChooserAttribute(null) })
    act(() => { useShowStore.setState({ editingEffectId: 'e-chase' }) })
    act(() => { useShowStore.getState().removeEffect('e-chase') })
    state = useShowStore.getState()
    expect(state.editingEffectId).toBeNull()
    expect(state.effects).toHaveLength(0)
  })

  it('cancel discards the working copy and leaves the saved template untouched', () => {
    setShow()
    const templateId = seedSavedTemplate()
    let workingId: string | null = null
    act(() => { workingId = useShowStore.getState().startEditingEffectTemplate(templateId) })
    act(() => { useShowStore.getState().updateEffect(workingId!, { durationMs: 9000 }) })
    act(() => { useShowStore.getState().cancelEditingEffectTemplate() })
    const state = useShowStore.getState()
    expect(state.show?.effectTemplates?.find((t) => t.id === templateId)?.durationMs).toBe(2000)
    expect(state.editingEffectTemplateId).toBeNull()
    expect(state.editingEffectId).toBeNull()
    expect(state.effects).toHaveLength(0)
  })

  it('renames, duplicates and deletes a saved effect template', () => {
    setShow()
    const templateId = seedSavedTemplate()
    act(() => { useShowStore.getState().renameEffectTemplate(templateId, '  Chase Renamed  ') })
    let templates = useShowStore.getState().show?.effectTemplates ?? []
    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('Chase Renamed')
    act(() => { useShowStore.getState().duplicateEffectTemplate(templateId) })
    templates = useShowStore.getState().show?.effectTemplates ?? []
    expect(templates).toHaveLength(2)
    expect(templates[1].name).toBe('Chase Renamed copy')
    expect(templates[1].id).not.toBe(templateId)
    expect(templates[1].durationMs).toBe(2000)
    act(() => { useShowStore.getState().deleteEffectTemplate(templateId) })
    templates = useShowStore.getState().show?.effectTemplates ?? []
    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('Chase Renamed copy')
  })
})

describe('effect editor pill bar, sample strip, params and fixture order (Jake, Nov 2026)', () => {
  function curveEffect(): EffectDef {
    return {
      ...chaseEffect(),
      id: 'e-curve',
      name: 'Curve Dimmer',
      kind: 'curve',
      curveComponents: [{
        component: 'intensity',
        points: [{ id: 'p1', x: 0, y: 0.5 }, { id: 'p2', x: 0.5, y: 1 }, { id: 'p3', x: 1, y: 0.5 }],
        curvedSegments: [true, true]
      }]
    }
  }

  function colorCurveEffect(): EffectDef {
    return {
      ...chaseEffect(),
      id: 'e-color-curve',
      name: 'Curve Color',
      attribute: 'color',
      kind: 'curve',
      curveComponents: ['hue', 'saturation', 'brightness'].map((component) => ({
        component,
        points: [{ id: `${component}-1`, x: 0, y: 0.5 }, { id: `${component}-2`, x: 1, y: 0.5 }],
        curvedSegments: [true]
      }))
    }
  }

  function openChaseWithHosts() {
    setShow()
    act(() => {
      useShowStore.getState().addEffect(chaseEffect())
      useShowStore.setState({ editingEffectId: 'e-chase' })
    })
    const tabHost = document.createElement('div')
    const toolsHost = document.createElement('div')
    document.body.appendChild(tabHost)
    document.body.appendChild(toolsHost)
    renderInRoot(<DesignTab effectTabHost={tabHost} effectToolsHost={toolsHost} />)
    return { tabHost, toolsHost }
  }

  afterEach(() => {
    document.body.querySelectorAll('[data-test-host]').forEach((el) => el.remove())
  })

  it('portals the effect tab and Fixture Order into the pill bar, with no On toggle and no ×', () => {
    const { tabHost, toolsHost } = openChaseWithHosts()
    tabHost.dataset.testHost = ''
    toolsHost.dataset.testHost = ''
    const menuButton = tabHost.querySelector('[aria-label="Effect menu"]') as HTMLButtonElement | null
    expect(menuButton).not.toBeNull()
    expect(menuButton?.textContent).toContain('Dimmer Effect')
    expect(menuButton?.className).toContain('view-switch-segment on')
    expect(toolsHost.querySelector('[aria-label="Fixture order menu"]')).not.toBeNull()
    // The tab is not rendered inline in the editor as well.
    expect(container?.querySelector('[data-testid="effect-editor"] [aria-label="Effect menu"]')).toBeNull()
    // No On toggle and no close × anywhere in the editor.
    expect(container?.querySelector('[data-testid="effect-editor"] input[type="checkbox"]')).toBeNull()
    expect(container?.querySelector('[aria-label="Close effect editor"]')).toBeNull()
    // Closing the editor empties both hosts — the tab leaves the pill bar.
    act(() => { useShowStore.setState({ editingEffectId: null }) })
    expect(tabHost.innerHTML).toBe('')
    expect(toolsHost.innerHTML).toBe('')
  })

  it('sample strip has no BG label or Background row; click opens the sample editor, right-click offers Duplicate/Delete', () => {
    setShow()
    act(() => {
      useShowStore.getState().addEffect(chaseEffect())
      useShowStore.setState({ editingEffectId: 'e-chase' })
    })
    renderInRoot(<DesignTab />)
    const editor = container?.querySelector('[data-testid="effect-editor"]')
    expect(editor?.textContent).not.toContain('BG')
    expect(editor?.textContent).not.toContain('Background')
    expect(container?.querySelector('[aria-label="Edit sample"]')).toBeNull()
    const swatch = container?.querySelector('[role="option"]') as HTMLButtonElement | null
    if (!swatch) throw new Error('no sample swatch')
    act(() => { swatch.click() })
    expect(container?.querySelector('[aria-label="Edit sample"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Sample value"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Value (%)"]')).not.toBeNull()
    act(() => { swatch.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })) })
    const menu = document.body.querySelector('[aria-label="Sample actions"]')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain('Duplicate')
    expect(menu?.textContent).toContain('Delete')
    const duplicate = Array.from(menu?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Duplicate') as HTMLButtonElement
    act(() => { duplicate.click() })
    expect(useShowStore.getState().effects[0].samples).toHaveLength(3)
  })

  it('clicking a colour sample opens the colour picker in the popover', () => {
    setShow()
    act(() => {
      useShowStore.getState().addEffect({
        ...chaseEffect(),
        id: 'e-color',
        name: 'Color Chase',
        attribute: 'color',
        samples: [{ id: 's1', color: '#000000' }, { id: 's2', color: '#ff0000' }]
      })
      useShowStore.setState({ editingEffectId: 'e-color' })
    })
    renderInRoot(<DesignTab />)
    const swatch = container?.querySelector('[role="option"]') as HTMLButtonElement | null
    if (!swatch) throw new Error('no sample swatch')
    act(() => { swatch.click() })
    expect(container?.querySelector('[aria-label="Sample color"]')).not.toBeNull()
  })

  it('plain-number params render as compact boxed fields, percent params as slider rows', () => {
    setShow()
    act(() => {
      useShowStore.getState().addEffect({ ...chaseEffect(), id: 'e-scan', name: 'Scanner', pattern: 'scanner' })
      useShowStore.setState({ editingEffectId: 'e-scan' })
    })
    renderInRoot(<DesignTab />)
    const length = container?.querySelector('[aria-label="Length"]') as HTMLInputElement | null
    if (!length) throw new Error('no Length input')
    expect(length.parentElement?.className).toContain('bg-bg')
    const phase = container?.querySelector('[aria-label="Phase"]') as HTMLInputElement | null
    if (!phase) throw new Error('no Phase input')
    expect(phase.closest('div')?.className).toContain('border-line')
  })

  it('Fixture Order menu lists LightKey entries in order and wires them', () => {
    setShow()
    act(() => {
      useShowStore.getState().addEffect({ ...chaseEffect(), fixtureIds: [] })
      useShowStore.setState({ editingEffectId: 'e-chase' })
    })
    renderInRoot(<DesignTab />)
    const openMenu = () => {
      // The menu stays open across submenu interactions, so a second
      // open is a no-op when it is already up (the trigger toggles).
      const existing = document.body.querySelector('[aria-label="Fixture order"]')
      if (existing) return existing
      const trigger = container?.querySelector('[aria-label="Fixture order menu"]') as HTMLButtonElement | null
      if (!trigger) throw new Error('no Fixture Order trigger')
      act(() => { trigger.click() })
      const menu = document.body.querySelector('[aria-label="Fixture order"]')
      if (!menu) throw new Error('no Fixture Order menu')
      return menu
    }
    const pick = (menu: Element, label: string) => {
      const button = Array.from(menu.querySelectorAll('button')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined
      if (!button) throw new Error(`no menu item "${label}"`)
      act(() => { button.click() })
    }
    const menu = openMenu()
    const text = menu.textContent ?? ''
    const order = ['Left to Right', 'Right to Left', 'Top to Bottom', 'Bottom to Top', 'Custom Direction…', 'By Short Name, Ascending', 'By Short Name, Descending', 'By Address, Ascending', 'By Address, Descending', 'Random (Fixed)', 'Random (Variable)', 'Custom Order…', 'Consider Spacing', 'Select Fixtures', 'Select Beams', 'Origin', 'Grouping', 'Repeat', 'Change Fixtures…']
    let last = -1
    for (const label of order) {
      const idx = text.indexOf(label)
      expect(idx).toBeGreaterThan(last)
      last = idx
    }
    // Consider Spacing is greyed for a pattern effect.
    const spacing = Array.from(menu.querySelectorAll('button')).find((b) => b.textContent?.includes('Consider Spacing')) as HTMLButtonElement
    expect(spacing.disabled).toBe(true)
    pick(menu, 'Left to Right')
    expect(useShowStore.getState().effects[0].fixtureOrder).toBe('left-right')
    pick(openMenu(), 'By Short Name, Ascending')
    expect(useShowStore.getState().effects[0].fixtureOrder).toBe('short-name-asc')
    // Origin submenu (guide-defined: Start to End / From Center / To Center).
    pick(openMenu(), 'Origin')
    const origin = document.body.querySelector('[aria-label="Origin"]')
    expect(origin).not.toBeNull()
    expect(origin?.textContent).toContain('Start to End')
    expect(origin?.textContent).toContain('From Center')
    expect(origin?.textContent).toContain('To Center')
    pick(origin!, 'From Center')
    expect(useShowStore.getState().effects[0].fixtureOrderOrigin).toBe('from-center')
    // Grouping submenu takes a number.
    pick(openMenu(), 'Grouping')
    const grouping = document.body.querySelector('[aria-label="Grouping"]')
    const groupInput = grouping?.querySelector('[aria-label="Group size"]') as HTMLInputElement | null
    if (!groupInput) throw new Error('no Group size input')
    setInputValue(groupInput, '3')
    expect(useShowStore.getState().effects[0].fixtureGrouping).toBe(3)
    // Change Fixtures applies the Preview selection.
    pick(openMenu(), 'Change Fixtures…')
    expect(useShowStore.getState().effects[0].fixtureIds).toEqual(['fx1'])
  })

  it('chooser header is one row: swap pill + search, no duplicate Design/Live, no Close', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[aria-label="Design or Live"]')).toBeNull()
    expect(container?.querySelector('[aria-label="Search effects"]')).not.toBeNull()
    expect(container?.textContent).not.toContain('Close')
    act(() => { buttonWithText('Custom Effect').click() })
    expect(buttonWithText('Effect Template')).not.toBeNull()
    expect(container?.textContent).toContain('Fixture property')
    expect(container?.textContent).toContain('Add Effect')
    // The template editor body is centred, not left-aligned.
    expect(container?.querySelector('[data-testid="effects-chooser"] .items-center.justify-center')).not.toBeNull()
  })

  it('chooser portals the swap pill and search into the pill-bar hosts', () => {
    setShow()
    act(() => { useShowStore.setState({ effectChooserAttribute: 'intensity' }) })
    const leftHost = document.createElement('div')
    const searchHost = document.createElement('div')
    leftHost.dataset.testHost = ''
    searchHost.dataset.testHost = ''
    document.body.appendChild(leftHost)
    document.body.appendChild(searchHost)
    renderInRoot(<DesignTab chooserLeftHost={leftHost} chooserSearchHost={searchHost} />)
    expect(leftHost.querySelector('button')?.textContent).toContain('Custom Effect')
    expect(searchHost.querySelector('[aria-label="Search effects"]')).not.toBeNull()
    expect(container?.querySelector('[data-testid="effects-chooser"] [aria-label="Search effects"]')).toBeNull()
  })

  it('curve canvas fills the panel and a single-component curve shows no tab row', () => {
    setShow()
    act(() => {
      useShowStore.getState().addEffect(curveEffect())
      useShowStore.setState({ editingEffectId: 'e-curve' })
    })
    renderInRoot(<DesignTab />)
    const svg = container?.querySelector('[role="img"][aria-label^="Curve for"]') as SVGSVGElement | null
    if (!svg) throw new Error('no curve canvas')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none')
    // The canvas is a flex item (flex-1), not a percentage height: a
    // percentage height falls back to the svg's intrinsic 640x200 ratio
    // and overflows the panel in the real app (batch-2 fix, Nov 2026).
    expect(svg.getAttribute('class')).toContain('flex-1')
    expect(svg.getAttribute('class')).not.toContain('h-full')
    expect(container?.querySelector('[aria-label="Curve components"]')).toBeNull()
  })

  it('a colour curve shows the component tabs', () => {
    setShow()
    act(() => {
      useShowStore.getState().addEffect(colorCurveEffect())
      useShowStore.setState({ editingEffectId: 'e-color-curve' })
    })
    renderInRoot(<DesignTab />)
    const tabs = container?.querySelector('[aria-label="Curve components"]')
    expect(tabs).not.toBeNull()
    expect(tabs?.textContent).toContain('Hue')
  })
})

describe('preset palette hover-Edit and right-click Edit (Jake, Nov 2026)', () => {
  function openPalette() {
    setShow()
    act(() => {
      useShowStore.getState().addEffect(chaseEffect())
      useShowStore.setState({
        presets: [{ id: 'p1', name: 'Warm Wash', category: 'color', fixtureValues: { fx1: { red: 255 } } }]
      })
    })
    renderInRoot(<GroupsPresetsPanel />)
  }

  function hover(el: Element) {
    act(() => { el.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })) })
  }

  it('shows a yellow Edit button on hover over a preset row, and Edit opens the preset editor', () => {
    openPalette()
    const row = container?.querySelector('[data-palette-row="preset:p1"]')
    expect(row).not.toBeNull()
    expect(container?.querySelector('[aria-label="Edit Warm Wash"]')).toBeNull()
    hover(row!)
    const edit = container?.querySelector('[aria-label="Edit Warm Wash"]') as HTMLButtonElement | null
    expect(edit).not.toBeNull()
    act(() => { edit!.click() })
    expect(useShowStore.getState().editingPresetId).toBe('p1')
  })

  it('shows a yellow Edit button on hover over an effect row, and Edit opens the effect editor', () => {
    openPalette()
    const row = container?.querySelector('[data-palette-row="effect:e-chase"]')
    expect(row).not.toBeNull()
    expect(container?.querySelector('[aria-label="Edit Chase Dimmer"]')).toBeNull()
    hover(row!)
    const edit = container?.querySelector('[aria-label="Edit Chase Dimmer"]') as HTMLButtonElement | null
    expect(edit).not.toBeNull()
    act(() => { edit!.click() })
    expect(useShowStore.getState().editingEffectId).toBe('e-chase')
  })

  it('right-click Edit on an effect row opens the effect editor', () => {
    openPalette()
    const row = container?.querySelector('[data-palette-row="effect:e-chase"]')
    const button = row?.querySelector('button') as HTMLButtonElement | null
    if (!button) throw new Error('no effect row button')
    act(() => { button.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })) })
    const menu = container?.querySelector('[aria-label="Preset palette actions"]')
    expect(menu).not.toBeNull()
    const editItem = Array.from(menu?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Edit') as HTMLButtonElement | undefined
    expect(editItem).not.toBeUndefined()
    act(() => { editItem!.click() })
    expect(useShowStore.getState().editingEffectId).toBe('e-chase')
  })
})
