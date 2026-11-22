// Jake, 22 Nov 2026 — the rename/new-preset name box got stuck: Enter
// did nothing, clicking off did nothing, and typing sometimes went
// nowhere. Three root causes, all pinned here:
//  (1) Clicking off onto the Preview never fired blur — the Preview
//      canvas preventDefaults pointerdown, so focus never moved. A
//      window pointerdown (capture) listener now commits the rename
//      on any pointerdown outside the input.
//  (2) The input was focused only by an effect on the `renaming` state,
//      so a preset created into a collapsed group (or behind a search
//      that did not match its auto-name) mounted its input after the
//      effect had already run against a null ref — no focus, no typing.
//      The input now focuses itself via a stable callback ref on mount,
//      and creating a preset expands its group and clears a
//      non-matching search so the row is visible.
//  (3) Enter on the tree while a rename was already open restarted the
//      rename from the stored name, wiping the typed text. It commits.
// Why the previous tests missed it: they only exercised the happy path
// (input already mounted and focused, Enter in the input) — jsdom has
// no pointerdown-preventDefault focus semantics, and the panel tests
// never rendered the Preview, so the click-off path was never driven.
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

beforeEach(() => {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [{ id: 'f1', name: 'Front 1', type: 'par', channelStart: 1, channels: 4 }],
    cues: [],
    fixtureGroups: []
  }))
  act(() => {
    useShowStore.setState({
      presets: [{ id: 'p1', name: 'Red', category: 'color', fixtureValues: {} }],
      cues: [],
      selectedFixtureIds: ['f1'],
      activePresetIds: [],
      previewPresetId: null,
      activeCueId: null,
      editingPresetId: null,
      manualOverrides: {}
    })
  })
  renderInRoot(<GroupsPresetsPanel />)
})

afterEach(() => {
  act(() => { rootNode?.unmount() })
  container?.remove()
  container = undefined
  rootNode = undefined
})

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

function presetTreeItem() {
  const item = container?.querySelector('[data-palette-row="preset:p1"] [role="treeitem"]') as HTMLElement | null
  if (!item) throw new Error('preset row not rendered')
  return item
}

function openRenameViaTreeEnter() {
  const row = presetTreeItem()
  act(() => { row.click() })
  act(() => {
    row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  const rename = container?.querySelector('[aria-label="Rename preset"]') as HTMLInputElement | null
  expect(rename).not.toBeNull()
  expect(document.activeElement).toBe(rename)
  return rename!
}

describe('palette rename keyboard paths', () => {
  it('Enter in the rename box commits the typed name and exits rename mode', async () => {
    await act(async () => {})
    const rename = openRenameViaTreeEnter()
    setInputValue(rename, 'Warm Red')
    act(() => {
      rename.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(useShowStore.getState().presets[0].name).toBe('Warm Red')
    expect(container?.querySelector('[aria-label="Rename preset"]')).toBeNull()
  })

  it('moving focus out of the rename box (blur) commits the typed name', async () => {
    await act(async () => {})
    const rename = openRenameViaTreeEnter()
    setInputValue(rename, 'Blurred Name')
    act(() => { rename.blur() })
    expect(useShowStore.getState().presets[0].name).toBe('Blurred Name')
    expect(container?.querySelector('[aria-label="Rename preset"]')).toBeNull()
  })

  it('Escape in the rename box cancels and keeps the old name', async () => {
    await act(async () => {})
    const rename = openRenameViaTreeEnter()
    setInputValue(rename, 'Discarded')
    act(() => {
      rename.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(useShowStore.getState().presets[0].name).toBe('Red')
    expect(container?.querySelector('[aria-label="Rename preset"]')).toBeNull()
  })

  it('pointerdown outside the rename box commits it — the Preview click-off case', async () => {
    await act(async () => {})
    const rename = openRenameViaTreeEnter()
    setInputValue(rename, 'Clicked Off')
    // The Preview canvas preventDefaults pointerdown, so a click there
    // never moves focus and never fires blur. The window capture
    // listener must commit on the pointerdown itself.
    act(() => {
      document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }))
    })
    expect(useShowStore.getState().presets[0].name).toBe('Clicked Off')
    expect(container?.querySelector('[aria-label="Rename preset"]')).toBeNull()
  })

  it('Enter on the tree while a rename is open commits instead of restarting it', async () => {
    await act(async () => {})
    const rename = openRenameViaTreeEnter()
    setInputValue(rename, 'Typed Name')
    const tree = container?.querySelector('[role="tree"]') as HTMLElement | null
    expect(tree).not.toBeNull()
    act(() => {
      tree!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(useShowStore.getState().presets[0].name).toBe('Typed Name')
    expect(container?.querySelector('[aria-label="Rename preset"]')).toBeNull()
  })

  it('creating a preset into a collapsed group expands it and focuses the rename', async () => {
    await act(async () => {})
    // Group p1 under "Spots", with a dimmer touched on f1 so the new
    // preset captures.
    act(() => {
      const show = useShowStore.getState().show!
      useShowStore.setState({
        show: { ...show, presetGroups: [{ id: 'g1', name: 'Spots', parentId: null, presetIds: ['p1'], sequenceIds: [] }] },
        manualOverrides: { f1: { intensity: 71 } }
      })
    })
    const groupItem = container?.querySelector('[data-palette-row="group:g1"] [role="treeitem"]') as HTMLElement | null
    expect(groupItem).not.toBeNull()
    // Collapse the group: its preset row unmounts.
    act(() => { groupItem!.click() })
    expect(container?.querySelector('[data-palette-row="preset:p1"]')).toBeNull()
    // Right-click the group row → New Preset.
    act(() => {
      groupItem!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    const menuItem = [...(container?.querySelectorAll('[role="menuitem"]') ?? [])].find((el) => el.textContent === 'New Preset') as HTMLElement | undefined
    expect(menuItem).toBeDefined()
    act(() => { menuItem!.click() })
    // The group expanded, the new preset (71/255 = 28%) exists, and its
    // rename box is mounted, focused, with the auto-name selected —
    // even though the input only mounted after the group expanded.
    expect(useShowStore.getState().presets).toHaveLength(2)
    expect(container?.querySelector('[data-palette-row="preset:p1"]')).not.toBeNull()
    const rename = container?.querySelector('[aria-label="Rename preset"]') as HTMLInputElement | null
    expect(rename).not.toBeNull()
    expect(rename!.value).toBe('28%')
    expect(document.activeElement).toBe(rename)
    expect(rename!.selectionStart).toBe(0)
    expect(rename!.selectionEnd).toBe('28%'.length)
  })
})
