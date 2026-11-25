// @vitest-environment jsdom
// Keyboard dead after a spinner click in Fixture Options (Jake,
// 20 Nov 2026): clicking an up/down arrow on a number input left focus
// outside any input, so keys went to the app's shortcuts instead of
// typing. The dialog's number inputs now force focus into the field on
// click and on release (see FixtureOptionsDialog focusNumberInput), as
// the Inspector's own number inputs do (see PreviewEditPanel).
// Honest caveat: jsdom has no native spinner / shadow DOM, so the
// Chromium trigger itself cannot be reproduced here — this test locks
// in the outcome instead: a click focuses the input, typing after the
// click updates the value, and Done writes it to the store. Jake's Mac
// is the real check for the spinner's own focus behaviour.
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

function seedDialog() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }],
    cues: []
  }))
  useShowStore.setState({ selectedFixtureIds: ['a'], previewEditing: true })
  renderInRoot(<PreviewEditPanel />)
  const button = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Fixture Options…')
  if (!button) throw new Error('no Fixture Options button in the rendered panel')
  act(() => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  const input = container?.querySelector('[aria-label="Minimum dimmer"]') as HTMLInputElement | null
  if (!input) throw new Error('no Minimum dimmer input in the rendered dialog')
  return input
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

function clickDone() {
  const done = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent === 'Done')
  if (!done) throw new Error('no Done button in the rendered dialog')
  act(() => { done.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

describe('Fixture Options spinner focus', () => {
  it('clicking a number input focuses it, and Done writes the typed value to the store', () => {
    const input = seedDialog()
    act(() => { input.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(document.activeElement).toBe(input)
    act(() => { typeInto(input, '100'); input.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true })) })
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('100')
    clickDone()
    expect(useShowStore.getState().show?.fixtures.find((f) => f.id === 'a')?.minDimmer).toBe(100)
  })

  it('typing after the click updates the value instead of going nowhere', () => {
    const input = seedDialog()
    act(() => { input.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    act(() => { typeInto(input, '120') })
    expect(input.value).toBe('120')
    clickDone()
    expect(useShowStore.getState().show?.fixtures.find((f) => f.id === 'a')?.minDimmer).toBe(120)
  })

  it('every number input in the panel and the dialog carries the focus handlers', () => {
    const panel = readFileSync('src/renderer/src/components/PreviewEditPanel.tsx', 'utf8')
    // The truss grid renders one input element in source.
    expect(panel.match(/onClick=\{focusNumberInput\}/g)).toHaveLength(1)
    expect(panel.match(/onMouseUp=\{focusNumberInput\}/g)).toHaveLength(1)
    const dialog = readFileSync('src/renderer/src/components/FixtureOptionsDialog.tsx', 'utf8')
    // Beam angle, min dimmer, max dimmer.
    expect(dialog.match(/onClick=\{focusNumberInput\}/g)).toHaveLength(3)
    expect(dialog.match(/onMouseUp=\{focusNumberInput\}/g)).toHaveLength(3)
  })
})
