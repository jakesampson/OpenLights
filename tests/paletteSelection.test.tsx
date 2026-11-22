// Jake, 22 Nov 2026 — LightKey's palette: no ON badge, the row
// highlight IS the indicator; a plain click selects one row alone
// (it drives the output until clicked off), Shift/Cmd/Ctrl-click
// toggles membership in the selection, and clicking blank space in
// the palette clears the whole selection. Each preset row's dot is
// the preset's actual colour (a dimmer-only preset shows a sun
// icon). Effects share the same selection as presets — a plain
// click on an effect selects it alone, so the presets go off and
// the other effects stop.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { GroupsPresetsPanel } from '../src/renderer/src/components/GroupsPresetsPanel'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

function seedPresets() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [{ id: 'fx1', name: 'Test Wash', type: 'par', channelStart: 1, channels: 4 }],
    cues: [],
    cueLists: []
  }))
  act(() => {
    useShowStore.setState({
      presets: [
        { id: 'red', name: 'Red', category: 'color', fixtureValues: { fx1: { red: 255, green: 0, blue: 0 } } },
        { id: 'green', name: 'Green', category: 'color', fixtureValues: { fx1: { red: 0, green: 255, blue: 0 } } },
        { id: 'full', name: 'Full On', category: 'intensity', fixtureValues: { fx1: { intensity: 255 } } }
      ],
      selectedFixtureIds: ['fx1'],
      activePresetIds: [],
      previewPresetId: null,
      activeCueId: null,
      editingPresetId: null,
      manualOverrides: {}
    })
  })
}

function seedEffects() {
  act(() => {
    useShowStore.setState({
      effects: [
        { id: 'kitt', name: 'K.I.T.T.', fixtureIds: ['fx1'], attribute: 'intensity', waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 128, enabled: false },
        { id: 'fire', name: 'Fire', fixtureIds: ['fx1'], attribute: 'intensity', waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 128, enabled: false }
      ]
    })
  })
}

function presetRow(id: string) {
  const row = container?.querySelector(`[data-palette-row="preset:${id}"] [role="treeitem"]`) as HTMLElement | null
  if (!row) throw new Error(`preset row ${id} not rendered`)
  return row
}

function rowOuter(id: string) {
  return container?.querySelector(`[data-palette-row="preset:${id}"]`) as HTMLElement | null
}

function rowHighlighted(id: string) {
  return rowOuter(id)?.className.includes('bg-panel2') ?? false
}

function clickPreset(id: string, opts: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {}) {
  act(() => { presetRow(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true, ...opts })) })
}

function effectRow(id: string) {
  const row = container?.querySelector(`[data-palette-row="effect:${id}"] [role="treeitem"]`) as HTMLElement | null
  if (!row) throw new Error(`effect row ${id} not rendered`)
  return row
}

function effectRowOuter(id: string) {
  return container?.querySelector(`[data-palette-row="effect:${id}"]`) as HTMLElement | null
}

function effectHighlighted(id: string) {
  return effectRowOuter(id)?.className.includes('bg-panel2') ?? false
}

function effectEnabled(id: string) {
  return useShowStore.getState().effects.find((effect) => effect.id === id)?.enabled ?? false
}

function clickEffect(id: string, opts: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {}) {
  act(() => { effectRow(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true, ...opts })) })
}

function clickBlankSpace() {
  const tree = container?.querySelector('[role="tree"]') as HTMLElement | null
  if (!tree) throw new Error('palette tree not rendered')
  act(() => { tree.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function pressEscape() {
  const tree = container?.querySelector('[role="tree"]') as HTMLElement | null
  if (!tree) throw new Error('palette tree not rendered')
  act(() => { tree.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })) })
}

beforeEach(() => { useShowStore.getState().setShow(null) })

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
})

