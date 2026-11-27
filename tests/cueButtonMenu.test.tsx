// Cue button menu in Edit Mode (Jake, 27 Nov 2026 — LightKey cue
// editing, Video 1): right-clicking a button in Edit Mode shows
// LightKey's button menu instead of the canvas menu; Get Info opens
// the contents inspector, Rename opens the name input, Remove From
// Frame moves the button out of its frame. Right-clicking empty canvas
// still shows the canvas menu.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { frameMembers } from '../src/renderer/src/lib/liveFrames'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  onAppQuitting: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setChannels: vi.fn(),
  getChannels: () => Promise.resolve([]),
}
vi.stubGlobal('requestAnimationFrame', () => 1)
vi.stubGlobal('cancelAnimationFrame', vi.fn())

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

function seedShow() {
  useShowStore.getState().setShow(migrateShow({
    fixtures: [{ id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1 }],
    presets: [{ id: 'p-red', name: 'Red', category: 'color', fixtureValues: { d1: { red: 255, intensity: 255 } } }],
    sequences: [],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'btn1', name: 'Song 1', type: 'push', cue: { id: 'cue1', name: 'Song 1', presetIds: ['p-red'], sequenceIds: [], fixtureValues: {}, fadeMs: 500 }, presetIds: [], x: 20, y: 100, width: 120, height: 40 },
      { id: 'btn2', name: 'Standalone', type: 'push', behavior: 'flash', presetIds: ['p-red'], x: 160, y: 100, width: 120, height: 40 },
    ], annotations: [
      { id: 'frame1', type: 'frame', text: 'Set', x: 10, y: 90, width: 300, height: 130 },
    ] }],
  } as unknown as ShowDef))
  act(() => { useShowStore.setState({ activeLivePageId: 'page1' }) })
}

function switchToLive() {
  const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes('Live'))
  expect(segment).toBeTruthy()
  act(() => { segment!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
}

function enterEditMode() {
  const edit = Array.from(container!.querySelectorAll('.live-page-edit')).find((el) => el.textContent?.trim() === 'Edit')
  expect(edit).toBeTruthy()
  act(() => { edit!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(useShowStore.getState().liveEditing).toBe(true)
}

function exitEditMode() {
  const done = Array.from(container!.querySelectorAll('.live-page-edit')).find((el) => el.textContent?.trim() === 'Done')
  expect(done).toBeTruthy()
  act(() => { done!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(useShowStore.getState().liveEditing).toBe(false)
}

function rightClickButton(buttonId: string) {
  // In the real app the right-click's pointerdown selects the button
  // first; select it explicitly here, then dispatch the contextmenu.
  act(() => { useShowStore.getState().setPageObjectSelection([{ type: 'cue', id: buttonId }]) })
  const button = container!.querySelector(`[data-project-id="${buttonId}"]`)
  expect(button).toBeTruthy()
  act(() => { button!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })) })
}

function buttonMenu() {
  return container!.querySelector('[aria-label="Cue button actions"]') as HTMLElement | null
}

function menuButton(label: string) {
  const menu = buttonMenu()
  expect(menu).toBeTruthy()
  const button = Array.from(menu!.querySelectorAll('button')).find((b) => b.textContent?.trim().replace(/^✓ /, '').replace(/›$/, '').trim() === label)
  expect(button).toBeTruthy()
  return button!
}

function realClick(button: Element) {
  act(() => { button.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })) })
  act(() => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  renderInRoot(<App />)
  seedShow()
  switchToLive()
  enterEditMode()
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  container?.remove()
  container = undefined
  root = undefined
})

