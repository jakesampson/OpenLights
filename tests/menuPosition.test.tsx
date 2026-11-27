// Jake, 26 Nov 2026 — a right-click menu opened at the raw click point
// ran off the bottom / right of the window when the click was near an
// edge (Live canvas menu). The shared clamp in lib/menuPosition must
// keep every menu fully inside the viewport.
//
// jsdom has no layout, so window.innerWidth/innerHeight and
// getBoundingClientRect are mocked here — the point of these tests is
// that the clamp logic itself is exercised, not just that a menu
// renders.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { useRef } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { clampMenuPosition, flyoutSide, flyoutTopShift, MENU_VIEWPORT_MARGIN, useClampedMenuPosition } from '../src/renderer/src/lib/menuPosition'
import { ContextMenu } from '../src/renderer/src/components/ContextMenu'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

describe('clampMenuPosition', () => {
  beforeEach(() => setViewport(1024, 768))
  afterEach(() => vi.restoreAllMocks())

  it('leaves the click point alone when there is room', () => {
    expect(clampMenuPosition(100, 100, 176, 320)).toEqual({ left: 100, top: 100 })
  })

  it('pulls the menu up when the click is near the bottom edge', () => {
    // 320px menu, 768px viewport: top may be at most 768 - 320 - 8 = 440.
    expect(clampMenuPosition(100, 700, 176, 320)).toEqual({ left: 100, top: 440 })
  })

  it('pulls the menu left when the click is near the right edge', () => {
    // 176px menu, 1024px viewport: left may be at most 1024 - 176 - 8 = 840.
    expect(clampMenuPosition(1000, 100, 176, 320)).toEqual({ left: 840, top: 100 })
  })

  it('clamps both axes in the bottom-right corner', () => {
    expect(clampMenuPosition(1000, 700, 176, 320)).toEqual({ left: 840, top: 440 })
  })

  it('never goes above / left of the margin', () => {
    expect(clampMenuPosition(0, 0, 176, 320)).toEqual({ left: MENU_VIEWPORT_MARGIN, top: MENU_VIEWPORT_MARGIN })
    expect(clampMenuPosition(-50, -20, 176, 320)).toEqual({ left: MENU_VIEWPORT_MARGIN, top: MENU_VIEWPORT_MARGIN })
  })

  it('pins a taller-than-viewport menu to the top margin', () => {
    expect(clampMenuPosition(500, 700, 176, 900)).toEqual({ left: 500, top: MENU_VIEWPORT_MARGIN })
  })

  it('pins a wider-than-viewport menu to the left margin', () => {
    expect(clampMenuPosition(900, 100, 1200, 320)).toEqual({ left: MENU_VIEWPORT_MARGIN, top: 100 })
  })

  it('keeps the menu exactly inside when it just fits', () => {
    expect(clampMenuPosition(840, 440, 176, 320)).toEqual({ left: 840, top: 440 })
  })
})

function MenuProbe({ x, y }: { x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useClampedMenuPosition(x, y, ref)
  return <div ref={ref} data-left={pos.left} data-top={pos.top} style={{ width: 176, height: 320 }} />
}

describe('useClampedMenuPosition', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    setViewport(1024, 768)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('measures the mounted menu and clamps it into the viewport', () => {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 176, height: 320, x: 0, y: 0, top: 0, left: 0, right: 176, bottom: 320, toJSON: () => ({}),
    } as DOMRect)
    act(() => { root.render(<MenuProbe x={1000} y={700} />) })
    const el = container.querySelector('div')
    expect(el?.getAttribute('data-left')).toBe('840')
    expect(el?.getAttribute('data-top')).toBe('440')
  })

  it('keeps the click point when there is room', () => {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 176, height: 320, x: 0, y: 0, top: 0, left: 0, right: 176, bottom: 320, toJSON: () => ({}),
    } as DOMRect)
    act(() => { root.render(<MenuProbe x={100} y={100} />) })
    const el = container.querySelector('div')
    expect(el?.getAttribute('data-left')).toBe('100')
    expect(el?.getAttribute('data-top')).toBe('100')
  })
})

describe('flyoutSide', () => {
  // Jake, 27 Nov 2026 — LightKey's cue-button submenus pop out sideways:
  // right of the parent item, left when there is no room on the right.
  const viewport = 1392
  it('opens right when there is room', () => {
    expect(flyoutSide(100, 300, 176, viewport)).toBe('right')
  })
  it('opens left when the submenu would run off the right edge', () => {
    // Parent item ends at 1300; a 176px submenu needs 1300 + 176 + 8 = 1484 > 1392.
    expect(flyoutSide(1100, 1300, 176, viewport)).toBe('left')
  })
  it('opens right when it just fits', () => {
    // 1200 + 176 + 8 = 1384 <= 1392.
    expect(flyoutSide(1000, 1200, 176, viewport)).toBe('right')
  })
  it('opens on the side with more room when neither side fits', () => {
    // A 1200px submenu fits on neither side of an item at 600–800:
    // 600px of room on the left beats 592px on the right.
    expect(flyoutSide(600, 800, 1200, viewport)).toBe('left')
    expect(flyoutSide(100, 300, 1200, viewport)).toBe('right')
  })
})

describe('flyoutTopShift', () => {
  const viewport = 1050
  it('does not shift when the submenu fits', () => {
    expect(flyoutTopShift(100, 400, viewport)).toBe(0)
  })
  it('shifts up by the overflow when it runs off the bottom', () => {
    // Bottom at 1100, viewport 1050: shift up 58 so the bottom sits at 1042.
    expect(flyoutTopShift(700, 1100, viewport)).toBe(-58)
  })
  it('never shifts above the top margin', () => {
    // A 1200px submenu cannot fit: shift up only as far as the margin.
    expect(flyoutTopShift(100, 1300, viewport)).toBe(-92)
  })
})

describe('ContextMenu clamping', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    setViewport(1024, 768)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('opens fully inside the window when right-clicking the bottom-right corner', () => {
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 176, height: 320, x: 0, y: 0, top: 0, left: 0, right: 176, bottom: 320, toJSON: () => ({}),
    } as DOMRect)
    act(() => { root.render(<><ContextMenu /><div data-context-menu="page">canvas</div></>) })
    const target = container.querySelector('[data-context-menu="page"]')!
    act(() => {
      target.dispatchEvent(new MouseEvent('contextmenu', { clientX: 1000, clientY: 700, bubbles: true }))
    })
    const menu = container.querySelector('[role="menu"]') as HTMLElement | null
    expect(menu).not.toBeNull()
    expect(menu!.style.left).toBe('840px')
    expect(menu!.style.top).toBe('440px')
    // Every item stays inside the window.
    expect(840 + 176).toBeLessThanOrEqual(1024)
    expect(440 + 320).toBeLessThanOrEqual(768)
  })
})
