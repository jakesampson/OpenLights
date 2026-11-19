// @vitest-environment jsdom
// Piece 2: the patch panel's library search runs through filterProfiles
// and the profile editor opens from the library footer. Renders the real
// PatchPanel with a synthetic show and a stubbed OFL list.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { PatchPanel } from '../src/renderer/src/components/PatchPanel'
import { useShowStore } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Add electronAPI to the real jsdom window — do not replace window itself,
// or React's commit path (window.HTMLIFrameElement) breaks.
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  listOflProfiles: () => Promise.resolve([]),
  importOflLibrary: () => Promise.resolve({ success: false, canceled: true, profiles: [] })
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

describe('PatchPanel fixture library', () => {
  it('lists the built-in profiles, filters by search, and opens the profile editor', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    expect(container?.textContent).toContain('8 models · 8 profiles')
    const search = container?.querySelector('[aria-label="Search fixture library"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(search, 'dimmer')
      search.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    expect(container?.textContent).toContain('1 models · 8 profiles')
    expect(container?.textContent).toContain('Single Dimmer')
    const editorButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Profile editor')
    expect(editorButton).toBeDefined()
    act(() => { editorButton?.click() })
    expect(container?.querySelector('[aria-label="Fixture profile editor"]')).not.toBeNull()
    expect(container?.textContent).toContain('Fixture profile editor')
  })
})
