// @vitest-environment jsdom
// Component tests for the setup wizard chrome, the Project Browser and the
// New Project dialog (Piece 5). The store-level behaviour (step machine,
// grouping, Home cue) is covered in tests/setupWizard.test.ts; these assert
// the rendered UI wires up: recents load, clicks dispatch the right events,
// Back / Next move the wizard.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { WelcomeScreen } from '../src/renderer/src/components/WelcomeScreen'
import { NewProjectDialog } from '../src/renderer/src/components/NewProjectDialog'
import { SaveTemplateDialog } from '../src/renderer/src/components/SaveTemplateDialog'
import { SetupWizard } from '../src/renderer/src/components/SetupWizard'
import { listUserTemplates } from '../src/renderer/src/lib/templates'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

function click(selector: string) {
  const el = container?.querySelector(selector)
  if (!el) throw new Error(`no element for ${selector}`)
  act(() => { (el as HTMLElement).click() })
}

function text() { return container?.textContent ?? '' }

beforeEach(() => {
  const state = useShowStore.getState()
  state.setShow(migrateShow({ fixtures: [], cues: [] } as unknown as ShowDef))
  state.setWelcomeOpen(true)
  state.setNewProjectDialogOpen(false)
  state.setNewProjectTemplate(null)
  state.exitSetupWizard()
  window.localStorage.clear()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    listShows: vi.fn().mockResolvedValue([
      { name: 'Gig Rig', path: '/shows/gig-rig.json', updatedAt: 1700000000000 },
      { name: 'Church', path: '/shows/church.json', updatedAt: 1699000000000 }
    ])
  }
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = undefined
  root = undefined
})

describe('WelcomeScreen (Project Browser)', () => {
  it('lists recent projects and the Demo Show template, and opens a recent', async () => {
    const loads: string[] = []
    window.addEventListener('openlights-load-show', (event) => { loads.push((event as CustomEvent<string>).detail) })
    renderInRoot(<WelcomeScreen />)
    await act(async () => {})
    expect(text()).toContain('Gig Rig')
    expect(text()).toContain('Church')
    expect(text()).toContain('Demo Show')
    expect(text()).toContain('Built-in demo project')
    const buttons = [...(container?.querySelectorAll('button') ?? [])]
    const gig = buttons.find((b) => b.textContent?.includes('Gig Rig'))
    act(() => { gig?.click() })
    expect(loads).toEqual(['/shows/gig-rig.json'])
    expect(useShowStore.getState().welcomeOpen).toBe(false)
  })

  it('New Project opens the name dialog', async () => {
    renderInRoot(<WelcomeScreen />)
    await act(async () => {})
    const buttons = [...(container?.querySelectorAll('button') ?? [])]
    const fresh = buttons.find((b) => b.textContent === 'New Project')
    act(() => { fresh?.click() })
    expect(useShowStore.getState().newProjectDialogOpen).toBe(true)
    expect(useShowStore.getState().newProjectTemplate).toBeNull()
  })
})

describe('WelcomeScreen templates (Piece 6)', () => {
  it('shows a saved user template and deletes it from the row', async () => {
    const show = useShowStore.getState().show!
    window.localStorage.setItem('openlights.templates', JSON.stringify([{ id: 't1', name: 'My Rig', createdAt: 1, show }]))
    renderInRoot(<WelcomeScreen />)
    await act(async () => {})
    expect(text()).toContain('My Rig')
    expect(text()).toContain('Saved template')
    const del = container?.querySelector('[aria-label="Delete template My Rig"]') as HTMLElement
    expect(del).not.toBeNull()
    act(() => { del.click() })
    expect(text()).not.toContain('My Rig')
    expect(listUserTemplates()).toEqual([])
    // The built-in Demo Show has no delete button.
    expect(container?.querySelector('[aria-label^="Delete template"]')).toBeNull()
  })
})

