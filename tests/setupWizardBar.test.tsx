// @vitest-environment jsdom
// Setup wizard bar clearance (Jake, 20 Nov 2026, screenshot image-25.png):
// the native window controls sit over the top of the window, so the
// wizard's Back / Next must clear them — on Windows the caption buttons
// occupy the top-right, on macOS the traffic lights occupy the top-left.
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { SetupWizard } from '../src/renderer/src/components/SetupWizard'
import { useShowStore } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

function renderWizard(isMac: boolean) {
  act(() => { useShowStore.setState({ setupWizardStep: 'dmx' }) })
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
})
