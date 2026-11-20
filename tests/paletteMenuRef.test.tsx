// @vitest-environment jsdom
// 19 Nov 2026: the header "…" menu and the right-click context menu
// shared one `menuRef`, so after the first context menu unmounted
// React left the ref null (it is never re-assigned to the still-mounted
// header div) and outside-click-to-close stopped working for every
// menu after that. Each menu has its own ref now: opening a menu,
// clicking outside, and opening a menu again must close on outside
// click every time, in either order.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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

const contextMenu = () => container?.querySelector('[role="menu"][aria-label="Preset palette actions"]')
const headerMenu = () => container?.querySelector('[role="menu"][aria-label="Preset palette menu"]')

function openContextMenu() {
  const row = container?.querySelector('[data-palette-row="preset:p1"]') as HTMLElement | null
  expect(row).not.toBeNull()
  const treeItem = row!.querySelector('[role="treeitem"]') as HTMLElement | null
  expect(treeItem).not.toBeNull()
  act(() => {
    treeItem!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
  })
  expect(contextMenu()).not.toBeNull()
}

function openHeaderMenu() {
  // The "…" button and its dropdown share the aria-label; the button is
  // the one that opens the menu, the dropdown is role="menu".
  const opener = [...(container?.querySelectorAll('button[aria-label="Preset palette menu"]') ?? [])][0] as HTMLElement | undefined
  expect(opener).toBeDefined()
  act(() => { opener!.click() })
  expect(headerMenu()).not.toBeNull()
}

function clickOutside() {
  // The menus close on a window pointerdown outside them; a plain
  // pointerdown on the document body is outside both.
  act(() => {
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
  })
}

describe('Preset palette menus close on outside click, every time', () => {
  it('closes the context menu on outside click after a second open', async () => {
    seedPanel()
    await act(async () => {})
    openContextMenu()
    clickOutside()
    expect(contextMenu()).toBeNull()
    openContextMenu()
    clickOutside()
    expect(contextMenu()).toBeNull()
  })

  it('closes the header menu on outside click after a context menu has opened and closed', async () => {
    seedPanel()
    await act(async () => {})
    // This is the regression: with the shared ref, the context menu's
    // unmount left the ref null, so the header menu opened afterwards
    // never closed on outside click.
    openContextMenu()
    clickOutside()
    expect(contextMenu()).toBeNull()
    openHeaderMenu()
    clickOutside()
    expect(headerMenu()).toBeNull()
    // And the header menu still closes on a second open too.
    openHeaderMenu()
    clickOutside()
    expect(headerMenu()).toBeNull()
  })

  it('closes the context menu on outside click after a header menu has opened and closed', async () => {
    seedPanel()
    await act(async () => {})
    openHeaderMenu()
    clickOutside()
    expect(headerMenu()).toBeNull()
    openContextMenu()
    clickOutside()
    expect(contextMenu()).toBeNull()
  })
})
