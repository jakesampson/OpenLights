// Context menu Group/Ungroup (Jake, 26 Nov 2026): the fixture menu
// shows Ungroup for a grouped selection and Group for an ungrouped
// one — and a mouse click on the item must actually reach its handler.
// Found by the Ungroup probe: the window pointerdown handler that
// dismisses the menu closed it between pointerdown and click, so no
// menu item could ever be clicked (a DOM .click() with no pointerdown
// worked, a real mouse click dispatched nothing).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { ContextMenu } from '../src/renderer/src/components/ContextMenu'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined
let commands: string[] = []
let keys: string[] = []

function onMenuCommand(event: Event) {
  commands.push((event as CustomEvent<{ command: string }>).detail.command)
}
function onKeyDown(event: Event) {
  keys.push((event as KeyboardEvent).key)
}

function renderMenu() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => {
    rootNode.render(
      <>
        <div data-context-menu="fixture" data-testid="target">target</div>
        <ContextMenu />
      </>
    )
  })
  return el
}

function setShow() {
  const state = () => useShowStore.getState()
  state().setShow(migrateShow({ fixtures: [
    { id: 'f1', name: 'Wash 1', type: 'dimmer', channels: 1, channelStart: 1 },
    { id: 'f2', name: 'Wash 2', type: 'dimmer', channels: 1, channelStart: 2 },
    { id: 'f3', name: 'Solo', type: 'dimmer', channels: 1, channelStart: 3 }
  ] }))
  state().selectFixtures(['f1', 'f2'])
  state().groupSelectedFixtures('Wash')
}

function openMenu() {
  const target = container!.querySelector('[data-testid="target"]')!
  act(() => {
    target.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }))
  })
}

function menuButtons() {
  return [...(container?.querySelectorAll('div[role="menu"] button') ?? [])]
}

function menuLabels() {
  return menuButtons().map((b) => b.firstChild?.textContent?.trim())
}

function menuButton(label: string) {
  return menuButtons().find((b) => b.firstChild?.textContent?.trim() === label)!
}

beforeEach(() => {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { setChannels: vi.fn(), getChannels: async () => [] }
  commands = []
  keys = []
  window.addEventListener('openlights-menu-command', onMenuCommand)
  window.addEventListener('keydown', onKeyDown)
})

afterEach(() => {
  window.removeEventListener('openlights-menu-command', onMenuCommand)
  window.removeEventListener('keydown', onKeyDown)
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
})

describe('fixture context menu Group/Ungroup', () => {
  it('shows Ungroup (not Group) for a grouped selection, and a mouse click dispatches it', () => {
    setShow()
    act(() => { useShowStore.getState().selectFixtures(['f1']) })
    renderMenu()
    openMenu()
    expect(menuLabels()).toContain('Ungroup')
    expect(menuLabels()).not.toContain('Group')
    const button = menuButton('Ungroup')
    // A pointerdown closes the menu in the real app (discrete event:
    // the close flushes before the click), so dispatch them in
    // separate acts — one act() would batch the close past the click
    // and hide the bug this test guards.
    act(() => {
      button.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
    })
    act(() => {
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(commands).toEqual(['ungroup'])
  })

  it('shows Group (not Ungroup) for an ungrouped selection, and a click synthesizes its shortcut', () => {
    setShow()
    act(() => { useShowStore.getState().selectFixtures(['f3']) })
    renderMenu()
    openMenu()
    expect(menuLabels()).toContain('Group')
    expect(menuLabels()).not.toContain('Ungroup')
    const button = menuButton('Group')
    act(() => {
      button.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
    })
    act(() => {
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(commands).toEqual([])
    expect(keys).toEqual(['g'])
  })

  it('a pointerdown outside the menu still dismisses it', () => {
    setShow()
    act(() => { useShowStore.getState().selectFixtures(['f1']) })
    renderMenu()
    openMenu()
    expect(container!.querySelector('div[role="menu"]')).not.toBeNull()
    act(() => {
      document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(container!.querySelector('div[role="menu"]')).toBeNull()
  })
})
