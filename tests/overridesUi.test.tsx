// @vitest-environment jsdom
// LightKey's real Overrides in the header and Preview (Jake's LightKey
// screenshots 20 Nov 2026): the header field always reads "Overrides"
// and is a toggle, not a dropdown; a paintbrush appears beside it only
// while overrides exist, with the tooltip "Clear overridden fixture
// properties"; overridden fixtures carry a blue dot by their name; the
// toggle reveals white labels naming the overridden properties, and a
// hovered row's ✕ clears just that property.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { OverridesField } from '../src/renderer/src/components/OverridesField'
import { StagePreview } from '../src/renderer/src/components/StagePreview'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { CONTEXT_MENUS, MENU_LABELS, WINDOWS_MENU } from '../src/shared/menuModel'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECT = { left: 0, top: 0, width: 800, height: 340, right: 800, bottom: 340, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

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
  Element.prototype.getBoundingClientRect = () => RECT as unknown as DOMRect
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

function setOverrides(values: Record<string, Record<string, number>>) {
  act(() => { useShowStore.setState({ manualOverrides: values, showOverrideLabels: false }) })
}

describe('header Overrides field', () => {
  it('always reads Overrides and shows no brush without overrides', () => {
    setOverrides({})
    renderInRoot(<OverridesField />)
    const toggle = container?.querySelector('[aria-label="Overrides"]') as HTMLElement | null
    expect(toggle).not.toBeNull()
    expect(toggle?.textContent).toBe('Overrides')
    expect(toggle?.getAttribute('aria-pressed')).toBe('false')
    expect(container?.querySelector('[aria-label="Clear overridden fixture properties"]')).toBeNull()
  })

  it('shows the brush only while overrides exist, with the exact tooltip, and clicking it clears them', () => {
    setOverrides({ fx1: { intensity: 200 } })
    renderInRoot(<OverridesField />)
    const brush = container?.querySelector('[aria-label="Clear overridden fixture properties"]') as HTMLElement | null
    expect(brush).not.toBeNull()
    expect(brush?.getAttribute('title')).toBe('Clear overridden fixture properties')
    act(() => { brush?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().manualOverrides).toEqual({})
    expect(container?.querySelector('[aria-label="Clear overridden fixture properties"]')).toBeNull()
  })

  it('the toggle shows and hides the override labels', () => {
    setOverrides({ fx1: { intensity: 200 } })
    renderInRoot(<OverridesField />)
    const toggle = container?.querySelector('[aria-label="Overrides"]') as HTMLElement | null
    act(() => { toggle?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().showOverrideLabels).toBe(true)
    expect(toggle?.getAttribute('aria-pressed')).toBe('true')
    act(() => { toggle?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().showOverrideLabels).toBe(false)
  })
})

describe('Preview override dots and labels', () => {
  function setShow() {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const show = {
      ...base,
      id: 'test-show',
      fixtures: [
        { id: 'fx1', name: 'Test Wash 1', type: 'led-wash', channelStart: 1, channels: 7 },
        { id: 'fx2', name: 'Test Wash 2', type: 'led-wash', channelStart: 8, channels: 7 }
      ],
      cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: {
        fx1: { intensity: 255, red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 },
        fx2: { intensity: 255, red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 }
      }, fadeMs: 0 }]
    }
    act(() => {
      useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [], activeCueId: 'c1', editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false, previewEditing: false })
    })
  }

  async function renderPreview() {
    setShow()
    renderInRoot(<StagePreview />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }

  it('marks only overridden fixtures with a blue dot by the name', async () => {
    await renderPreview()
    act(() => { useShowStore.setState({ manualOverrides: { fx1: { intensity: 200, red: 255 } } }) })
    const dots = [...(container?.querySelectorAll('circle[fill="#0A84FF"]') ?? [])]
    expect(dots).toHaveLength(1)
    expect(dots[0].getAttribute('aria-label')).toBe('Overridden properties for Test Wash 1')
  })

  it('shows a white label naming the overridden properties, and the row ✕ clears just that property', async () => {
    await renderPreview()
    act(() => { useShowStore.setState({ manualOverrides: { fx1: { intensity: 200, red: 255, green: 0, blue: 0 } }, showOverrideLabels: true }) })
    const label = container?.querySelector('[data-override-label="fx1"]')
    expect(label).not.toBeNull()
    expect(label?.textContent).toContain('Dimmer')
    expect(label?.textContent).toContain('Color')
    expect(container?.querySelector('[data-override-label="fx2"]')).toBeNull()
    // Hover the Dimmer row: it highlights and shows the ✕.
    const rows = [...(label?.querySelectorAll('g') ?? [])]
    const dimmerRow = rows.find((g) => g.textContent === 'Dimmer')
    if (!dimmerRow) throw new Error('no Dimmer row')
    act(() => { dimmerRow.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })) })
    const clear = container?.querySelector('[aria-label="Clear Dimmer override on Test Wash 1"]') as HTMLElement | null
    expect(clear).not.toBeNull()
    act(() => { clear?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    // Only Dimmer is released; the Color override stays.
    expect(useShowStore.getState().manualOverrides.fx1).toEqual({ red: 255, green: 0, blue: 0 })
  })

  it('clicking the dot shows the labels', async () => {
    await renderPreview()
    act(() => { useShowStore.setState({ manualOverrides: { fx1: { intensity: 200 } } }) })
    const dot = container?.querySelector('circle[fill="#0A84FF"]') as HTMLElement | null
    act(() => { dot?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().showOverrideLabels).toBe(true)
    expect(container?.querySelector('[data-override-label="fx1"]')).not.toBeNull()
  })
})

describe('Overrides menu commands', () => {
  it('the cue shortcut menu and the Live menu offer Add Overrides and Edit Ad Hoc Properties', () => {
    expect(CONTEXT_MENUS.cue).toContain('addOverrides')
    expect(CONTEXT_MENUS.cue).toContain('editAdHocProperties')
    expect(MENU_LABELS.addOverrides).toBe('Add Overrides')
    expect(MENU_LABELS.editAdHocProperties).toBe('Edit Ad Hoc Properties')
    const live = WINDOWS_MENU.find((group) => group.label === 'Live')!
    expect(live.items.map((item) => item.command)).toContain('addOverrides')
    expect(live.items.map((item) => item.command)).toContain('editAdHocProperties')
  })
})
