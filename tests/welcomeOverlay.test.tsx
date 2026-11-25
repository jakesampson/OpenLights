// @vitest-environment jsdom
// Project Browser overlay (Jake, 20 Nov 2026, screenshot image-24.png):
// clicking and dragging on the startup screen showed the GUI ghosted
// behind it, and the drag selected the heading text. The overlay must be
// an opaque full-screen scrim and a hard event boundary — nothing behind
// it receives clicks or drags.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { WelcomeScreen } from '../src/renderer/src/components/WelcomeScreen'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

function renderWelcome() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(<WelcomeScreen />) })
  return el
}

beforeEach(() => {
  // Add electronAPI to the real jsdom window — do not replace window itself.
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { listShows: async () => [] }
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
})

function overlay() {
  return container?.querySelector('[role="dialog"]') as HTMLElement | null
}

describe('Project Browser overlay', () => {
  it('is a fixed layer below the drag strip', () => {
    // The scrim starts below the top 50px drag strip (top: 50px, not
    // inset-0): a drag region is honoured only where no `no-drag` rect
    // covers it, and the full-window no-drag scrim subtracted the strip
    // away entirely, so the welcome screen could never be dragged
    // (Jake, 25 Nov 2026). The strip paints the top 50px in the app
    // background itself, so the purple is seamless.
    renderWelcome()
    const el = overlay()
    expect(el).not.toBeNull()
    for (const cls of ['fixed', 'inset-x-0', 'bottom-0', 'top-[50px]', 'z-[70]', 'modal-scrim']) expect(el?.classList.contains(cls)).toBe(true)
    expect(el?.classList.contains('inset-0')).toBe(false)
  })

  it('paints a plain opaque background, not a Tailwind colour-mix utility', () => {
    renderWelcome()
    const el = overlay()
    // A plain var(--bg) inline style cannot silently go translucent the
    // way a generated colour-mix utility can (image-24.png).
    expect(el?.getAttribute('style')).toContain('var(--bg)')
    expect(el?.classList.contains('bg-bg')).toBe(false)
  })

  it('cannot be text-selected by dragging', () => {
    renderWelcome()
    expect(overlay()?.classList.contains('select-none')).toBe(true)
  })

  it('stops pointer events reaching anything behind it', () => {
    renderWelcome()
    let behindHeard = false
    const listener = () => { behindHeard = true }
    window.addEventListener('pointerdown', listener)
    try {
      const heading = container?.querySelector('h1')
      expect(heading).not.toBeNull()
      act(() => { heading?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })) })
      expect(behindHeard).toBe(false)
    } finally {
      window.removeEventListener('pointerdown', listener)
    }
  })

  it('prevents a native drag starting on it', () => {
    renderWelcome()
    const el = overlay()
    expect(el).not.toBeNull()
    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    act(() => { el?.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
  })

  it('has a drag strip across the top 50px, and its close button is excluded from dragging', () => {
    // Jake, 23 Nov 2026, screenshot image-ff69c11b.png: the welcome
    // screen has no header to drag the window from, so its top 50px —
    // the normal header height — is a drag strip. The strip is the
    // scrim's first child; it is FIXED (not absolute) so it stays at
    // the viewport top instead of scrolling away with the list — a drag
    // region nested inside the scrim's scrolling content is never
    // honoured by Chromium (proven 25 Nov 2026). The close button
    // carries the class that paints it above the strip and excludes it
    // from dragging, or the strip would swallow its clicks when the
    // header row reaches the top 50px.
    renderWelcome()
    const el = overlay()
    expect(el).not.toBeNull()
    const strip = el?.querySelector('.welcome-drag-strip')
    expect(strip).not.toBeNull()
    expect(el?.firstElementChild).toBe(strip)
    expect(strip?.getAttribute('aria-hidden')).toBe('true')
    const close = container?.querySelector('[aria-label="Close Project Browser"]')
    expect(close).not.toBeNull()
    expect(close?.classList.contains('welcome-close-button')).toBe(true)
  })
})
