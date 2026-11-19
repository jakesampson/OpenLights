// @vitest-environment jsdom
// 19 Nov 2026, Jake: right-click → New Preset sometimes left the composer
// name box unfocused, so typing went nowhere. The composer relied on
// `autoFocus`, which the browser queues as a separate task — a fast
// keystroke after the click could land before focus arrived. Focus is now
// applied synchronously in a layout effect when the composer (or the rename
// box) opens, so the input is focused in the same commit as the click.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { GroupsPresetsPanel } from '../src/renderer/src/components/GroupsPresetsPanel'
import { useShowStore } from '../src/renderer/src/stores/showStore'

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

describe('Preset palette composer focus', () => {
  it('focuses the composer name box synchronously after right-click → New Preset', async () => {
    seedPanel()
    await act(async () => {})
    const { treeItem } = rowTreeItem()
    act(() => {
      treeItem.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    const menuItem = [...(container?.querySelectorAll('[role="menuitem"]') ?? [])].find((el) => el.textContent === 'New Preset') as HTMLElement | undefined
    expect(menuItem).toBeDefined()
    act(() => { menuItem!.click() })
    const composer = container?.querySelector('[aria-label="New preset name"]') as HTMLInputElement | null
    expect(composer).not.toBeNull()
    // No awaited tick between the click and this check: the input must
    // already be focused in the same commit, or a fast first keystroke
    // would go nowhere.
    expect(document.activeElement).toBe(composer)
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
  })
})
