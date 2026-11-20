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
import { duplicateProfileAsCustom, upsertCustomProfile, deleteCustomProfile } from '../src/shared/oflFixtureFormat'
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
  },
  // The global-custom IPC, stubbed with the same shared helpers the main
  // process uses, so the tests prove the editor's save routing, not a
  // second implementation of it.
  saveOflCustomProfile: (profile: FixtureProfile) => {
    const result = upsertCustomProfile(oflLibraryStub, profile)
    if ('error' in result) return Promise.resolve({ success: false, profiles: oflLibraryStub, error: result.error })
    oflLibraryStub = result.profiles
    return Promise.resolve({ success: true, profiles: oflLibraryStub, profile: result.profile })
  },
  deleteOflCustomProfile: (profileId: string) => {
    const result = deleteCustomProfile(oflLibraryStub, profileId)
    if ('error' in result) return Promise.resolve({ success: false, profiles: oflLibraryStub, error: result.error })
    oflLibraryStub = result.profiles
    return Promise.resolve({ success: true, profiles: oflLibraryStub })
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
    // The model count is gone from the footer (Jake, 20 Nov 2026) — the
    // models list itself is the check: 8 built-ins, filtered by search.
    const models = container?.querySelector('[aria-label="Fixture models"]')
    expect(models?.querySelectorAll('button')).toHaveLength(8)
    expect(container?.textContent).not.toContain('models ·')
    const search = container?.querySelector('[aria-label="Search fixture library"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(search, 'dimmer')
      search.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    expect(models?.querySelectorAll('button')).toHaveLength(1)
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
    // says so and points at the zip upload instead of a blank list. The
    // upload button is labelled Import (Jake, 20 Nov 2026).
    expect(container?.textContent).toContain('No fixture library yet')
    expect(container?.textContent).toContain('open-fixture-library.org')
    expect([...(container?.querySelectorAll('button') ?? [])].some((button) => button.textContent === 'Import')).toBe(true)
  })

  it('duplicates an OFL profile as a custom fixture and hands it to the store', async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    oflLibraryStub = [stubQ5()]
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    // The brand filter starts on Generic (the library loads after the
    // first render), so switch to the uploaded brand first. The models
    // list is brand-filtered, so the upload is proven by the brand
    // column gaining Chauvet DJ, not by the list length.
    const models = container?.querySelector('[aria-label="Fixture models"]')
    const brands = container?.querySelector('[aria-label="Fixture brands"]')
    expect([...(brands?.querySelectorAll('button') ?? [])].some((button) => button.textContent === 'Chauvet DJ')).toBe(true)
    const brandButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Chauvet DJ')
    expect(brandButton).toBeDefined()
    act(() => { brandButton?.click() })
    expect(models?.querySelectorAll('button')).toHaveLength(1)
    // Jake, 20 Nov 2026: Duplicate and + Custom are one New Fixture
    // button. Duplicating goes through the profile editor — the copy's
    // channels land in the form, ready to edit before saving — and the
    // saved copy is GLOBAL: it lives in the library database, not in
    // this show, so every show lists it under User Fixtures.
    const newFixtureButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'New Fixture')
    expect(newFixtureButton).toBeDefined()
    act(() => { newFixtureButton?.click() })
    expect(container?.querySelector('[aria-label="New fixture"]')).not.toBeNull()
    const duplicateChoice = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.includes('Duplicate existing'))
    act(() => { duplicateChoice?.click() })
    const sourceSelect = container?.querySelector('[aria-label="Fixture to duplicate"]') as HTMLSelectElement | null
    expect(sourceSelect?.value).toBe(stubQ5().id)
    const continueButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Continue')
    act(() => { continueButton?.click() })
    await act(async () => {})
    expect(container?.querySelector('[aria-label="Fixture profile editor"]')).not.toBeNull()
    const nameInput = container?.querySelector('[aria-label="Profile name"]') as HTMLInputElement | null
    expect(nameInput?.value).toBe('FXarray Q5 copy')
    const saveButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Save profile')
    act(() => { saveButton?.click() })
    await act(async () => {})
    // The duplicate is visible immediately (Jake, 20 Nov 2026): the
    // brands column switches to User Fixtures and the copy is selected
    // there, instead of staying on the old brand with nothing to show.
    const userFixturesButton = [...(brands?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'User Fixtures')
    expect(userFixturesButton?.getAttribute('aria-pressed')).toBe('true')
    expect(models?.querySelectorAll('button')).toHaveLength(1)
    expect(container?.textContent).toContain('FXarray Q5 copy')
    expect(container?.textContent).toContain('Custom')
    const selectedModel = models?.querySelector('button[aria-pressed="true"]')
    expect(selectedModel?.textContent).toContain('FXarray Q5 copy')
    expect(container?.textContent).toContain('OFL zip uploads will never update it')
    // Global (Jake, 20 Nov 2026): the copy is in the library database,
    // and the show holds no copy of it — opening another show lists it
    // under User Fixtures there too.
    expect(oflLibraryStub.some((p) => p.custom && p.name === 'FXarray Q5 copy')).toBe(true)
    expect(useShowStore.getState().show?.fixtureProfiles ?? []).toHaveLength(0)
    expect(useShowStore.getState().oflProfiles.some((p) => p.custom && p.name === 'FXarray Q5 copy')).toBe(true)
  })

  it('duplicates a built-in generic as a custom fixture', async () => {
    // 20 Nov 2026, Jake's screenshot image-ecf244b1.png: with no OFL
    // library uploaded every visible profile is a built-in, and the old
    // Duplicate was disabled for all of them — it looked clickable (no
    // dimmed styling) but did nothing. Built-ins now duplicate through
    // New Fixture as a global custom copy, the same as an OFL
    // duplicate.
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    const models = container?.querySelector('[aria-label="Fixture models"]')
    const brands = container?.querySelector('[aria-label="Fixture brands"]')
    const newFixtureButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'New Fixture')
    expect(newFixtureButton).toBeDefined()
    expect([...(container?.querySelectorAll('button') ?? [])].some((button) => button.textContent === 'Duplicate')).toBe(false)
    act(() => { newFixtureButton?.click() })
    const duplicateChoice = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.includes('Duplicate existing'))
    act(() => { duplicateChoice?.click() })
    const continueButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Continue')
    act(() => { continueButton?.click() })
    await act(async () => {})
    const nameInput = container?.querySelector('[aria-label="Profile name"]') as HTMLInputElement | null
    expect(nameInput?.value).toBe('Generic PAR (RGB) copy')
    const saveButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Save profile')
    act(() => { saveButton?.click() })
    await act(async () => {})
    const userFixturesButton = [...(brands?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'User Fixtures')
    expect(userFixturesButton?.getAttribute('aria-pressed')).toBe('true')
    expect(models?.querySelectorAll('button')).toHaveLength(1)
    expect(container?.textContent).toContain('Generic PAR (RGB) copy')
    expect(container?.textContent).toContain('Custom')
    expect(container?.textContent).toContain('OFL zip uploads will never update it')
    // Global (Jake, 20 Nov 2026): the copy is in the library database
    // under a fresh custom: id, and the show holds no copy of it.
    expect(oflLibraryStub.some((p) => p.name === 'Generic PAR (RGB) copy' && p.custom === true && p.id.startsWith('custom:'))).toBe(true)
    expect(useShowStore.getState().show?.fixtureProfiles ?? []).toHaveLength(0)
  })

  it("'New Fixture' from scratch creates a custom fixture listed under User Fixtures", async () => {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    expect([...(container?.querySelectorAll('button') ?? [])].some((button) => button.textContent === 'Export OFL')).toBe(false)
    expect([...(container?.querySelectorAll('button') ?? [])].some((button) => button.textContent === '+ Custom')).toBe(false)
    const newFixtureButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'New Fixture')
    expect(newFixtureButton).toBeDefined()
    act(() => { newFixtureButton?.click() })
    expect(container?.querySelector('[aria-label="New fixture"]')).not.toBeNull()
    // Start from scratch is the default choice — no need to pick it.
    const continueButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Continue')
    act(() => { continueButton?.click() })
    expect(container?.querySelector('[aria-label="Fixture profile editor"]')).not.toBeNull()
    // The editor form is expanded on open (Jake, 20 Nov 2026) — no
    // collapsed "Fixture profile editor" disclosure to click first. (The
    // wheel-ranges disclosure inside the form is a different, kept one.)
    expect([...(container?.querySelectorAll('summary') ?? [])].some((summary) => summary.textContent === 'Fixture profile editor')).toBe(false)
    const nameInput = container?.querySelector('[aria-label="Profile name"]') as HTMLInputElement | null
    expect(nameInput?.value).toBe('New Fixture')
    const saveButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Save profile')
    expect(saveButton).toBeDefined()
    act(() => { saveButton?.click() })
    await act(async () => {})
    // Global (Jake, 20 Nov 2026): a from-scratch fixture lives in the
    // library database, not in this show.
    expect(oflLibraryStub.some((p) => p.name === 'New Fixture' && p.custom === true)).toBe(true)
    expect(useShowStore.getState().show?.fixtureProfiles ?? []).toHaveLength(0)
    // The User Fixtures category is pinned first in the brands column.
    const brands = container?.querySelector('[aria-label="Fixture brands"]')
    const brandButtons = [...(brands?.querySelectorAll('button') ?? [])]
    expect(brandButtons[0]?.textContent).toBe('User Fixtures')
    act(() => { brandButtons[0]?.click() })
    const models = container?.querySelector('[aria-label="Fixture models"]')
    expect(models?.querySelectorAll('button')).toHaveLength(1)
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

  it('editing a global custom fixture updates the global record, not the show', async () => {
    // Jake, 20 Nov 2026: customs are global — editing one updates the
    // library record, and the show holds no copy of it.
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const custom = duplicateProfileAsCustom(BUILTIN_PROFILES[0])
    custom.name = 'My PAR'
    oflLibraryStub = [custom]
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    const editorButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Profile editor')
    act(() => { editorButton?.click() })
    await act(async () => {})
    const select = container?.querySelector('[aria-label="Profile to edit"]') as HTMLSelectElement | null
    const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    act(() => { selectSetter.call(select!, custom.id); select!.dispatchEvent(new window.Event('change', { bubbles: true })) })
    const nameInput = container?.querySelector('[aria-label="Profile name"]') as HTMLInputElement | null
    expect(nameInput?.value).toBe('My PAR')
    const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => { inputSetter.call(nameInput!, 'My PAR Renamed'); nameInput!.dispatchEvent(new window.Event('input', { bubbles: true })) })
    const saveButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Save profile')
    act(() => { saveButton?.click() })
    await act(async () => {})
    expect(oflLibraryStub).toHaveLength(1)
    expect(oflLibraryStub[0]?.id).toBe(custom.id)
    expect(oflLibraryStub[0]?.name).toBe('My PAR Renamed')
    expect(useShowStore.getState().show?.fixtureProfiles ?? []).toHaveLength(0)
  })

  it('editing an OFL base record saves a new global custom and leaves the base untouched', async () => {
    // A base library record is never overwritten: editing it in place
    // mints a fresh custom id for the edited copy, which is global.
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const q5 = stubQ5()
    oflLibraryStub = [q5]
    act(() => { useShowStore.setState({ show: { ...base, fixtures: [], fixtureProfiles: [] } }) })
    renderInRoot(<PatchPanel />)
    await act(async () => {})
    const editorButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Profile editor')
    act(() => { editorButton?.click() })
    await act(async () => {})
    const select = container?.querySelector('[aria-label="Profile to edit"]') as HTMLSelectElement | null
    const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    act(() => { selectSetter.call(select!, q5.id); select!.dispatchEvent(new window.Event('change', { bubbles: true })) })
    const nameInput = container?.querySelector('[aria-label="Profile name"]') as HTMLInputElement | null
    expect(nameInput?.value).toBe('FXarray Q5')
    const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => { inputSetter.call(nameInput!, 'FXarray Q5 Edited'); nameInput!.dispatchEvent(new window.Event('input', { bubbles: true })) })
    const saveButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Save profile')
    act(() => { saveButton?.click() })
    await act(async () => {})
    expect(oflLibraryStub).toHaveLength(2)
    const original = oflLibraryStub.find((p) => p.id === q5.id)
    expect(original?.name).toBe('FXarray Q5')
    expect(original?.custom).not.toBe(true)
    const edited = oflLibraryStub.find((p) => p.name === 'FXarray Q5 Edited')
    expect(edited?.custom).toBe(true)
    expect(edited?.id).not.toBe(q5.id)
    expect(edited?.id.startsWith('custom:')).toBe(true)
    expect(useShowStore.getState().show?.fixtureProfiles ?? []).toHaveLength(0)
  })
})
