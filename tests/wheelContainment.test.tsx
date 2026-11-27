// Colour wheel containment (Jake, 28 Nov 2026): at a tall bottom panel
// the height-driven wheel (543px) burst out of its 378px card — the
// card sizes to its contents (the svg's intrinsic 220px) while the
// wheel stretched to the card body's height. A ResizeObserver on the
// card body measures the body height and the wheel wrapper takes that
// exact size, so the card grows to contain the wheel. Then Jake
// corrected the growth itself: the wheel should NOT scale with the
// panel at all — it has a LOCKED width like LightKey (200px, whose
// hue ring renders at ~176px, matching LightKey's measured ~177px).
// The wrapper now takes the smaller of the body height and that
// locked size, shrinking only if the panel is dragged too short to
// hold it. These tests drive the observer with fake heights (jsdom
// has no layout) and assert the wrapper's explicit size follows the
// lock — and that before any measurement it keeps the old
// aspect-square behaviour with no explicit size.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type ObserverEntry = { contentRect: { height: number } }

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  callback: (entries: ObserverEntry[]) => void
  observed: Element | null = null
  constructor(callback: (entries: ObserverEntry[]) => void) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
  observe(el: Element) { this.observed = el }
  unobserve() { this.observed = null }
  disconnect() { this.observed = null }
  fire(height: number) { this.callback([{ contentRect: { height } }]) }
}

const originalResizeObserver = (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(node) })
  return el
}

function setShow() {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const cue = { id: 'c1', name: 'Cue 1', fixtureValues: { fx1: { intensity: 255, red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0, pan: 128, tilt: 128, gobo: 0, strobe: 0 } }, fadeMs: 0 }
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [{ id: 'fx1', name: 'Test Wash', type: 'led-wash', channelStart: 1, channels: 7 }],
    livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Cue 1', type: 'push', presetIds: [], cue, x: 0, y: 0 }] }],
  }
  act(() => {
    useShowStore.setState({ show, presets: [], cueLists: [], selectedFixtureIds: ['fx1'], activeCueRef: { kind: 'button', pageId: 'page1', controlId: 'btn1' }, editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false })
  })
}

function colourCard() {
  return container?.querySelector('[data-testid="colour-card"]') as HTMLElement | null
}

function wheelWrapper() {
  // The wheel's root is the .color-wheel div (role="slider"); its
  // parent is the square wrapper the observer sizes. (The card's
  // header buttons also contain svgs, so the bare `svg` selector
  // would grab one of those instead.)
  const wheel = colourCard()?.querySelector('.color-wheel')
  return (wheel?.parentElement ?? null) as HTMLElement | null
}

beforeEach(() => {
  MockResizeObserver.instances = []
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver
  setShow()
  renderInRoot(<DesignTab />)
})

afterEach(() => {
  act(() => { rootNode?.unmount() })
  container?.remove()
  container = undefined
  rootNode = undefined
  if (originalResizeObserver === undefined) {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver
  } else {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver
  }
})

describe('colour wheel containment', () => {
  it('observes the colour card body (the wheel wrapper\'s parent)', () => {
    const wrapper = wheelWrapper()
    expect(wrapper).not.toBeNull()
    expect(MockResizeObserver.instances.length).toBe(1)
    expect(MockResizeObserver.instances[0].observed).toBe(wrapper?.parentElement)
    expect(colourCard()?.contains(MockResizeObserver.instances[0].observed)).toBe(true)
  })

  it('has no explicit size before the first measurement (aspect-square fallback)', () => {
    const wrapper = wheelWrapper()
    expect(wrapper).not.toBeNull()
    expect(wrapper?.style.width).toBe('')
    expect(wrapper?.style.height).toBe('')
    expect(wrapper?.className).toContain('aspect-square')
  })

  it('locks at LightKey size when the body is taller, and tracks the body when it is shorter', () => {
    const wrapper = wheelWrapper()
    expect(wrapper).not.toBeNull()
    // A tall panel does NOT grow the wheel past the lock.
    act(() => { MockResizeObserver.instances[0].fire(543) })
    expect(wrapper?.style.width).toBe('200px')
    expect(wrapper?.style.height).toBe('200px')
    act(() => { MockResizeObserver.instances[0].fire(640) })
    expect(wrapper?.style.width).toBe('200px')
    expect(wrapper?.style.height).toBe('200px')
    // A body shorter than the lock shrinks it — a hard 200px in a
    // shorter body would burst out of the card again.
    act(() => { MockResizeObserver.instances[0].fire(150) })
    expect(wrapper?.style.width).toBe('150px')
    expect(wrapper?.style.height).toBe('150px')
    // And it grows back to the lock, never past it.
    act(() => { MockResizeObserver.instances[0].fire(300) })
    expect(wrapper?.style.width).toBe('200px')
    expect(wrapper?.style.height).toBe('200px')
  })

  it('ignores a repeat measurement of the same height', () => {
    const wrapper = wheelWrapper()
    act(() => { MockResizeObserver.instances[0].fire(543) })
    act(() => { MockResizeObserver.instances[0].fire(543) })
    expect(wrapper?.style.width).toBe('200px')
    expect(wrapper?.style.height).toBe('200px')
  })

  it('leaves the wheel and the card contents untouched', () => {
    // The wheel svg and the additional-colour sliders beside it are
    // still there — the change is containment only.
    expect(colourCard()?.querySelector('.color-wheel svg')).not.toBeNull()
    expect(container?.querySelector('[data-testid="additional-colour-grid"]')).not.toBeNull()
    act(() => { MockResizeObserver.instances[0].fire(543) })
    expect(colourCard()?.querySelector('.color-wheel svg')).not.toBeNull()
    expect(container?.querySelector('[data-testid="additional-colour-grid"]')).not.toBeNull()
  })
})
