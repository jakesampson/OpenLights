// Cue button menu (Jake, 27 Nov 2026 — LightKey cue editing, Video 1):
// right-clicking a Live button shows LightKey's button menu in verbatim
// order — Get Info, Show Properties, Edit Ad Hoc Properties, Add
// Overrides, Cut, Copy, Paste, Rename, Duplicate, Delete, Control
// Type, Behavior, Priority, Color, Modifiers, Font, Alignment, Remove
// From Frame, External Control. Go / Stop / Live view are NOT here —
// they live in the cue-list transport (Part 1) and on Space. Items that
// cannot act are disabled with the reason as a tooltip instead of a
// silent no-op.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { ContextMenu } from '../src/renderer/src/components/ContextMenu'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined
let infoEvents: unknown[] = []
let livePropertiesEvents = 0

function onCueInfo(event: Event) {
  infoEvents.push((event as CustomEvent).detail)
}
function onLiveProperties() {
  livePropertiesEvents += 1
}

function renderMenu() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => {
    rootNode.render(
      <>
        <div data-context-menu="page">
          <div data-project-id="btn-fullon" data-testid="target">Full On</div>
        </div>
        <ContextMenu />
      </>
    )
  })
  return el
}

const FULL_ON = { id: 'cue-fullon', name: 'Full On', fixtureValues: {}, fadeMs: 500 }

function seedShow(withCue = false) {
  const state = useShowStore.getState()
  state.setShow(migrateShow({
    fixtures: [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }],
    cues: [FULL_ON],
    cueLists: [],
    presets: [{ id: 'preset-fullon', name: 'Full On', category: 'intensity', fixtureValues: {} }],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [{ id: 'btn-fullon', name: 'Full On', type: 'toggle', cueId: withCue ? 'cue-fullon' : undefined, presetIds: ['preset-fullon'] }] }],
  } as unknown as ShowDef))
  act(() => { useShowStore.setState({ activeLivePageId: 'page1' }) })
  act(() => { useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: 'btn-fullon' }]) })
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

function buttonLabel(b: Element) {
  // Submenu parents carry a trailing '›', checked submenu items a
  // leading '✓ ' — strip both so the label is the item name.
  return b.textContent?.trim().replace(/^✓ /, '').replace(/›$/, '').trim() ?? ''
}

function menuButton(label: string) {
  const button = menuButtons().find((b) => buttonLabel(b) === label)
  expect(button).toBeTruthy()
  return button!
}

function menuLabels() {
  return menuButtons().map((b) => buttonLabel(b))
}

function realClick(button: Element) {
  // A pointerdown closes the menu in the real app (discrete event: the
  // close flushes before the click), so dispatch them in separate acts
  // — one act() would batch the close past the click and hide the bug
  // this guards (see contextMenuUngroup).
  act(() => { button.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })) })
  act(() => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

beforeEach(() => {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { setChannels: vi.fn(), getChannels: async () => [] }
  infoEvents = []
  livePropertiesEvents = 0
  window.addEventListener('openlights-open-cue-info', onCueInfo)
  window.addEventListener('openlights-open-live-properties', onLiveProperties)
})

afterEach(() => {
  window.removeEventListener('openlights-open-cue-info', onCueInfo)
  window.removeEventListener('openlights-open-live-properties', onLiveProperties)
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
})

describe('cue button menu (Video 1)', () => {
  it('lists LightKey’s items in order, with no Go / Stop / Live view', () => {
    seedShow()
    renderMenu()
    openMenu()
    expect(menuLabels()).toEqual([
      'Get Info', 'Show Properties', 'Edit Ad Hoc Properties', 'Add Overrides',
      'Cut', 'Copy', 'Paste', 'Rename', 'Duplicate', 'Delete',
      'Control Type', 'Behavior', 'Priority', 'Color', 'Modifiers', 'Font',
      'Alignment', 'Remove From Frame', 'External Control',
    ])
  })

  it('disables Add Overrides with no overrides, Paste with an empty clipboard, and the parked submenus', () => {
    seedShow()
    renderMenu()
    openMenu()
    expect(menuButton('Add Overrides').hasAttribute('disabled')).toBe(true)
    expect(menuButton('Add Overrides').getAttribute('title')).toBe('No overridden properties to add')
    expect(menuButton('Paste').hasAttribute('disabled')).toBe(true)
    expect(menuButton('Paste').getAttribute('title')).toBe('Nothing to paste')
    expect(menuButton('Priority').getAttribute('title')).toBe('Set the priority in the inspector')
    expect(menuButton('Modifiers').getAttribute('title')).toBe('Add modifiers in the inspector')
    expect(menuButton('Font').getAttribute('title')).toBe('Change the font in the inspector')
    expect(menuButton('External Control').getAttribute('title')).toBe('External control is set up in Settings')
    expect(menuButton('Remove From Frame').getAttribute('title')).toBe('Not in a frame')
  })

  it('Add Overrides is enabled with overrides present, and a real click adds them to the button', () => {
    seedShow()
    act(() => { useShowStore.getState().selectFixtures(['d1']) })
    act(() => { useShowStore.getState().setManualOverrides({ intensity: 255 }) })
    renderMenu()
    openMenu()
    const add = menuButton('Add Overrides')
    expect(add.hasAttribute('disabled')).toBe(false)
    realClick(add)
    const control = useShowStore.getState().show!.livePages![0].controls[0]
    expect(control.adHocValues?.d1?.intensity).toBe(255)
  })

  it('Get Info opens the contents inspector for the button', () => {
    seedShow()
    renderMenu()
    openMenu()
    realClick(menuButton('Get Info'))
    expect(infoEvents).toEqual([{ controlId: 'btn-fullon', tab: 'contents' }])
  })

  it('Edit Ad Hoc Properties opens the popup for a standalone button', () => {
    seedShow(false)
    renderMenu()
    openMenu()
    realClick(menuButton('Edit Ad Hoc Properties'))
    expect(livePropertiesEvents).toBe(1)
  })

  it('Edit Ad Hoc Properties opens the cue editor for a cue button', () => {
    seedShow(true)
    renderMenu()
    openMenu()
    realClick(menuButton('Edit Ad Hoc Properties'))
    expect(useShowStore.getState().editingCueAdHocId).toBe('cue-fullon')
  })

  it('Control Type submenu changes the button type', () => {
    seedShow()
    renderMenu()
    openMenu()
    realClick(menuButton('Control Type'))
    expect(menuLabels()).toContain('Toggle Button')
    expect(menuLabels()).toContain('Push Button')
    expect(menuLabels()).toContain('Fader')
    realClick(menuButton('Fader'))
    expect(useShowStore.getState().show!.livePages![0].controls[0].type).toBe('fader')
  })

  it('Behavior submenu toggles the push-button behavior', () => {
    seedShow()
    renderMenu()
    openMenu()
    realClick(menuButton('Behavior'))
    realClick(menuButton('Flash'))
    expect(useShowStore.getState().show!.livePages![0].controls[0].type).toBe('flash')
  })

  it('Color Automatic resets a manual colour', () => {
    seedShow()
    act(() => { useShowStore.getState().configureCueAppearance('btn-fullon', { color: '#ff0000' }) })
    renderMenu()
    openMenu()
    realClick(menuButton('Color'))
    realClick(menuButton('Automatic'))
    expect(useShowStore.getState().show!.livePages![0].controls[0].appearance?.color).toBe('#47235a')
  })
})
