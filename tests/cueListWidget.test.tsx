// Cuelist canvas widget (Jake, 27 Nov 2026 — LightKey cuelist
// walkthrough): the empty placeholder, the step rows, the transport,
// the widget menu (New Cue / Renumber / New Group), the step inspector
// (Empty Cue + drag-in contents), the cuelist options, and the
// widget-scoped lifecycle (deleting the widget deletes its cues).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { activeCueId, collectInlineCues, useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
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

beforeEach(() => {
  container = undefined
  root = undefined
})

afterEach(() => {
  if (root) act(() => { root!.unmount() })
  if (container) container.remove()
})

const FIXTURES = [
  { id: 'w1', name: 'W1', type: 'rgba-4ch', channelStart: 1, channels: 4, group: 'Inner Arc' },
  { id: 'w2', name: 'W2', type: 'rgba-4ch', channelStart: 5, channels: 4, group: 'Inner Arc' },
]
const VIOLET = { id: 'preset-violet', name: 'Violet', category: 'color', fixtureValues: { w1: { red: 128, green: 0, blue: 255, intensity: 255 }, w2: { red: 128, green: 0, blue: 255, intensity: 255 } } }
const CUE_VIOLET = { id: 'cue-violet', name: '001 Violet', presetIds: ['preset-violet'], fadeMs: 500 }
const CUE_BLUE = { id: 'cue-blue', name: '002 Blue', fixtureValues: { w1: { blue: 255, intensity: 200 } }, fadeMs: 500 }

function seedShow(cueLists: unknown[] = [{ id: 'list1', name: 'Sunday Set', steps: [{ id: 's1', cue: CUE_VIOLET, fadeMs: 500, holdMs: 0 }, { id: 's2', cue: CUE_BLUE, fadeMs: 500, holdMs: 0 }] }]) {
  const state = useShowStore.getState()
  state.setShow(migrateShow({
    fixtures: FIXTURES,
    presets: [VIOLET],
    cueLists,
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [], cueListWidgets: cueLists.length ? [{ id: 'w1', cueListId: 'list1', x: 20, y: 20, width: 480, height: 300 }] : [] }],
  } as unknown as ShowDef))
  act(() => { useShowStore.setState({ activeLivePageId: 'page1' }) })
}