describe('SaveTemplateDialog (Piece 6)', () => {
  it('prefills the show name and saves the whole show as a template', async () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ name: 'Friday Rig', fixtures: [{ id: 'p1', name: 'PAR1', type: 'par', channelStart: 1, channels: 4 }], cues: [] } as unknown as ShowDef))
    let closed = false
    renderInRoot(<SaveTemplateDialog onClose={() => { closed = true }} />)
    const input = container?.querySelector('input[aria-label="Template Name"]') as HTMLInputElement
    expect(input.value).toBe('Friday Rig')
    const buttons = [...(container?.querySelectorAll('button') ?? [])]
    const save = buttons.find((b) => b.textContent === 'Save')
    act(() => { save?.click() })
    expect(listUserTemplates().map((t) => t.name)).toEqual(['Friday Rig'])
    expect(listUserTemplates()[0].show.fixtures).toHaveLength(1)
    expect(text()).toContain('Template “Friday Rig” saved')
    expect(closed).toBe(false)
    const done = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Done')
    act(() => { done?.click() })
    expect(closed).toBe(true)
  })
})

describe('NewProjectDialog', () => {
  it('suggests Show N+1 and saves the typed name', async () => {
    const saved: string[] = []
    renderInRoot(<NewProjectDialog template={null} onSave={(name) => saved.push(name)} onClose={() => {}} />)
    await act(async () => {})
    const input = container?.querySelector('input[aria-label="Project Name"]') as HTMLInputElement
    expect(input.value).toBe('Show 3')
    act(() => {
      // React tracks the input value — set it via the native setter so
      // the change event reaches the component.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'Friday Gig')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    expect(input.value).toBe('Friday Gig')
    click('footer button:last-child')
    expect(saved).toEqual(['Friday Gig'])
  })

  it('prefills the template name when starting from a template', async () => {
    const template = { id: 't1', name: 'My Rig', createdAt: 1, show: useShowStore.getState().show! }
    renderInRoot(<NewProjectDialog template={template} onSave={() => {}} onClose={() => {}} />)
    await act(async () => {})
    const input = container?.querySelector('input[aria-label="Project Name"]') as HTMLInputElement
    expect(input.value).toBe('My Rig')
  })
})

describe('SetupWizard chrome', () => {
  it('Next advances the step and Back from DMX Output returns to the Project Browser', () => {
    const state = () => useShowStore.getState()
    state().startSetupWizard()
    renderInRoot(<SetupWizard />)
    expect(text()).toContain('DMX Output')
    expect(container?.querySelector('[aria-label="Step 1 of 6: DMX Output"]')).not.toBeNull()
    const buttons = [...(container?.querySelectorAll('button') ?? [])]
    const next = buttons.find((b) => b.textContent === 'Next')
    act(() => { next?.click() })
    expect(state().setupWizardStep).toBe('patch')
    expect(text()).toContain('Fixture Patching')
    const back = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Back')
    act(() => { back?.click() })
    expect(state().setupWizardStep).toBe('dmx')
    const backAgain = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Back')
    act(() => { backAgain?.click() })
    expect(state().setupWizardStep).toBeNull()
    expect(state().welcomeOpen).toBe(true)
  })

  it('shows Create Groups for Me on the groups step', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'p1', name: 'PAR1', type: 'par', channelStart: 1, channels: 4 }], cues: [] } as unknown as ShowDef))
    state().startSetupWizard()
    state().setSetupWizardStep('groups')
    renderInRoot(<SetupWizard />)
    expect(text()).toContain('Fixture Groups')
    expect(text()).toContain('Create Groups for Me')
    const buttons = [...(container?.querySelectorAll('button') ?? [])]
    const create = buttons.find((b) => b.textContent === 'Create Groups for Me')
    act(() => { create?.click() })
    expect(state().show!.fixtureGroups?.[0]?.name).toBe('All Fixtures')
  })
})
