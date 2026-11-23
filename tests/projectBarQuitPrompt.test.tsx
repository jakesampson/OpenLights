// @vitest-environment jsdom
// Mac quit hang (Jake, 23 Nov 2026): the app hung on quit and needed a
// force quit; on reopen the save-changes popup appeared, as if the
// window quit before the prompt got a chance to ask. Two causes:
// (1) when the project is locked, ProjectBar returned early with the
// "Project locked" button and the save prompt — which lives below that
// return — never rendered, while the beforeunload guard still vetoed
// the close; (2) the startup OFL heal marked the untouched demo
// "Unsaved", so the prompt fired for changes nobody made (covered by
// the rebase + setOflProfiles tests). The prompt must appear on a
// red-dot close in the locked state too, and Save / Discard / Cancel
// must complete or cancel the close.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { ProjectBar } from '../src/renderer/src/components/ProjectBar'
import { useShowStore, defaultShow } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const closeWindow = vi.fn()
const saveShow = vi.fn(async () => ({ success: true, path: '/tmp/Demo Show.json' }))

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

async function renderBar() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(<ProjectBar />) })
  // Flush the mount effects' promises (the shows list) so no state update
  // lands outside act() after the test moves on.
  await act(async () => {})
  return el
}

function dialog() {
  return container?.querySelector('[role="dialog"][aria-label="Unsaved project changes"]') as HTMLElement | null
}

function clickButton(label: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label)
  expect(button).toBeTruthy()
  act(() => { button!.click() })
}

beforeEach(() => {
  // Add electronAPI to the real jsdom window — do not replace window itself.
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    listShows: async () => [],
    saveShow,
    saveShowAs: async () => ({ success: false, canceled: true }),
    loadShow: async () => ({ success: false, error: 'No path' }),
    openShow: async () => ({ canceled: true }),
    renameShow: async () => ({ success: false }),
    deleteShow: async () => ({ success: true }),
    duplicateShow: async () => ({ success: false }),
    closeWindow,
    onAppQuitting: () => () => {},
    setChannels: () => {},
  }
  vi.clearAllMocks()
  const state = useShowStore.getState()
  state.unlockApp('')
  state.setShow(defaultShow)
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
  useShowStore.getState().unlockApp('')
})

function dirtyTheShow() {
  act(() => { useShowStore.getState().updateProject({ name: 'Demo Show EDITED' }) })
  expect(container?.querySelector('.lightkey-project small[role="status"]')?.textContent).toBe('Unsaved')
}

function redDotClose() {
  act(() => { window.dispatchEvent(new Event('beforeunload')) })
  expect(dialog()).toBeTruthy()
}

describe('ProjectBar quit prompt', () => {
  it('shows the save prompt on a vetoed close while the project is locked, and Discard closes', async () => {
    await renderBar()
    dirtyTheShow()
    act(() => { useShowStore.getState().lockApp('') })
    expect(container?.querySelector('button[disabled]')?.textContent).toBe('Project locked')
    redDotClose()
    clickButton('Discard')
    expect(closeWindow).toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('shows the save prompt while locked, and Cancel leaves the window open', async () => {
    await renderBar()
    dirtyTheShow()
    act(() => { useShowStore.getState().lockApp('') })
    redDotClose()
    clickButton('Cancel')
    expect(closeWindow).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('shows the save prompt while locked, and Save saves then closes', async () => {
    await renderBar()
    dirtyTheShow()
    act(() => { useShowStore.getState().lockApp('') })
    redDotClose()
    await act(async () => {
      clickButton('Save')
    })
    expect(saveShow).toHaveBeenCalled()
    expect(closeWindow).toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('shows the save prompt on a vetoed close while unlocked (control)', async () => {
    await renderBar()
    dirtyTheShow()
    redDotClose()
    clickButton('Discard')
    expect(closeWindow).toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it('does not prompt on a vetoed close when the show is clean', async () => {
    await renderBar()
    act(() => { window.dispatchEvent(new Event('beforeunload')) })
    expect(dialog()).toBeNull()
    expect(closeWindow).not.toHaveBeenCalled()
  })
})
