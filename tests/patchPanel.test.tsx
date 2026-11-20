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
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'
import type { FixtureDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Add electronAPI to the real jsdom window — do not replace window itself,
// or React's commit path (window.HTMLIFrameElement) breaks. The stubbed
// library is mutable per test: the zip-upload and duplicate flows return
// the library the main process would have written.
import { duplicateProfileAsCustom } from '../src/shared/oflFixtureFormat'
import { importOflFixture } from '../src/shared/oflFixtureFormat'
import { readFileSync } from 'node:fs'
import type { FixtureProfile } from '../src/shared/types'

let oflLibraryStub: FixtureProfile[] = []
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  listOflProfiles: () => Promise.resolve(oflLibraryStub),
  importOflLibraryZip: () => Promise.resolve({ success: false, canceled: true, profiles: oflLibraryStub }),
  duplicateOflProfile: (profileId: string) => {
    const original = oflLibraryStub.find((p) => p.id === profileId)
    if (!original) return Promise.resolve({ success: false, profiles: oflLibraryStub, error: 'Fixture not found in the library' })
    const copy = duplicateProfileAsCustom(original)
    oflLibraryStub = [...oflLibraryStub, copy]
    return Promise.resolve({ success: true, profiles: oflLibraryStub, profile: copy })
  }
}

const stubQ5 = (): FixtureProfile =>
  importOflFixture(readFileSync('tests/fixtures/chauvet-dj/fxarray-q5.json', 'utf-8'), {
    manufacturerKey: 'chauvet-dj',
    manufacturer: 'Chauvet DJ',
    fixtureKey: 'fxarray-q5',
    preserveSource: false
  })

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
  oflLibraryStub = []
  act(() => { useShowStore.getState().setOflProfiles([]) })
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

  it('double-clicking a patched fixture reopens the patch dialog in edit mode', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const profile = BUILTIN_PROFILES[0]
    const fixture: FixtureDef = {
      id: 'f1', name: profile.name, type: profile.legacyType, channelStart: 1, channels: 4,
      shortName: 'P1', profileId: profile.id, modeId: 'default', profile: structuredClone(profile)
    }
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [fixture], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    const cell = container?.querySelector('[data-channel="1"]') as HTMLElement | null
    if (!cell) throw new Error('no channel 1 cell')
    act(() => { cell.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })) })
    expect(container?.textContent).toContain('Edit fixture')
    expect(container?.querySelector(`[aria-label="Edit ${profile.name}"]`)).not.toBeNull()
  })

  it('shows the upload guidance when no OFL library is loaded', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    // The built-ins still patch, but the OFL library is empty: the panel
    // says so and points at the zip upload instead of a blank list.
    expect(container?.textContent).toContain('No fixture library yet')
    expect(container?.textContent).toContain('open-fixture-library.org')
    expect([...(container?.querySelectorAll('button') ?? [])].some((button) => button.textContent === 'Upload OFL zip…')).toBe(true)
  })

  it('duplicates an OFL profile as a custom fixture and hands it to the store', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    oflLibraryStub = [stubQ5()]
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    // The brand filter starts on Generic (the library loads after the
    // first render), so switch to the uploaded brand first.
    expect(container?.textContent).toContain('8 models · 9 profiles')
    const brandButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Chauvet DJ')
    expect(brandButton).toBeDefined()
    act(() => { brandButton?.click() })
    expect(container?.textContent).toContain('1 models · 9 profiles')
    const duplicateButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Duplicate')
    expect(duplicateButton?.hasAttribute('disabled')).toBe(false)
    await act(async () => { duplicateButton?.click() })
    await act(async () => {})
    expect(container?.textContent).toContain('FXarray Q5 copy')
    expect(container?.textContent).toContain('Custom')
    expect(container?.textContent).toContain('2 models · 10 profiles')
    expect(container?.textContent).toContain('OFL zip uploads will never update it')
    const stored = useShowStore.getState().oflProfiles
    expect(stored.some((p) => p.custom && p.name === 'FXarray Q5 copy')).toBe(true)
  })

  it('Build Your Own Fixture creates a custom fixture listed under User Fixtures', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    expect([...(container?.querySelectorAll('button') ?? [])].some((button) => button.textContent === 'Export OFL')).toBe(false)
    const buildButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Build Your Own Fixture')
    expect(buildButton).toBeDefined()
    act(() => { buildButton?.click() })
    expect(container?.querySelector('[aria-label="Fixture profile editor"]')).not.toBeNull()
    const nameInput = container?.querySelector('[aria-label="Profile name"]') as HTMLInputElement | null
    expect(nameInput?.value).toBe('New Fixture')
    const saveButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Save profile')
    expect(saveButton).toBeDefined()
    act(() => { saveButton?.click() })
    const saved = useShowStore.getState().show?.fixtureProfiles ?? []
    expect(saved.some((p) => p.name === 'New Fixture' && p.custom === true)).toBe(true)
    // The User Fixtures category is pinned first in the brands column.
    const brands = container?.querySelector('[aria-label="Fixture brands"]')
    const brandButtons = [...(brands?.querySelectorAll('button') ?? [])]
    expect(brandButtons[0]?.textContent).toBe('User Fixtures')
    act(() => { brandButtons[0]?.click() })
    expect(container?.textContent).toContain('1 models · 9 profiles')
    expect(container?.textContent).toContain('New Fixture')
  })

  it('User Fixtures is pinned first and lists only custom fixtures', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const q5 = stubQ5()
    oflLibraryStub = [q5, duplicateProfileAsCustom(q5)]
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    const brands = container?.querySelector('[aria-label="Fixture brands"]')
    const brandButtons = [...(brands?.querySelectorAll('button') ?? [])]
    expect(brandButtons.map((b) => b.textContent)).toEqual(['User Fixtures', 'Chauvet DJ', 'Generic'])
    act(() => { brandButtons[0]?.click() })
    expect(container?.textContent).toContain('1 models · 10 profiles')
    const models = container?.querySelector('[aria-label="Fixture models"]')
    expect(models?.querySelectorAll('button')).toHaveLength(1)
    expect(models?.textContent).toContain('FXarray Q5 copy')
  })

  it('User Fixtures shows a hint when there are no custom fixtures yet', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    const brands = container?.querySelector('[aria-label="Fixture brands"]')
    const brandButtons = [...(brands?.querySelectorAll('button') ?? [])]
    expect(brandButtons[0]?.textContent).toBe('User Fixtures')
    act(() => { brandButtons[0]?.click() })
    expect(container?.textContent).toContain('No custom fixtures yet')
  })
})
