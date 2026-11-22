// Jake, 22 Nov 2026 — LightKey's palette: no ON badge, the row
// highlight IS the indicator; a plain click selects one preset alone
// (it drives the output until clicked off), Shift/Cmd/Ctrl-click
// toggles membership in the selection, and clicking blank space in
// the palette clears the whole selection. Each row's dot is the
// preset's actual colour (a dimmer-only preset shows a sun icon).
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
