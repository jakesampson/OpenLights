// @vitest-environment jsdom
// 19 Nov 2026, Jake: right-click → New Preset sometimes left the name
// box unfocused, so typing went nowhere. Focus is applied synchronously
// in a layout effect when the rename box opens, so the input is focused
// in the same commit as the click.
// 22 Nov 2026, Jake: the New Preset form is gone — creation is
// immediate with LightKey's auto-name, and the new row opens in rename
// mode with the name SELECTED, ready to type over. These tests cover
// that: the rename box is focused with the auto-name selected, and
// typing + Enter renames the preset.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { GroupsPresetsPanel } from '../src/renderer/src/components/GroupsPresetsPanel'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Add electronAPI to the real jsdom window — do not replace window itself,
// or React's commit path (window.HTMLIFrameElement) breaks.
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  setChannels: () => {},
  listOflProfiles: () => Promise.resolve([])
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

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

function rowTreeItem() {
  const row = container?.querySelector('[data-palette-row="preset:p1"]') as HTMLElement | null
  expect(row).not.toBeNull()
  // The context-menu handler lives on the inner treeitem div, not the
  // outer data-palette-row wrapper — dispatch there, as a real right-click
  // on the row would.
  const treeItem = row!.querySelector('[role="treeitem"]') as HTMLElement | null
  expect(treeItem).not.toBeNull()
  return { row: row!, treeItem: treeItem! }
}

function seedPanel() {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  act(() => {
    useShowStore.setState({
      show: { ...base, presetGroups: [], sequences: [] },
      presets: [{ id: 'p1', name: 'Red', category: 'color', fixtureValues: {} }],
      cues: []
    })
  })
  renderInRoot(<GroupsPresetsPanel />)
}

// A look with something touched: fixture f1 (a par) selected, dimmer
// overridden to 71 (28%) — what New Preset captures. Seeded through
// setShow, which migrates the fixtures (attaching their profiles); a
// raw setState leaves fixtureAttributes empty and nothing captures.
function seedTouchedLook() {
  const s = useShowStore.getState()
  act(() => {
    s.setShow(migrateShow({
      fixtures: [{ id: 'f1', name: 'Front 1', type: 'par', channelStart: 1, channels: 4 }],
      cues: [],
      fixtureGroups: []
    }))
    // setShow resets the selection and overrides — set them after it.
    useShowStore.setState({ presets: [], selectedFixtureIds: ['f1'], manualOverrides: { f1: { intensity: 71 } } })
  })
  renderInRoot(<GroupsPresetsPanel />)
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

function openBlankSpaceMenu() {
  const panel = container?.querySelector('[aria-label="Preset palette panel"]') as HTMLElement | null
  expect(panel).not.toBeNull()
  // The dispatch and the query must not sit inside an outer act():
  // a nested act() defers the flush, so the menu is not in the DOM yet
  // when the menuitem is looked up.
  act(() => {
    panel!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 400 }))
  })
  const menuItem = [...(container?.querySelectorAll('[role="menuitem"]') ?? [])].find((el) => el.textContent === 'New Preset') as HTMLElement | undefined
  expect(menuItem).toBeDefined()
  return menuItem!
}

describe('Preset palette rename focus', () => {
  it('right-click → New Preset creates immediately, auto-named, in rename mode with the name selected', async () => {
    seedTouchedLook()
    await act(async () => {})
    const menuItem = openBlankSpaceMenu()
    act(() => { menuItem.click() })
    // No name box, no category dropdown, no Create — the preset exists
    // at once, named from the dimmer (71/255 = 28%).
    expect(container?.querySelector('[aria-label="New preset name"]')).toBeNull()
    expect(useShowStore.getState().presets).toHaveLength(1)
    expect(useShowStore.getState().presets[0].name).toBe('28%')
    const rename = container?.querySelector('[aria-label="Rename preset"]') as HTMLInputElement | null
    expect(rename).not.toBeNull()
    expect(rename!.value).toBe('28%')
    // No awaited tick between the click and this check: the input must
    // already be focused in the same commit, or a fast first keystroke
    // would go nowhere — and the auto-name must be selected, so typing
    // replaces it instead of appending to it.
    expect(document.activeElement).toBe(rename)
    expect(rename!.selectionStart).toBe(0)
    expect(rename!.selectionEnd).toBe('28%'.length)
  })

  it('typing in the rename box after creation renames the preset', async () => {
    seedTouchedLook()
    await act(async () => {})
    const menuItem = openBlankSpaceMenu()
    act(() => { menuItem.click() })
    const rename = container?.querySelector('[aria-label="Rename preset"]') as HTMLInputElement | null
    expect(rename).not.toBeNull()
    setInputValue(rename!, 'My Look')
    act(() => {
      rename!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(useShowStore.getState().presets[0].name).toBe('My Look')
    expect(container?.querySelector('[aria-label="Rename preset"]')).toBeNull()
  })

  it('focuses the rename box when Enter renames the selected preset', async () => {
    seedPanel()
    await act(async () => {})
    const { row, treeItem } = rowTreeItem()
    act(() => {
      treeItem.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    act(() => {
      row!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const rename = container?.querySelector('[aria-label="Rename preset"]') as HTMLInputElement | null
    expect(rename).not.toBeNull()
    expect(document.activeElement).toBe(rename)
    // The existing name is selected here too, so typing replaces it.
    expect(rename!.selectionStart).toBe(0)
    expect(rename!.selectionEnd).toBe('Red'.length)
  })
})
