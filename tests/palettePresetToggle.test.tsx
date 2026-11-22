// Jake, 22 Nov 2026 — clicking a preset in the Preset Palette a
// second time turns it off AND lets go of it: the row highlight goes
// away and the Preview value labels clear. The old handler always
// re-selected on a plain click, so after the second click the row
// stayed highlighted and labelled even though the preset was off
// (the ON badge was the only thing that went away).
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

function seedPreset() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [{ id: 'fx1', name: 'Test Wash', type: 'par', channelStart: 1, channels: 4 }],
    cues: [],
    cueLists: []
  }))
  act(() => {
    useShowStore.setState({
      presets: [{ id: 'p1', name: '28%', category: 'intensity', fixtureValues: { fx1: { intensity: 71 } } }],
      selectedFixtureIds: ['fx1'],
      activePresetIds: [],
      previewPresetId: null,
      activeCueId: null,
      editingPresetId: null,
      manualOverrides: {}
    })
  })
  return 'p1'
}

function presetRow() {
  const row = container?.querySelector('[data-palette-row="preset:p1"] [role="treeitem"]') as HTMLElement | null
  if (!row) throw new Error('preset row not rendered')
  return row
}

function rowSelected() {
  return presetRow().closest('[data-palette-row]')?.className.includes('bg-panel2') ?? false
}

beforeEach(() => { useShowStore.getState().setShow(null) })

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
})

describe('palette preset second click', () => {
  it('turns the preset off and lets go of the selection and labels', () => {
    const id = seedPreset()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    act(() => { presetRow().click() })
    expect(s().activePresetIds).toContain(id)
    expect(s().previewPresetId).toBe(id)
    expect(rowSelected()).toBe(true)

    act(() => { presetRow().click() })
    expect(s().activePresetIds).not.toContain(id)
    expect(s().previewPresetId).toBeNull()
    expect(rowSelected()).toBe(false)
  })

  it('shift-click still toggles the selection additively', () => {
    const id = seedPreset()
    renderInRoot(<GroupsPresetsPanel />)
    const s = () => useShowStore.getState()

    act(() => { presetRow().dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true })) })
    expect(s().activePresetIds).toContain(id)
    expect(s().previewPresetId).toBe(id)
    expect(rowSelected()).toBe(true)

    act(() => { presetRow().dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true })) })
    expect(s().activePresetIds).not.toContain(id)
    expect(s().previewPresetId).toBeNull()
    expect(rowSelected()).toBe(false)
  })
})
