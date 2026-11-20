// @vitest-environment jsdom
// Fixture groups popup (Jake, 20 Nov 2026): the panel must explain
// itself — Rename and Delete always visible with no Manage toggle to
// hunt behind, and the Add form shows which fixtures are selected
// before grouping them. Renders the real FixtureGroups with a synthetic
// show.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { FixtureGroups } from '../src/renderer/src/components/FixtureGroups'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Add electronAPI to the real jsdom window — do not replace window itself,
// or React's commit path (window.HTMLIFrameElement) breaks.
;(window as unknown as { electronAPI: unknown }).electronAPI = { setChannels: vi.fn() }

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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

function setupShow() {
  const state = useShowStore.getState()
  // Pass fixtureGroups explicitly: otherwise migrateShow derives an
  // Ungrouped group from the fixtures, which these tests don't want.
  state.setShow(migrateShow({ fixtures: [
    { id: 'f1', name: 'Front 1', type: 'dimmer', channels: 1, channelStart: 1 },
    { id: 'f2', name: 'Back 1', type: 'dimmer', channels: 1, channelStart: 2 }
  ], fixtureGroups: [] }))
  return useShowStore.getState()
}

function findButton(label: string) {
  return [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === label)
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

describe('FixtureGroups popup', () => {
  it('explains what a group is and shows Rename and Delete with no Manage toggle', () => {
    const state = setupShow()
    act(() => { state.selectFixtures(['f1', 'f2']); state.createFixtureGroup('Front') })
    renderInRoot(<FixtureGroups />)
    expect(container?.textContent).toContain('fixtures of the same type in the same place')
    expect(container?.textContent).toContain("Click a group name to select all its fixtures")
    expect(findButton('Manage')).toBeUndefined()
    expect(findButton('Rename')).toBeDefined()
    expect(findButton('Delete')).toBeDefined()
    // Clicking the group name selects its fixtures.
    const groupButton = container?.querySelector('button[title="Click to select this group\'s fixtures"]') as HTMLButtonElement | null
    act(() => { groupButton?.click() })
    expect(useShowStore.getState().selectedFixtureIds).toEqual(['f1', 'f2'])
  })

  it('Add group shows the selected count and groups the selected fixtures', () => {
    const state = setupShow()
    act(() => { state.selectFixtures(['f1', 'f2']) })
    renderInRoot(<FixtureGroups />)
    expect(container?.textContent).toContain('No groups yet')
    expect(container?.textContent).toContain('2 fixtures selected')
    const nameInput = container?.querySelector('[aria-label="New group name"]') as HTMLInputElement
    setInputValue(nameInput, 'Front')
    const addButton = findButton('Add group')
    expect(addButton?.hasAttribute('disabled')).toBe(false)
    act(() => { addButton?.click() })
    const groups = useShowStore.getState().show?.fixtureGroups ?? []
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Front')
    expect(groups[0].fixtureIds).toEqual(['f1', 'f2'])
    expect(container?.textContent).toContain('Front')
  })

  it('Add group is off until fixtures are selected, and says so', () => {
    setupShow()
    renderInRoot(<FixtureGroups />)
    expect(container?.textContent).toContain('No fixtures selected yet')
    const nameInput = container?.querySelector('[aria-label="New group name"]') as HTMLInputElement
    setInputValue(nameInput, 'Front')
    expect(findButton('Add group')?.hasAttribute('disabled')).toBe(true)
    expect(container?.textContent).toContain('Select fixtures in the Preview first')
  })

  it('Rename opens an inline editor and saves the new name', () => {
    const state = setupShow()
    act(() => { state.selectFixtures(['f1']); state.createFixtureGroup('Front') })
    renderInRoot(<FixtureGroups />)
    act(() => { findButton('Rename')?.click() })
    const renameInput = container?.querySelector('[aria-label="Rename group Front"]') as HTMLInputElement | null
    expect(renameInput?.value).toBe('Front')
    setInputValue(renameInput!, 'Warm Wash Front')
    act(() => { findButton('Save')?.click() })
    const groups = useShowStore.getState().show?.fixtureGroups ?? []
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Warm Wash Front')
  })

  it('Delete removes the group and its fixtures go back to Ungrouped', () => {
    const state = setupShow()
    act(() => { state.selectFixtures(['f1']); state.createFixtureGroup('Front') })
    renderInRoot(<FixtureGroups />)
    act(() => { findButton('Delete')?.click() })
    const groups = useShowStore.getState().show?.fixtureGroups ?? []
    expect(groups.some((g) => g.name === 'Front')).toBe(false)
    expect(groups.find((g) => g.name === 'Ungrouped')?.fixtureIds).toEqual(['f1', 'f2'])
  })
})
