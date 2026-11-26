// Jake, 27 Nov 2026 — the effect editor showed no fixture membership
// and offered no way to add or remove fixtures. The Fixtures section
// lists the members, removes one at a time, and adds fixtures from a
// dropdown or from the Preview's current selection. Removing the last
// fixture is allowed: the effect then runs on nothing.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { EffectDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

const FIXTURES = [
  { id: 'fx1', name: 'Wash One', type: 'led-wash', channelStart: 1, channels: 7 },
  { id: 'fx2', name: 'Wash Two', type: 'led-wash', channelStart: 8, channels: 7 },
  { id: 'fx3', name: 'Dimmer One', type: 'dimmer', channelStart: 15, channels: 1 },
]

function kittEffect(): EffectDef {
  return {
    id: 'e-kitt', name: 'K.I.T.T.', fixtureIds: ['fx1'], attribute: 'color',
    waveform: 'sine', speed: 1, syncToBpm: false, size: 255, offset: 128,
    phaseSpread: 0, enabled: true, kind: 'pattern', pattern: 'scanner',
    samples: [{ id: 'bg', color: '#000000' }, { id: 'fg', color: '#ff0000' }],
    durationMs: 2000, timingMode: 'fixed',
  }
}

function setShow() {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show = { ...base, id: 'test-show', effectTemplates: [], fixtures: FIXTURES, cues: [] }
  act(() => {
    useShowStore.setState({
      show, cues: [], presets: [], effects: [kittEffect()],
      selectedFixtureIds: [], activeCueId: null,
      editingPresetId: null, editingCueAdHocId: null, manualOverrides: {},
      showOverrideLabels: false, editingEffectId: 'e-kitt',
      editingEffectTemplateId: null, editingLiveEffectId: null,
      effectChooserAttribute: null,
    })
  })
}

const s = () => useShowStore.getState()
const click = (target: Element) => {
  act(() => { target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) })
}
function section() {
  const el = container?.querySelector('[aria-label="Effect fixtures"]')
  if (!el) throw new Error('no Fixtures section')
  return el
}
function setSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
  act(() => {
    setter.call(select, value)
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}

describe('effect fixture membership (Jake, 27 Nov 2026)', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    setShow()
    renderInRoot(<DesignTab />)
  })

  afterEach(() => {
    act(() => { rootNode?.unmount() })
    container?.remove()
    container = undefined
    rootNode = undefined
  })

  it('lists the effect’s fixtures', () => {
    const members = section().querySelector('ul')?.textContent ?? ''
    expect(members).toContain('Wash One')
    expect(members).not.toContain('Wash Two')
    expect(members).not.toContain('Dimmer One')
  })

  it('removes a fixture, and removing the last leaves the effect running on nothing', () => {
    click(section().querySelector('[aria-label="Remove Wash One from effect"]')!)
    expect(s().effects.find((e) => e.id === 'e-kitt')?.fixtureIds).toEqual([])
    expect(section().textContent).toContain('No fixtures — this effect runs on nothing.')
  })

  it('adds a fixture from the dropdown', () => {
    const select = section().querySelector('select[aria-label="Add fixture to effect"]') as HTMLSelectElement
    setSelect(select, 'fx2')
    click(section().querySelector('button.btn-theme')!)
    expect(s().effects.find((e) => e.id === 'e-kitt')?.fixtureIds).toEqual(['fx1', 'fx2'])
    expect(section().textContent).toContain('Wash Two')
  })

  it('adds the Preview selection with Add selected', () => {
    act(() => { s().selectFixtures(['fx2', 'fx3']) })
    const addSelected = Array.from(section().querySelectorAll('button')).find((b) => b.textContent === 'Add selected')
    if (!addSelected) throw new Error('no Add selected button')
    click(addSelected)
    expect(s().effects.find((e) => e.id === 'e-kitt')?.fixtureIds).toEqual(['fx1', 'fx2', 'fx3'])
  })
})
