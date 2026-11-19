// @vitest-environment jsdom
// 19 Nov 2026, Jake's screenshot: the startup menu (Project Browser) had
// no background — the live Preview, dock and sidebar showed straight
// through it and the Templates row overlapped the bottom dock. Root cause:
// the overlay used `bg-bg/95`, but the theme colours are defined in
// tailwind.config.js as plain `var(--bg)` with no `<alpha-value>`
// placeholder, so Tailwind generates no `bg-bg/NN` opacity utility at all
// (the built CSS has no `bg-bg/95` rule) and the overlay was transparent.
// The overlay now uses solid `bg-bg`, and scrolls when its content is
// taller than the viewport instead of clipping.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { WelcomeScreen } from '../src/renderer/src/components/WelcomeScreen'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Add electronAPI to the real jsdom window — do not replace window itself,
// or React's commit path (window.HTMLIFrameElement) breaks.
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  setChannels: () => {},
  listShows: () => Promise.resolve([])
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

describe('WelcomeScreen (Project Browser) overlay', () => {
  it('paints a solid full-screen background and scrolls when tall', async () => {
    renderInRoot(<WelcomeScreen />)
    await act(async () => {})
    const dialog = container?.querySelector('[role="dialog"]') as HTMLElement | null
    expect(dialog).not.toBeNull()
    const classes = dialog!.className.split(/\s+/)
    // Solid theme background — plain `bg-bg` compiles to `var(--bg)`.
    expect(classes).toContain('bg-bg')
    expect(classes).toContain('fixed')
    expect(classes).toContain('inset-0')
    // No opacity-modified theme background: Tailwind generates no such
    // rule, so it would leave the overlay transparent.
    expect(classes.some((c) => /^bg-bg\//.test(c))).toBe(false)
    // Tall content scrolls inside the overlay instead of clipping.
    expect(classes).toContain('overflow-y-auto')
    expect(container?.textContent).toContain('New Project')
    expect(container?.textContent).toContain('Recent Projects')
    expect(container?.textContent).toContain('Templates')
  })

  it('uses no bg-bg/ opacity utility anywhere in the component', () => {
    const source = readFileSync(resolve(__dirname, '../src/renderer/src/components/WelcomeScreen.tsx'), 'utf8')
    expect(source).not.toMatch(/bg-bg\//)
  })
})
