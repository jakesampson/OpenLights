// @vitest-environment jsdom
// 19 Nov 2026, Jake's screenshots: the setup wizard was split by the app
// header — its bar sat above the header while the step bodies rendered
// below it — and on the Fixture Patching step the Next button could not
// be clicked at all, even though it looked enabled and the step machine
// was fine (nextWizardStep('patch') returns 'preview').
// Root cause of the dead Next: the Patch tool panel overlay (fixed inset-0
// z-50) sat over the whole window, and its header carries
// `-webkit-app-region: drag` (index.css `.patch-dialog-header`, top 50px
// of the window) — Chromium hit-tests draggable regions geometrically,
// so the drag rect swallowed clicks on the wizard bar's Back / Next even
// though the bar (z-60) painted above it. The wizard is now one
// full-window modal (fixed inset-0 z-[70], solid var(--bg) background)
// holding the bar and the step body, and the Patch panel renders inside
// the modal — no tool-panel overlay, no drag region over the bar, on any
// step.
// These tests render the whole App, so they guard the layout itself, not
// just the step machine: the header must be gone while the wizard is open,
// the Patch overlay must not exist, and Next on the patch step must
// actually advance to preview.
// Honest caveat: jsdom has no layout engine, so a synthetic click here
// bypasses hit-testing — this test cannot reproduce the swallowed click
// in a real browser. It locks in the outcome (Next advances) and the
// structure that makes it clickable (no overlay / drag header over the
// bar); Jake's desktop check is the real hit test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Add electronAPI to the real jsdom window — do not replace window itself,
// or React's commit path (window.HTMLIFrameElement) breaks.
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setChannels: () => {},
  getChannels: () => Promise.resolve([])
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

function wizardDialog() {
  return container?.querySelector('[role="dialog"][aria-label="Setup wizard"]') as HTMLElement | null
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  const state = useShowStore.getState()
  state.setShow(migrateShow({ fixtures: [], cues: [] } as unknown as ShowDef))
  state.exitSetupWizard()
  state.setWelcomeOpen(false)
  state.setNewProjectDialogOpen(false)
  state.setNewProjectTemplate(null)
  window.localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
  vi.useRealTimers()
})

describe('Setup wizard modal (full-window, over the whole GUI)', () => {
  it('on the patch step the wizard is a solid modal, the header is gone, and there is no Patch overlay over the bar', async () => {
    const state = () => useShowStore.getState()
    state().startSetupWizard()
    state().setSetupWizardStep('patch')
    renderInRoot(<App />)
    await act(async () => {})
    const dialog = wizardDialog()
    expect(dialog).not.toBeNull()
    const classes = dialog!.className.split(/\s+/)
    // Solid theme background — a plain `var(--bg)` inline style, not the
    // `bg-bg` Tailwind utility (20 Nov 2026, image-24.png: the utility
    // compiled opaque yet the GUI showed ghosted behind the overlay).
    expect(dialog!.getAttribute('style')).toContain('var(--bg)')
    expect(classes).not.toContain('bg-bg')
    expect(classes).toContain('fixed')
    expect(classes).toContain('inset-0')
    // The scrim is no-drag: the header's drag region underneath must not
    // eat clicks in the top 50px regardless of z-index.
    expect(classes).toContain('modal-scrim')
    // No opacity-modified theme background: Tailwind generates no such
    // rule, so it would leave the modal transparent.
    expect(classes.some((c) => /^bg-bg\//.test(c))).toBe(false)
    // The app header is behind the modal — it must not render at all while
    // the wizard is open, so it can never split the tutorial again.
    expect(container?.querySelector('.top-bar')).toBeNull()
    // The Patch tool-panel overlay is gone: it was the element whose
    // `-webkit-app-region: drag` header swallowed clicks on Back / Next.
    expect(container?.querySelector('[role="presentation"]')).toBeNull()
    expect(container?.querySelector('.patch-dialog-header')).toBeNull()
    // …and the Patch panel itself renders inside the modal instead.
    expect(dialog!.textContent).toContain('Fixture Patching')
    expect(dialog!.querySelector('input[placeholder="Search fixtures"]')).not.toBeNull()
    // The step bar's buttons live inside the modal, not under an overlay.
    const next = [...(dialog!.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Next')
    expect(next).not.toBeUndefined()
  })

  it('Next on the patch step advances to preview inside the modal', async () => {
    const state = () => useShowStore.getState()
    state().startSetupWizard()
    state().setSetupWizardStep('patch')
    renderInRoot(<App />)
    await act(async () => {})
    const dialog = wizardDialog()
    expect(dialog).not.toBeNull()
    const next = [...(dialog!.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Next')
    act(() => { next?.click() })
    expect(state().setupWizardStep).toBe('preview')
    // Still the same modal, now holding the preview workspace — the header
    // stays hidden and Back / Next stay reachable.
    const after = wizardDialog()
    expect(after).not.toBeNull()
    expect(container?.querySelector('.top-bar')).toBeNull()
    expect(after!.textContent).toContain('Build Your Preview')
    const mainGrid = container?.querySelector('.main-grid') as HTMLElement | null
    expect(mainGrid).not.toBeNull()
    expect(after!.contains(mainGrid)).toBe(true)
  })

  it('Back from DMX Output returns to the Project Browser', async () => {
    const state = () => useShowStore.getState()
    state().startSetupWizard()
    renderInRoot(<App />)
    await act(async () => {})
    expect(state().setupWizardStep).toBe('dmx')
    const dialog = wizardDialog()
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('DMX Output')
    const back = [...(dialog!.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Back')
    act(() => { back?.click() })
    expect(state().setupWizardStep).toBeNull()
    expect(state().welcomeOpen).toBe(true)
    expect(wizardDialog()).toBeNull()
  })
})