describe('palette selection (LightKey)', () => {
  it('has no ON badge anywhere in the palette', () => {
    seedPresets()
    renderInRoot(<GroupsPresetsPanel />)
    clickPreset('red')
    clickPreset('green', { shiftKey: true })
    const badges = [...(container?.querySelectorAll('span') ?? [])].filter((el) => el.textContent === 'ON' || el.textContent === 'on')
    expect(badges).toHaveLength(0)
  })

  it('plain click selects one preset alone and replaces the selection', () => {
    seedPresets()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickPreset('red')
    expect(s().activePresetIds).toEqual(['red'])
    expect(s().previewPresetId).toBe('red')
    expect(rowHighlighted('red')).toBe(true)

    // Clicking the next preset stops the first and previews the next.
    clickPreset('green')
    expect(s().activePresetIds).toEqual(['green'])
    expect(s().previewPresetId).toBe('green')
    expect(rowHighlighted('red')).toBe(false)
    expect(rowHighlighted('green')).toBe(true)
  })

  it('clicking the selected preset again deselects it', () => {
    seedPresets()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickPreset('green')
    expect(s().activePresetIds).toEqual(['green'])
    clickPreset('green')
    expect(s().activePresetIds).toEqual([])
    expect(s().previewPresetId).toBeNull()
    expect(rowHighlighted('green')).toBe(false)
  })

  it('shift-click and cmd-click toggle membership additively', () => {
    seedPresets()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickPreset('red', { shiftKey: true })
    clickPreset('green', { shiftKey: true })
    // Both highlighted, most recently added last (activation order —
    // the resolution layer lets the most recent colour win).
    expect(s().activePresetIds).toEqual(['red', 'green'])
    expect(s().previewPresetId).toBe('green')
    expect(rowHighlighted('red')).toBe(true)
    expect(rowHighlighted('green')).toBe(true)

    // Cmd/Ctrl-click drops Green back out, leaving Red.
    clickPreset('green', { metaKey: true })
    expect(s().activePresetIds).toEqual(['red'])
    expect(s().previewPresetId).toBe('red')
    expect(rowHighlighted('green')).toBe(false)
    expect(rowHighlighted('red')).toBe(true)
  })

  it('clicking blank space in the palette clears the whole selection', () => {
    seedPresets()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickPreset('red', { shiftKey: true })
    clickPreset('green', { shiftKey: true })
    expect(s().activePresetIds).toEqual(['red', 'green'])

    const tree = container?.querySelector('[role="tree"]') as HTMLElement | null
    if (!tree) throw new Error('palette tree not rendered')
    act(() => { tree.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(s().activePresetIds).toEqual([])
    expect(s().previewPresetId).toBeNull()
    expect(rowHighlighted('red')).toBe(false)
    expect(rowHighlighted('green')).toBe(false)
  })

  it('Escape clears the whole selection', () => {
    seedPresets()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickPreset('red')
    expect(s().activePresetIds).toEqual(['red'])

    const tree = container?.querySelector('[role="tree"]') as HTMLElement | null
    if (!tree) throw new Error('palette tree not rendered')
    act(() => { tree.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })) })
    expect(s().activePresetIds).toEqual([])
    expect(s().previewPresetId).toBeNull()
  })

  it('dots show the preset colour, dimmer presets show a sun icon', () => {
    seedPresets()
    renderInRoot(<GroupsPresetsPanel />)

    const redDot = rowOuter('red')?.querySelector('.dot') as HTMLElement | null
    expect(redDot?.style.backgroundColor).toBe('rgb(220, 0, 0)')
    const greenDot = rowOuter('green')?.querySelector('.dot') as HTMLElement | null
    expect(greenDot?.style.backgroundColor).toBe('rgb(0, 220, 0)')

    // A dimmer-only preset has no colour to show — a sun icon, as in
    // LightKey's "100%" row, and no dot at all.
    expect(rowOuter('full')?.querySelector('.dot')).toBeNull()
    expect(rowOuter('full')?.textContent).toContain('☀')
  })

  it('hovering a preset row reveals the Edit button', () => {
    seedPresets()
    renderInRoot(<GroupsPresetsPanel />)

    expect(container?.querySelector('button[aria-label="Edit Red"]')).toBeNull()
    act(() => { rowOuter('red')?.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })) })
    expect(container?.querySelector('button[aria-label="Edit Red"]')).not.toBeNull()
  })
})

