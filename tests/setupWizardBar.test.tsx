// @vitest-environment jsdom
// Setup wizard bar clearance (Jake, 20 Nov 2026, screenshot image-25.png):
// the native window controls sit over the top of the window, so the
// wizard's Back / Next must clear them — on Windows the caption buttons
// occupy the top-right, on macOS the traffic lights occupy the top-left.
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { SetupWizard, type WizardStep } from '../src/renderer/src/components/SetupWizard'
import { useShowStore } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

function renderWizard(isMac: boolean, step: WizardStep = 'dmx') {
  act(() => { useShowStore.setState({ setupWizardStep: step }) })
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(<SetupWizard isMac={isMac} />) })
  return el
}

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
  act(() => { useShowStore.setState({ setupWizardStep: null }) })
})

describe('setup wizard bar', () => {
  it('on Windows clears the caption buttons on the right', () => {
    renderWizard(false)
    expect(container?.querySelector('.wizard-bar-windows')).not.toBeNull()
    expect(container?.querySelector('.wizard-bar-mac')).toBeNull()
    expect(container?.querySelector('button')?.textContent).toContain('Back')
  })

  it('on macOS clears the traffic lights on the left', () => {
    renderWizard(true)
    expect(container?.querySelector('.wizard-bar-mac')).not.toBeNull()
    expect(container?.querySelector('.wizard-bar-windows')).toBeNull()
  })

  it('still shows Back and Next on both platforms', () => {
    for (const isMac of [false, true]) {
      renderWizard(isMac)
      const labels = [...(container?.querySelectorAll('button') ?? [])].map((b) => b.textContent)
      expect(labels).toContain('Back')
      expect(labels).toContain('Next')
      act(() => { rootNode?.unmount() })
      rootNode = undefined
      container?.remove()
      container = undefined
    }
  })

  it('is the window drag region, with its buttons excluded from dragging', () => {
    // Jake, 25 Nov 2026: the opening window could not be dragged on
    // Windows — the wizard is a full-window modal with no header to
    // drag from, and its scrim is no-drag, so it could never be dragged
    // at all. The bar itself is the drag region (like the in-app
    // header); its buttons are positioned and excluded from dragging
    // by the `.wizard-drag-bar button` CSS rule (asserted in
    // nativeWindowChrome.test.ts), or the bar would swallow their
    // clicks.
    renderWizard(false)
    expect(container?.querySelector('.wizard-drag-bar')).not.toBeNull()
    expect(container?.querySelector('.wizard-drag-bar button')).not.toBeNull()
  })

  it('shows a labelled Cancel instead of the × close button, centred at the top', () => {
    // 20 Nov 2026 (Jake): the right-aligned Back / Next / × sat under the
    // native Windows caption buttons, which was confusing — the nav group
    // is centred across the bar instead, and × is a labelled Cancel.
    // The bar is a 3-column grid (1fr auto 1fr) with the nav as the centre
    // column, so it is exactly centred without overlaying the title block.
    for (const isMac of [false, true]) {
      renderWizard(isMac)
      const labels = [...(container?.querySelectorAll('button') ?? [])].map((b) => b.textContent)
      expect(labels).toContain('Cancel')
      expect(labels).not.toContain('×')
      const cancel = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Cancel')
      expect(cancel?.getAttribute('aria-label')).toBe('Cancel setup wizard')
      const group = cancel?.parentElement
      expect(group?.className).not.toContain('absolute')
      expect(group?.className).toContain('justify-self-center')
      const bar = group?.parentElement
      expect(bar?.className).toContain('grid-cols-[1fr_auto_1fr]')
      act(() => { rootNode?.unmount() })
      rootNode = undefined
      container?.remove()
      container = undefined
    }
  })

  it('the subtitle wraps in its own grid column and never sits under the nav, on every step', () => {
    // 20 Nov 2026 (Jake, screenshot): step 3's subtitle ran underneath the
    // centred Back / Next / Cancel buttons. The title block lives in the
    // grid's left column and the nav in the centre column, so the two can
    // never overlap — and the subtitle wraps (2 lines max) instead of
    // truncating to a single line that ran under the buttons.
    const steps: WizardStep[] = ['dmx', 'patch', 'preview', 'groups', 'directions', 'done']
    for (const step of steps) {
      renderWizard(false, step)
      const description = container?.querySelector('.line-clamp-2')
      expect(description).not.toBeNull()
      expect(description?.className).not.toContain('truncate')
      expect(description?.textContent?.length).toBeGreaterThan(0)
      const nav = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Cancel')
      // The nav group and the title block are siblings in different grid
      // columns — the nav is not an overlay on top of the title block.
      expect(nav?.parentElement).not.toBe(description?.parentElement?.parentElement)
      expect(nav?.parentElement?.parentElement).toBe(description?.closest('.grid'))
      act(() => { rootNode?.unmount() })
      rootNode = undefined
      container?.remove()
      container = undefined
    }
  })

  it('Cancel exits the wizard', () => {
    renderWizard(false)
    const cancel = [...(container?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Cancel')
    expect(cancel).not.toBeUndefined()
    act(() => { cancel?.click() })
    expect(useShowStore.getState().setupWizardStep).toBeNull()
  })
})