describe('cue button submenus fly out sideways (Jake, 27 Nov 2026)', () => {
  function submenu(label: string) {
    return container!.querySelector(`[aria-label="${label} options"]`) as HTMLElement | null
  }
  function hoverRow(label: string) {
    // React synthesises onPointerEnter from pointerover.
    const row = menuButton(label)
    act(() => { row.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true })) })
  }
  function escapeKey() {
    // Dispatch on the body, as a real keypress does: the menu's
    // capture-phase window listener must run before the app's
    // bubble-phase Escape handler (which stops the cue).
    act(() => { document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
  }

  it('a submenu opens as a separate sideways panel, not an inline expansion', () => {
    rightClickButton('btn1')
    expect(submenu('Color')).toBeNull()
    realClick(menuButton('Color'))
    const panel = submenu('Color')
    expect(panel).toBeTruthy()
    // Absolutely positioned beside the parent item — it cannot grow the
    // parent menu, the way the old inline expansion did.
    expect(panel!.className).toContain('absolute')
    expect(panel!.getAttribute('data-flyout-side')).toBe('right')
    // The old inline expansion indented the submenu inside the menu
    // column (ml-4); the fly-out is a separate panel, so no indent.
    expect(panel!.className).not.toContain('ml-4')
    // The parent menu's own items are unchanged in number.
    // (19 items + 5 separators in Edit mode.)
    expect(Array.from(buttonMenu()!.querySelectorAll(':scope > div')).length).toBe(24)
    expect(panel!.textContent).toContain('Automatic')
    // The swatches are colour bars (LightKey's look), not text rows.
    expect(panel!.querySelectorAll('button[aria-label$="button colour"]').length).toBe(12)
  })

  it('hovering another submenu item switches the open submenu', () => {
    rightClickButton('btn1')
    hoverRow('Color')
    expect(submenu('Color')).toBeTruthy()
    hoverRow('Behavior')
    expect(submenu('Color')).toBeNull()
    expect(submenu('Behavior')).toBeTruthy()
    expect(submenu('Behavior')!.textContent).toContain('Toggle')
    expect(submenu('Behavior')!.textContent).toContain('Flash')
  })

  it('hovering a plain item closes the open submenu', () => {
    rightClickButton('btn1')
    hoverRow('Color')
    expect(submenu('Color')).toBeTruthy()
    hoverRow('Get Info')
    expect(submenu('Color')).toBeNull()
  })

  it('clicking a submenu item acts and closes the whole menu', () => {
    rightClickButton('btn1')
    realClick(menuButton('Behavior'))
    const flash = Array.from(submenu('Behavior')!.querySelectorAll('button')).find((b) => b.textContent?.includes('Flash'))!
    realClick(flash)
    expect(buttonMenu()).toBeNull()
    const control = useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn1')!
    expect(control.type).toBe('push')
    expect(control.behavior).toBe('flash')
  })

  it('Escape closes the submenu first, then the menu', () => {
    rightClickButton('btn1')
    realClick(menuButton('Color'))
    expect(submenu('Color')).toBeTruthy()
    escapeKey()
    expect(submenu('Color')).toBeNull()
    expect(buttonMenu()).toBeTruthy()
    escapeKey()
    expect(buttonMenu()).toBeNull()
  })

  it('a disabled submenu does not open on hover', () => {
    // btn2 is a fader in this seed? No — btn2 is a push button with
    // Flash behaviour. Make btn1 a fader first: faders have no
    // behavior, so Behavior is disabled.
    act(() => { useShowStore.getState().configureControlType('btn1', 'faderHorizontal') })
    rightClickButton('btn1')
    const behavior = menuButton('Behavior')
    expect(behavior.hasAttribute('disabled')).toBe(true)
    hoverRow('Behavior')
    expect(submenu('Behavior')).toBeNull()
  })
})
describe('cue button menu contents, Edit mode (Jake, 27 Nov 2026)', () => {
  // These tests run in the same App render as the fly-out tests above
  // (Edit mode entered in beforeEach). The seed: btn1 is a Push Button
  // with Toggle behaviour holding cue1 (Red preset: red + intensity on
  // d1); btn2 is a Push Button with Flash behaviour holding p-red.
  function parentLabels() {
    const menu = buttonMenu()!
    return Array.from(menu.querySelectorAll(':scope > div > button')).map((b) => b.textContent?.trim().replace(/›$/, '').trim())
  }
  function submenuLabels(label: string) {
    const panel = container!.querySelector(`[aria-label="${label} options"]`)!
    return Array.from(panel.querySelectorAll('button')).map((b) => b.textContent?.trim().replace(/^✓ /, '').trim())
  }
  function submenuButton(label: string, sub: string) {
    const panel = container!.querySelector(`[aria-label="${label} options"]`)!
    const button = Array.from(panel.querySelectorAll('button')).find((b) => b.textContent?.trim().replace(/^✓ /, '').trim() === sub)
    expect(button).toBeTruthy()
    return button!
  }
  function innerButton(id: string) {
    return container!.querySelector(`[data-project-id="${id}"] button`)!
  }
  function liveValue(id: string) {
    return useShowStore.getState().activeLiveValues[id] ?? 0
  }

  it('shows the full Video 1 menu in Edit mode, with Delete', () => {
    rightClickButton('btn1')
    expect(parentLabels()).toEqual([
      'Get Info', 'Show Properties', 'Edit Ad Hoc Properties', 'Add Overrides',
      'Cut', 'Copy', 'Paste', 'Rename', 'Duplicate', 'Delete',
      'Control Type', 'Behavior', 'Priority', 'Color', 'Modifiers', 'Font',
      'Alignment', 'Remove From Frame', 'External Control',
    ])
  })

  it('groups the items like LightKey in Edit mode (Jake, 27 Nov 2026, 8.45.41pm + 5.20.33pm)', () => {
    // LightKey's Live menu groups [Get Info] | [Show Properties, Edit
    // Ad Hoc, Add Overrides] | [Rename] | [settings] | [External
    // Control]; Edit mode splits the clipboard operations from the
    // object operations the way LightKey's cuelist menu does in Jake's
    // 5.20.33pm screenshot — [Cut, Copy, Paste] | [Rename, Duplicate,
    // Delete] — with Font / Alignment / Remove From Frame staying in
    // the settings group. The Edit-mode button grouping is inferred
    // from that widget menu (no direct photograph of LightKey's
    // Edit-mode button menu exists); see CueButtonMenu.tsx.
    rightClickButton('btn1')
    const structure = Array.from(buttonMenu()!.querySelectorAll(':scope > div')).map((div) =>
      div.getAttribute('role') === 'separator' ? '---' : div.querySelector('button')?.textContent?.trim().replace(/›$/, '').trim())
    expect(structure).toEqual([
      'Get Info', '---',
      'Show Properties', 'Edit Ad Hoc Properties', 'Add Overrides', '---',
      'Cut', 'Copy', 'Paste', '---',
      'Rename', 'Duplicate', 'Delete', '---',
      'Control Type', 'Behavior', 'Priority', 'Color', 'Modifiers', 'Font', 'Alignment', 'Remove From Frame', '---',
      'External Control',
    ])
  })

  it('shows the Show Properties speech-bubble icon in Edit mode', () => {
    rightClickButton('btn1')
    const row = menuButton('Show Properties')
    expect(row.querySelector('svg')).toBeTruthy()
    // No other row carries an icon.
    const iconRows = Array.from(buttonMenu()!.querySelectorAll(':scope > div > button')).filter((b) => b.querySelector('svg'))
    expect(iconRows.map((b) => b.textContent?.trim())).toEqual(['Show Properties'])
  })

  it('Control Type offers Push Button and the two faders, never Toggle Button', () => {
    rightClickButton('btn1')
    realClick(menuButton('Control Type'))
    expect(submenuLabels('Control Type')).toEqual(['Push Button', 'Fader Horizontal', 'Fader Vertical'])
    realClick(submenuButton('Control Type', 'Fader Vertical'))
    const control = useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn1')!
    expect(control.type).toBe('faderVertical')
    // A fader has no behaviour.
    rightClickButton('btn1')
    expect(menuButton('Behavior').hasAttribute('disabled')).toBe(true)
    expect(menuButton('Behavior').getAttribute('title')).toBe('Faders have no behavior')
  })

  it('Behavior sets the behaviour, not the type', () => {
    rightClickButton('btn1')
    realClick(menuButton('Behavior'))
    expect(submenuLabels('Behavior')).toEqual(['Toggle', 'Flash'])
    realClick(submenuButton('Behavior', 'Flash'))
    const control = useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn1')!
    expect(control.type).toBe('push')
    expect(control.behavior).toBe('flash')
  })

  it('Priority offers 1–9 with 5 — Normal checked by default', () => {
    rightClickButton('btn1')
    realClick(menuButton('Priority'))
    expect(submenuLabels('Priority')).toEqual(['9 — Highest', '8', '7', '6', '5 — Normal', '4', '3', '2', '1 — Lowest'])
    const checked = container!.querySelector('[aria-label="Priority options"] button[aria-checked="true"]')
    expect(checked?.textContent).toContain('5 — Normal')
    realClick(submenuButton('Priority', '9 — Highest'))
    expect(useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn1')!.priority).toBe(9)
  })

  it('Color offers Automatic plus LightKey’s twelve swatches as colour bars', () => {
    rightClickButton('btn1')
    realClick(menuButton('Color'))
    const panel = container!.querySelector('[aria-label="Color options"]')!
    const swatches = Array.from(panel.querySelectorAll('button[aria-label$="button colour"]'))
    expect(swatches).toHaveLength(12)
    expect(swatches.map((b) => b.getAttribute('aria-label'))).toEqual([
      'White button colour', 'Salmon button colour', 'Peach button colour', 'Yellow button colour',
      'Light green button colour', 'Green button colour', 'Cyan button colour', 'Light blue button colour',
      'Periwinkle button colour', 'Lavender button colour', 'Pink button colour', 'Pale pink button colour',
    ])
    // The swatch is a colour bar, not a text row.
    const salmon = swatches[1].querySelector('span') as HTMLElement
    expect(salmon.style.backgroundColor).toBe('rgb(241, 154, 152)')
    realClick(swatches[1])
    expect(useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn1')!.appearance?.color).toBe('#f19a98')
    // Automatic clears the picked colour again.
    rightClickButton('btn1')
    realClick(menuButton('Color'))
    realClick(submenuButton('Color', 'Automatic'))
    expect(useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn1')!.appearance?.color).toBe('#47235a')
  })

  it('Modifiers lists LightKey’s sixteen, greyed where the cue does not apply', () => {
    // btn1's cue is the Red preset (red + intensity on d1): only
    // Fade Time, Dimmer and Hue apply.
    rightClickButton('btn1')
    realClick(menuButton('Modifiers'))
    expect(submenuLabels('Modifiers')).toEqual([
      'Speed', 'Beat Multiplier', 'Time Offset', 'Fade Time', 'Dimmer', 'Hue',
      'Color Temperature', 'Green Saturation', 'Xfade to Color', 'Pan', 'Tilt',
      'Focus', 'Zoom Angle', 'Iris Size', 'Frost Amount', 'Fog Amount',
    ])
    const panel = container!.querySelector('[aria-label="Modifiers options"]')!
    const enabled = (label: string) => {
      const b = Array.from(panel.querySelectorAll('button')).find((x) => x.textContent?.trim() === label)!
      return !b.hasAttribute('disabled')
    }
    for (const label of ['Fade Time', 'Dimmer', 'Hue']) expect(enabled(label)).toBe(true)
    for (const label of ['Speed', 'Beat Multiplier', 'Time Offset', 'Color Temperature', 'Green Saturation', 'Xfade to Color', 'Pan', 'Tilt', 'Focus', 'Zoom Angle', 'Iris Size', 'Frost Amount', 'Fog Amount']) expect(enabled(label)).toBe(false)
    // Selecting a modifier stores the selection and ticks it; a second
    // click clears it again.
    realClick(submenuButton('Modifiers', 'Fade Time'))
    expect(useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn1')!.selectedModifiers).toEqual(['fadeTime'])
    rightClickButton('btn1')
    realClick(menuButton('Modifiers'))
    const ticked = container!.querySelector('[aria-label="Modifiers options"] button[aria-checked="true"]')
    expect(ticked?.textContent).toContain('Fade Time')
    realClick(submenuButton('Modifiers', 'Fade Time'))
    expect(useShowStore.getState().show!.livePages![0].controls.find((c) => c.id === 'btn1')!.selectedModifiers).toEqual([])
  })

  it('External Control greys Replace/Remove with no trigger, and Add Trigger opens MIDI learn', () => {
    rightClickButton('btn1')
    realClick(menuButton('External Control'))
    expect(submenuLabels('External Control')).toEqual(['Add Trigger…', 'Replace Trigger…', 'Remove Trigger', 'Copy OSC Address', 'Add Shortcut…'])
    const panel = container!.querySelector('[aria-label="External Control options"]')!
    const row = (label: string) => Array.from(panel.querySelectorAll('button')).find((x) => x.textContent?.trim() === label)!
    expect(row('Add Trigger…').hasAttribute('disabled')).toBe(false)
    expect(row('Replace Trigger…').hasAttribute('disabled')).toBe(true)
    expect(row('Replace Trigger…').getAttribute('title')).toBe('No trigger to replace')
    expect(row('Remove Trigger').hasAttribute('disabled')).toBe(true)
    expect(row('Remove Trigger').getAttribute('title')).toBe('No trigger to remove')
    expect(row('Copy OSC Address').getAttribute('title')).toBe('OSC is not available in this app')
    expect(row('Add Shortcut…').getAttribute('title')).toBe('Keyboard shortcuts for buttons are not built yet')
    // Add Trigger… opens Settings on the External tab with MIDI learn
    // armed for this button.
    realClick(row('Add Trigger…'))
    const dialog = container!.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog!.textContent).toContain('MIDI Mapping')
    expect(dialog!.textContent).toContain('Listening for MIDI input for “Song 1”')
  })

  it('External Control Replace/Remove act once a trigger exists', () => {
    act(() => {
      useShowStore.getState().addMidiMapping({ id: 'm1', targetType: 'live-cue', targetId: 'btn1', midiType: 'noteon', channel: 1, number: 60 })
    })
    rightClickButton('btn1')
    realClick(menuButton('External Control'))
    const panel = container!.querySelector('[aria-label="External Control options"]')!
    const row = (label: string) => Array.from(panel.querySelectorAll('button')).find((x) => x.textContent?.trim() === label)!
    expect(row('Add Trigger…').hasAttribute('disabled')).toBe(true)
    expect(row('Replace Trigger…').hasAttribute('disabled')).toBe(false)
    expect(row('Remove Trigger').hasAttribute('disabled')).toBe(false)
    realClick(row('Remove Trigger'))
    expect(useShowStore.getState().midiMappings).toEqual([])
  })

  it('a Push Button with Toggle behaviour latches on first click, off on second', () => {
    const button = innerButton('btn1')
    expect(liveValue('btn1')).toBe(0)
    act(() => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
    expect(liveValue('btn1')).toBe(255)
    act(() => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
    expect(liveValue('btn1')).toBe(0)
  })

  it('a Push Button with Flash behaviour is active only while held', () => {
    const button = innerButton('btn2')
    expect(liveValue('btn2')).toBe(0)
    act(() => { button.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })) })
    expect(liveValue('btn2')).toBe(255)
    act(() => { button.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, cancelable: true })) })
    expect(liveValue('btn2')).toBe(0)
  })
})

