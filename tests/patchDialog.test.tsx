// Patch dialog tabs (LightKey Guide pp.29–30, video 04:00): Kind /
// Patching / Comments, a DIP switch guide on the Patching tab, and
// double-clicking a patched fixture reopening the dialog in edit mode
// with no Cancel/Patch — changes apply as they are made.
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { PatchDialog } from '../src/renderer/src/components/PatchDialog'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import type { FixtureDef, FixtureProfile, ShowDef } from '../src/shared/types'

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

const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!

function setInput(el: HTMLInputElement, value: string) {
  act(() => {
    inputSetter.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

function setTextarea(el: HTMLTextAreaElement, value: string) {
  act(() => {
    textareaSetter.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

function blur(el: HTMLElement) {
  act(() => { el.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })) })
}

function clickTab(label: string) {
  const tab = [...(container?.querySelectorAll('[role="tab"]') ?? [])].find((el) => el.textContent === label) as HTMLElement | undefined
  if (!tab) throw new Error(`no ${label} tab`)
  act(() => { tab.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

function menuItem(label: string) {
  const item = [...(container?.querySelectorAll('[role="menuitem"]') ?? [])].find((el) => el.textContent === label) as HTMLElement | undefined
  if (!item) throw new Error(`no menu item ${label}`)
  return item
}

function setTestShow(fixtures: FixtureDef[]) {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show: ShowDef = { ...base, id: 'test-show', fixtures, cues: [], presets: [] }
  act(() => {
    useShowStore.setState({ show, cues: [], presets: [], selectedFixtureIds: [], activeCueId: null, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
  })
}

const PAR = BUILTIN_PROFILES[0]

function testFixture(): FixtureDef {
  return {
    id: 'f1', name: PAR.name, type: PAR.legacyType, channelStart: 1, channels: 4,
    shortName: 'P1', profileId: PAR.id, modeId: 'default', profile: structuredClone(PAR)
  }
}

const TWO_MODE: FixtureProfile = {
  id: 'test-4bar', name: 'Test 4Bar', manufacturer: 'Test', legacyType: 'par',
  modes: [
    { id: 'mode1', name: 'Mode 1', channels: Array.from({ length: 15 }, (_, i) => ({ number: i, attribute: `ch${i + 1}`, propertyType: 'other' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 0 })) },
    { id: 'mode2', name: 'Mode 2', channels: Array.from({ length: 3 }, (_, i) => ({ number: i, attribute: `ch${i + 1}`, propertyType: 'other' as const, min: 0, max: 255, defaultValue: 0, highlightValue: 0 })) }
  ]
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  root = undefined
  container?.remove()
  container = undefined
})

describe('Patch dialog tabs', () => {
  it('shows Kind, Patching and Comments tabs; the Kind tab has the model and channel count', () => {
    setTestShow([])
    renderInRoot(<PatchDialog profile={PAR} initialModeId="default" start={1} onPatched={() => {}} onClose={() => {}} />)
    expect(container?.querySelectorAll('[role="tab"]').length).toBe(3)
    expect(container?.textContent).toContain(PAR.name)
    expect(container?.textContent).toContain('4 channels')
    // A single-mode fixture shows no Mode row on the Kind tab.
    expect(container?.querySelector('[aria-label="Fixture mode"]')).toBeNull()
    // The Patching tab holds the short name, address and DIP guide.
    clickTab('Patching')
    expect(container?.querySelector('[aria-label="Short name"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Start at"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Ext. reference"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="DIP switches for address 1"]')).not.toBeNull()
    // The Comments tab holds the notes area and the "…" menu.
    clickTab('Comments')
    expect(container?.querySelector('[aria-label="Fixture notes"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Fixture actions"]')).not.toBeNull()
  })

  it('shows the Mode dropdown on the Kind tab for a multi-mode fixture', () => {
    setTestShow([])
    renderInRoot(<PatchDialog profile={TWO_MODE} initialModeId="mode1" start={1} onPatched={() => {}} onClose={() => {}} />)
    const select = container?.querySelector('[aria-label="Fixture mode"]') as HTMLSelectElement | null
    expect(select).not.toBeNull()
    expect(select?.options.length).toBe(2)
    expect(container?.textContent).toContain('15 channels')
  })

  it('follows the address in the DIP switch guide', () => {
    setTestShow([])
    renderInRoot(<PatchDialog profile={PAR} initialModeId="default" start={1} onPatched={() => {}} onClose={() => {}} />)
    clickTab('Patching')
    const address = container?.querySelector('[aria-label="Start at"]') as HTMLInputElement
    setInput(address, '5')
    const states = [...(container?.querySelectorAll('[data-switch]') ?? [])].map((el) => el.getAttribute('data-on'))
    // Address 5 = switches 1 (1) + 3 (4).
    expect(states).toEqual(['true', 'false', 'true', 'false', 'false', 'false', 'false', 'false', 'false'])
    expect(container?.querySelector('[aria-label="DIP switches for address 5"]')).not.toBeNull()
  })

  it('patches through the tabs, storing notes and Ext. reference on the fixture', () => {
    setTestShow([])
    const onPatched = vi.fn()
    renderInRoot(<PatchDialog profile={PAR} initialModeId="default" start={1} onPatched={onPatched} onClose={() => {}} />)
    clickTab('Patching')
    setInput(container?.querySelector('[aria-label="Short name"]') as HTMLInputElement, 'P1')
    setInput(container?.querySelector('[aria-label="Ext. reference"]') as HTMLInputElement, 'RIG-A')
    clickTab('Comments')
    setTextarea(container?.querySelector('[aria-label="Fixture notes"]') as HTMLTextAreaElement, 'Front wash, stage left')
    act(() => { (container?.querySelector('[type="submit"]') as HTMLElement).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(onPatched).toHaveBeenCalled()
    const fixtures = useShowStore.getState().show?.fixtures ?? []
    expect(fixtures.length).toBe(1)
    expect(fixtures[0].notes).toBe('Front wash, stage left')
    expect(fixtures[0].extReference).toBe('RIG-A')
  })
})

describe('Patch dialog edit mode', () => {
  // Mount the dialog with the live fixture object from the store — the
  // way PatchPanel renders it — so the footer and validation follow
  // each edit instead of going stale on the first one.
  function mountEdit(onNotice?: (message: string) => void) {
    if (root) act(() => { root.unmount() })
    root = undefined
    container?.remove()
    container = undefined
    renderInRoot(<PatchDialog profile={PAR} initialModeId="default" start={1} fixture={useShowStore.getState().show!.fixtures[0]} onPatched={() => {}} onClose={() => {}} onNotice={onNotice ?? (() => {})} />)
  }

  beforeEach(() => { setTestShow([testFixture()]) })

  it('has no Patch button; renaming and moving apply live', () => {
    mountEdit()
    expect(container?.querySelector('[type="submit"]')).toBeNull()
    expect(container?.textContent).toContain('Edit fixture')
    clickTab('Patching')
    const shortName = container?.querySelector('[aria-label="Short name"]') as HTMLInputElement
    setInput(shortName, 'W2')
    blur(shortName)
    expect(useShowStore.getState().show?.fixtures[0].shortName).toBe('W2')
    const address = container?.querySelector('[aria-label="Start at"]') as HTMLInputElement
    setInput(address, '10')
    expect(useShowStore.getState().show?.fixtures[0].channelStart).toBe(10)
  })

  it('disables from the "…" menu and the footer reads No output', () => {
    mountEdit()
    clickTab('Comments')
    expect(container?.textContent).toContain('Output: Universe 1 · channels 1–4')
    act(() => { (container?.querySelector('[aria-label="Fixture actions"]') as HTMLElement).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    act(() => { menuItem('Disable').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().show?.fixtures[0].disabled).toBe(true)
    mountEdit()
    clickTab('Comments')
    expect(container?.textContent).toContain('No output')
  })

  it('asks twice before deleting, then removes the fixture', () => {
    const onNotice = vi.fn()
    mountEdit(onNotice)
    clickTab('Comments')
    act(() => { (container?.querySelector('[aria-label="Fixture actions"]') as HTMLElement).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    act(() => { menuItem('Delete…').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    // First click only arms the confirmation; the fixture is still there.
    expect(container?.textContent).toContain('Confirm delete?')
    expect(useShowStore.getState().show?.fixtures.length).toBe(1)
    act(() => { menuItem('Confirm delete?').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().show?.fixtures.length).toBe(0)
    expect(onNotice).toHaveBeenCalled()
  })
})
