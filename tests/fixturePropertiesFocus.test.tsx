// @vitest-environment jsdom
// Keyboard dead after a spinner click in Fixture Properties (Jake,
// 20 Nov 2026): clicking an up/down arrow on a number input left focus
// outside any input, so keys went to the app's shortcuts instead of
// typing. The panel's number inputs now force focus into the field on
// click and on release (see PreviewEditPanel focusNumberInput).
// Honest caveat: jsdom has no native spinner / shadow DOM, so the
// Chromium trigger itself cannot be reproduced here — this test locks
// in the outcome instead: a click focuses the input, a store-write
// re-render keeps it focused, and typing after the click updates the
// value. Jake's Mac is the real check for the spinner's own focus
// behaviour.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { PreviewEditPanel } from '../src/renderer/src/components/PreviewEditPanel'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'

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

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  root = undefined
  container?.remove()
  container = undefined
})

function seedPanel() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }],
    cues: []
  }))
  useShowStore.setState({ selectedFixtureIds: ['a'], previewEditing: true })
  renderInRoot(<PreviewEditPanel />)
  const input = container?.querySelector('[aria-label="Fixture minDimmer"]') as HTMLInputElement | null
  if (!input) throw new Error('no minDimmer input in the rendered panel')
  return input
}

describe('Fixture Properties spinner focus', () => {
  it('clicking a number input focuses it, and a store-write step keeps it focused', () => {
    const input = seedPanel()
    act(() => { input.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(document.activeElement).toBe(input)
    // A spinner step: the value changes, the store writes, the panel
    // re-renders — focus must stay in the field so the next key types.
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, '100')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
      input.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
    })
    expect(document.activeElement).toBe(input)
    expect(useShowStore.getState().show?.fixtures.find((f) => f.id === 'a')?.minDimmer).toBe(100)
    expect(input.value).toBe('100')
  })

  it('typing after the click updates the value instead of going nowhere', () => {
    const input = seedPanel()
    act(() => { input.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, '120')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    expect(useShowStore.getState().show?.fixtures.find((f) => f.id === 'a')?.minDimmer).toBe(120)
  })

  it('every number input in the panel carries the focus handlers', () => {
    const source = readFileSync('src/renderer/src/components/PreviewEditPanel.tsx', 'utf8')
    // Beam angle, icon size / rotation, min / max dimmer, truss inputs.
    expect(source.match(/onClick=\{focusNumberInput\}/g)).toHaveLength(4)
    expect(source.match(/onMouseUp=\{focusNumberInput\}/g)).toHaveLength(4)
  })
})