describe('cue button menu in Edit Mode (Video 1)', () => {
  it('right-clicking a button shows the button menu, not the canvas menu', () => {
    rightClickButton('btn1')
    expect(buttonMenu()).toBeTruthy()
    expect(container!.querySelector('[aria-label="Live edit actions"]')).toBeNull()
    expect(menuButton('Get Info')).toBeTruthy()
    expect(menuButton('Remove From Frame')).toBeTruthy()
    // No Go / Stop / Live view in the button menu.
    expect(Array.from(buttonMenu()!.querySelectorAll('button')).some((b) => b.textContent?.includes('Go'))).toBe(false)
  })

  it('right-clicking empty canvas still shows the canvas menu', () => {
    const canvas = container!.querySelector('[aria-label="Live page canvas"]')!
    act(() => { canvas.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 500, clientY: 400 })) })
    expect(container!.querySelector('[aria-label="Live edit actions"]')).toBeTruthy()
    expect(buttonMenu()).toBeNull()
  })

  it('Get Info opens the contents inspector for the cue button', () => {
    rightClickButton('btn1')
    realClick(menuButton('Get Info'))
    expect(buttonMenu()).toBeNull()
    const dialog = container!.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
    expect(dialog!.querySelector('[aria-label="Cue contents"]')).toBeTruthy()
    expect(dialog!.textContent).toContain('Red')
  })

  it('Rename opens the name input on the button', () => {
    rightClickButton('btn2')
    realClick(menuButton('Rename'))
    const input = container!.querySelector('input[aria-label="Cue name"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('Standalone')
  })

  it('Remove From Frame is enabled in a frame and moves the button out', () => {
    const page = useShowStore.getState().show!.livePages![0]
    expect(frameMembers(page, 'frame1')).toContain('btn1')
    rightClickButton('btn1')
    const remove = menuButton('Remove From Frame')
    expect(remove.hasAttribute('disabled')).toBe(false)
    realClick(remove)
    const next = useShowStore.getState().show!.livePages![0]
    expect(next.controls.find((c) => c.id === 'btn1')!.y).toBe(230)
    expect(frameMembers(next, 'frame1')).not.toContain('btn1')
  })

  it('Remove From Frame is disabled for a button outside any frame', () => {
    // btn2 sits at y 100 inside frame1 too — move it out first via the
    // store, then check the menu.
    act(() => { useShowStore.getState().removeFromFrame('btn2') })
    rightClickButton('btn2')
    const remove = menuButton('Remove From Frame')
    expect(remove.hasAttribute('disabled')).toBe(true)
    expect(remove.getAttribute('title')).toBe('Not in a frame')
  })
})