function switchToLive() {
  const segment = Array.from(container!.querySelectorAll('.view-switch-segment')).find((el) => el.textContent?.includes('Live'))
  expect(segment).toBeTruthy()
  act(() => { segment!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  expect(container!.querySelector('[aria-label="Live page canvas"]')).toBeTruthy()
}

function widgetEl() {
  const widget = container!.querySelector('[data-cuelist-widget]')
  expect(widget, 'cuelist widget on the canvas').toBeTruthy()
  return widget as HTMLElement
}

function stepRow(name: string) {
  const row = [...widgetEl().querySelectorAll('div')].find((el) => el.getAttribute('aria-label') === name)
  expect(row, `step row "${name}"`).toBeTruthy()
  return row as HTMLElement
}

function widgetButton(label: string) {
  const matches = [...widgetEl().querySelectorAll('button')].filter((b) => b.textContent?.includes(label) || b.getAttribute('aria-label')?.includes(label))
  expect(matches, `widget button containing "${label}"`).toHaveLength(1)
  return matches[0] as HTMLButtonElement
}

function clickWidgetButton(label: string) {
  act(() => { widgetButton(label).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function openWidgetMenu(stepName?: string) {
  const target = stepName ? stepRow(stepName) : widgetEl()
  act(() => { target.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })) })
  const menu = container!.querySelector('[aria-label="Cuelist actions"]')
  expect(menu, 'cuelist widget menu').toBeTruthy()
  return menu as HTMLElement
}

function clickMenuItem(menu: HTMLElement, label: string) {
  const item = [...menu.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
  expect(item, `menu item "${label}"`).toBeTruthy()
  act(() => { item!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function inspectorEl() {
  const panel = container!.querySelector('[role="dialog"]')
  expect(panel, 'inspector panel').toBeTruthy()
  return panel as HTMLElement
}

describe('cuelist widget (LightKey walkthrough)', () => {
  it('empty widget: placeholder, columns, transport and Xfade all show', () => {
    seedShow([{ id: 'list1', name: 'Sunday Set', steps: [] }])
    renderInRoot(<App />)
    switchToLive()
    const widget = widgetEl()
    expect(widget.textContent).toContain('Cuelist')
    expect(widget.textContent).toContain('Use cuelists to recall lighting cues in a predefined order')
    expect(widget.textContent).toContain('About Cuelists')
    for (const header of ['Name', 'Hold Time', 'Fade Time', 'Xfade']) expect(widget.textContent).toContain(header)
    expect(widgetButton('Go').textContent).toBe('▶')
    expect(widgetButton('Pause cuelist').textContent).toBe('❚❚')
    expect(widgetButton('Pause cuelist').disabled).toBe(true)
    expect(widgetButton('Next cue').textContent).toBe('«')
    expect(widget.querySelector('input[aria-label="Xfade Sunday Set"]')).toBeTruthy()
    clickWidgetButton('About Cuelists')
    expect(widget.textContent).toContain('Right-click the cuelist and choose New Cue')
  })

  it('widget menu: New Cue creates auto-numbered cues and opens the step inspector', () => {
    seedShow([{ id: 'list1', name: 'Sunday Set', steps: [] }])
    renderInRoot(<App />)
    switchToLive()
    clickMenuItem(openWidgetMenu(), 'New Cue')
    expect(widgetEl().textContent).toContain('001 New Cue')
    expect(useShowStore.getState().cueLists[0].steps[0].cue.fadeMs).toBe(500)
    expect(useShowStore.getState().cueLists[0].steps[0].fadeMs).toBe(500)
    // The new cue's inspector appears beside the cuelist (guide p.191).
    const panel = inspectorEl()
    expect(panel.textContent).toContain('001 New Cue')
    expect(panel.textContent).toContain('Empty Cue')
    expect(panel.textContent).toContain('Drag presets and sequences here')
    expect(panel.textContent).toContain('Hold Time')
    // Timing values live in inputs, so they are not in textContent.
    expect((panel.querySelector('[aria-label="Hold Time"]') as HTMLInputElement).value).toBe('')
    expect((panel.querySelector('[aria-label="Fade Time"]') as HTMLInputElement).value).toBe('00:00.5')
    act(() => { panel.querySelector('[aria-label="Close properties popup"]')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    clickMenuItem(openWidgetMenu(), 'New Cue')
    expect(widgetEl().textContent).toContain('002 New Cue')
  })

  it('widget menu: New Cue inserts below the clicked step', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    clickMenuItem(openWidgetMenu('001 Violet'), 'New Cue')
    const names = [...widgetEl().querySelectorAll('div')].filter((el) => el.getAttribute('aria-label')?.includes('New Cue') || el.getAttribute('aria-label')?.includes('Violet') || el.getAttribute('aria-label')?.includes('Blue')).map((el) => el.getAttribute('aria-label'))
    expect(names[0]).toBe('001 Violet')
    expect(names[1]).toBe('003 New Cue')
    expect(names[2]).toBe('002 Blue')
  })

  it('step inspector: a cue with a preset shows the group, dimmer and colour rows', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    clickMenuItem(openWidgetMenu('001 Violet'), 'Get Info')
    const panel = inspectorEl()
    expect(panel.textContent).toContain('001 Violet')
    expect(panel.textContent).toContain('Inner Arc')
    expect(panel.textContent).toContain('100%')
    expect(panel.textContent).toContain('Violet')
    expect(panel.textContent).toContain('Hold Time')
    expect(panel.textContent).toContain('Fade Time')
    expect(panel.textContent).toContain('Modifiers')
    expect(panel.textContent).toContain('Live Triggers')
    // Per-row × removes the preset from the cue.
    const remove = panel.querySelector('[aria-label="Remove Violet from cue"]') as HTMLButtonElement
    expect(remove).toBeTruthy()
    act(() => { remove.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(inspectorEl().textContent).toContain('Empty Cue')
    expect(useShowStore.getState().cueLists[0].steps.find((s) => s.cue.id === 'cue-violet')?.cue.presetIds).toEqual([])
  })

  it('step rows: Hold shows — when unset, Fade shows 00:00.5, and the cells edit in place', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    expect(stepRow('001 Violet').textContent).toContain('—')
    expect(stepRow('001 Violet').textContent).toContain('00:00.5')
    const fadeCell = widgetEl().querySelector('[aria-label="Fade time for 001 Violet"]') as HTMLButtonElement
    act(() => { fadeCell.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    const input = widgetEl().querySelector('[aria-label="Fade time for 001 Violet"]') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    // React's value tracker swallows a direct assignment — set through
    // the native setter, then blur to commit.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, '00:01.0')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    // React's onBlur listens for focusout (a plain blur event never
    // reaches it in jsdom) — the established pattern is focusout.
    act(() => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })) })
    expect(useShowStore.getState().cueLists[0].steps[0].fadeMs).toBe(1000)
  })

  it('step rows: + adds below, − removes the step and sweeps its cue', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    clickWidgetButton('Add cue below 002 Blue')
    expect(widgetEl().textContent).toContain('003 New Cue')
    act(() => { (widgetEl().querySelector('[aria-label="Remove 002 Blue"]') as HTMLButtonElement).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(widgetEl().textContent).not.toContain('002 Blue')
    expect(useShowStore.getState().cueLists[0].steps.find((s) => s.cue.id === 'cue-blue')).toBeUndefined()
  })

  it('transport icons follow state, and Pause holds the cue', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    expect(widgetButton('Go').textContent).toBe('▶')
    // At rest the third button is « — even with a next cue available
    // (Jake's screenshot 5.22.11: 001 current, 002 next, still «).
    expect(widgetButton('Next cue').textContent).toBe('«')
    clickWidgetButton('Go')
    expect(widgetButton('Stop cuelist').textContent).toBe('■')
    expect(widgetButton('Pause cuelist').disabled).toBe(false)
    expect(widgetButton('Next cue').textContent).toBe('«')
    clickWidgetButton('Pause cuelist')
    expect(useShowStore.getState().cuePaused).toBe(true)
    // While paused the button reads "Resume cuelist".
    clickWidgetButton('Resume cuelist')
    expect(useShowStore.getState().cuePaused).toBe(false)
    // Mid-crossfade the button flips to » (Jake's screenshot 5.22.44:
    // Xfade 58%): drag the Xfade slider halfway.
    const xfade = widgetEl().querySelector('[aria-label="Xfade Sunday Set"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(xfade, '0.5')
      xfade.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    expect(widgetButton('Next cue').textContent).toBe('»')
    // Clicking it while it shows » advances to the next cue.
    clickWidgetButton('Next cue')
    expect(activeCueId(useShowStore.getState())).toBe('cue-blue')
  })

  it('an unchecked cue is skipped by Go', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    const checkbox = widgetEl().querySelector('[aria-label="Include 002 Blue in playback"]') as HTMLInputElement
    act(() => { checkbox.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().cueLists[0].steps[1].disabled).toBe(true)
    clickWidgetButton('Go')
    expect(activeCueId(useShowStore.getState())).toBe('cue-violet')
    // Next skips the unchecked cue: no next enabled cue, so playback
    // stops on Violet instead of landing on Blue.
    clickWidgetButton('Next cue')
    expect(useShowStore.getState().cuePlaying).toBe(false)
    expect(activeCueId(useShowStore.getState())).toBe('cue-violet')
  })

  it('widget menu: Renumber re-numbers from the first cue’s number', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    act(() => { useShowStore.getState().updateCue('cue-violet', { name: '010 Violet' }) })
    clickMenuItem(openWidgetMenu(), 'Renumber')
    expect(widgetEl().textContent).toContain('010 Violet')
    expect(widgetEl().textContent).toContain('011 Blue')
  })

  it('widget menu: Duplicate is greyed with nothing selected, enabled with a step selected', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    const menu = openWidgetMenu()
    const duplicate = [...menu.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Duplicate') as HTMLButtonElement
    expect(duplicate.disabled).toBe(true)
    expect(duplicate.title).toContain('No cue selected')
    // Select a step, reopen the menu: Duplicate is enabled, and it
    // copies the step in place with the next number (Guide ch.11,
    // p.189) — Jake's screenshot 7.10.50.
    act(() => { stepRow('001 Violet').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    const menu2 = openWidgetMenu('001 Violet')
    const duplicate2 = [...menu2.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Duplicate') as HTMLButtonElement
    expect(duplicate2.disabled).toBe(false)
    clickMenuItem(menu2, 'Duplicate')
    const state = useShowStore.getState()
    expect(state.cueLists[0].steps.map((s) => s.cue.name)).toEqual(['001 Violet', '003 New Cue', '002 Blue'])
    const copy = collectInlineCues(state.show, state.cueLists).find((c) => c.name === '003 New Cue')!
    expect(copy.id).not.toBe('cue-violet')
    expect(copy.presetIds).toEqual(['preset-violet'])
  })

  it('widget menu: New Group groups the selected steps', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    openWidgetMenu()
    act(() => { stepRow('001 Violet').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    act(() => { stepRow('002 Blue').dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true })) })
    clickMenuItem(openWidgetMenu(), 'New Group From Selection')
    // The new group opens with its name input — Return commits it.
    const nameInput = widgetEl().querySelector('[aria-label="Group name"]') as HTMLInputElement
    expect(nameInput).toBeTruthy()
    act(() => { nameInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(widgetEl().textContent).toContain('New Group')
    expect(useShowStore.getState().cueLists[0].groups).toHaveLength(1)
    expect(useShowStore.getState().cueLists[0].steps.every((s) => s.groupId === useShowStore.getState().cueLists[0].groups![0].id)).toBe(true)
    // Collapsing the group hides its steps.
    const collapse = widgetEl().querySelector('[aria-label="Collapse New Group"]') as HTMLButtonElement
    act(() => { collapse.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(widgetEl().textContent).not.toContain('001 Violet')
  })

  it('widget menu: deleting the widget deletes its list and its cues', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    clickMenuItem(openWidgetMenu(), 'Delete')
    expect(useShowStore.getState().cueLists).toHaveLength(0)
    expect(collectInlineCues(useShowStore.getState().show, useShowStore.getState().cueLists)).toHaveLength(0)
    expect(container!.querySelector('[data-cuelist-widget]')).toBeNull()
  })

  it('list inspector: the Edit button opens the cuelist options', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    clickWidgetButton('Edit Sunday Set')
    const panel = inspectorEl()
    expect(panel.textContent).toContain('Sunday Set')
    expect(panel.textContent).toContain('Priority')
    expect(panel.textContent).toContain('Size')
    expect(panel.textContent).toContain('+ – buttons')
    expect(panel.textContent).toContain('Xfade slider')
    expect(panel.textContent).toContain('Loops')
    const loopCheckbox = [...panel.querySelectorAll('label')].find((l) => l.textContent?.includes('Loops'))!.querySelector('input') as HTMLInputElement
    act(() => { loopCheckbox.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().cueLists[0].loop).toBe(true)
  })

  it('toolbar search shows the active cue’s name while a cue plays', () => {
    seedShow()
    renderInRoot(<App />)
    switchToLive()
    const input = container!.querySelector('[aria-label="Search project input"]') as HTMLInputElement
    expect(input.placeholder).toBe('Search Project')
    clickWidgetButton('Go')
    expect(input.placeholder).toBe('001 Violet')
  })
})