describe('palette selection — effects share the preset selection', () => {
  it('plain click on an effect selects it alone and releases the presets', () => {
    seedPresets()
    seedEffects()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickPreset('red')
    expect(s().activePresetIds).toEqual(['red'])

    // The effect replaces the preset — it does not stack on top of it.
    clickEffect('kitt')
    expect(s().activePresetIds).toEqual([])
    expect(s().previewPresetId).toBeNull()
    expect(effectEnabled('kitt')).toBe(true)
    expect(effectEnabled('fire')).toBe(false)
    expect(effectHighlighted('kitt')).toBe(true)
    expect(rowHighlighted('red')).toBe(false)
  })

  it('plain click on a preset stops the enabled effects', () => {
    seedPresets()
    seedEffects()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickEffect('kitt')
    expect(effectEnabled('kitt')).toBe(true)

    clickPreset('red')
    expect(effectEnabled('kitt')).toBe(false)
    expect(effectHighlighted('kitt')).toBe(false)
    expect(s().activePresetIds).toEqual(['red'])
    expect(rowHighlighted('red')).toBe(true)
  })

  it('plain click on another effect replaces the first', () => {
    seedPresets()
    seedEffects()
    renderInRoot(<GroupsPresetsPanel />)

    clickEffect('kitt')
    expect(effectEnabled('kitt')).toBe(true)
    clickEffect('fire')
    expect(effectEnabled('kitt')).toBe(false)
    expect(effectEnabled('fire')).toBe(true)
    expect(effectHighlighted('kitt')).toBe(false)
    expect(effectHighlighted('fire')).toBe(true)
  })

  it('clicking the selected effect again deselects it', () => {
    seedPresets()
    seedEffects()
    renderInRoot(<GroupsPresetsPanel />)

    clickEffect('kitt')
    expect(effectEnabled('kitt')).toBe(true)
    clickEffect('kitt')
    expect(effectEnabled('kitt')).toBe(false)
    expect(effectHighlighted('kitt')).toBe(false)
  })

  it('shift-click adds an effect on top of a preset, cmd-click drops it out', () => {
    seedPresets()
    seedEffects()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickPreset('red', { shiftKey: true })
    clickEffect('kitt', { shiftKey: true })
    expect(s().activePresetIds).toEqual(['red'])
    expect(effectEnabled('kitt')).toBe(true)
    expect(rowHighlighted('red')).toBe(true)
    expect(effectHighlighted('kitt')).toBe(true)

    clickEffect('kitt', { metaKey: true })
    expect(effectEnabled('kitt')).toBe(false)
    expect(effectHighlighted('kitt')).toBe(false)
    expect(s().activePresetIds).toEqual(['red'])
    expect(rowHighlighted('red')).toBe(true)
  })

  it('clicking blank space clears the effects too', () => {
    seedPresets()
    seedEffects()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    clickPreset('red', { shiftKey: true })
    clickEffect('kitt', { shiftKey: true })
    expect(s().activePresetIds).toEqual(['red'])
    expect(effectEnabled('kitt')).toBe(true)

    clickBlankSpace()
    expect(s().activePresetIds).toEqual([])
    expect(effectEnabled('kitt')).toBe(false)
    expect(effectHighlighted('kitt')).toBe(false)
    expect(rowHighlighted('red')).toBe(false)
  })

  it('Escape clears the effects too', () => {
    seedPresets()
    seedEffects()
    renderInRoot(<GroupsPresetsPanel />)

    clickEffect('kitt')
    expect(effectEnabled('kitt')).toBe(true)
    pressEscape()
    expect(effectEnabled('kitt')).toBe(false)
    expect(effectHighlighted('kitt')).toBe(false)
  })
})