describe('cue button menu grouping, Live mode (Jake, 27 Nov 2026, 8.45.41pm)', () => {
  // The file-level beforeEach enters Edit mode; these tests exit it
  // first, so the menu is LightKey's short 11-item Live menu. In Live
  // mode the menu is rendered by the global ContextMenu ("cue
  // actions"), not LiveWorkspace's edit-mode menu ("Cue button
  // actions") — both render the same CueButtonMenu component.
  function liveButtonMenu() {
    return container!.querySelector('[aria-label="cue actions"]') as HTMLElement | null
  }
  function liveMenuButton(label: string) {
    const menu = liveButtonMenu()
    expect(menu).toBeTruthy()
    const button = Array.from(menu!.querySelectorAll('button')).find((b) => b.textContent?.trim().replace(/^✓ /, '').replace(/›$/, '').trim() === label)
    expect(button).toBeTruthy()
    return button!
  }
  function menuStructure() {
    const menu = liveButtonMenu()!
    return Array.from(menu.querySelectorAll(':scope > div')).map((div) =>
      div.getAttribute('role') === 'separator' ? '---' : div.querySelector('button')?.textContent?.trim().replace(/›$/, '').trim())
  }

  it('groups the items like LightKey in Live mode', () => {
    exitEditMode()
    rightClickButton('btn1')
    expect(menuStructure()).toEqual([
      'Get Info', '---',
      'Show Properties', 'Edit Ad Hoc Properties', 'Add Overrides', '---',
      'Rename', '---',
      'Control Type', 'Behavior', 'Priority', 'Color', 'Modifiers', '---',
      'External Control',
    ])
  })

  it('shows the Show Properties speech-bubble icon in Live mode too', () => {
    exitEditMode()
    rightClickButton('btn1')
    const row = liveMenuButton('Show Properties')
    expect(row.querySelector('svg')).toBeTruthy()
    const iconRows = Array.from(liveButtonMenu()!.querySelectorAll(':scope > div > button')).filter((b) => b.querySelector('svg'))
    expect(iconRows.map((b) => b.textContent?.trim())).toEqual(['Show Properties'])
  })
})
