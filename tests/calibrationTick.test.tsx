// Calibration checkmark visibility (Jake's LightKey test 25 Nov 2026):
// after setting the beam direction on FS2 (a static dimmer) and after
// full calibration of MH3 (a moving head), LightKey shows NO tick under
// the fixture in the normal Preview — edit view or Live view. The tick
// appears only in the setup wizard's directions step (Guide Step 6, p.36).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { StagePreview } from '../src/renderer/src/components/StagePreview'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { FixtureDef } from '../src/shared/types'
import type { WizardStep } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

const RECT = { left: 0, top: 0, width: 800, height: 340, right: 800, bottom: 340, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => {
    rootNode.render(node)
  })
  return el
}

afterEach(() => {
  if (rootNode) act(() => rootNode.unmount())
  rootNode = undefined
  if (container) container.remove()
  container = undefined
})

// A calibrated static dimmer (direction only) and a calibrated moving
// head (home direction + perspective), as Jake calibrated FS2 and MH3.
const dimmer: FixtureDef = { id: 'd1', name: 'D1', type: 'dimmer', channelStart: 1, channels: 1, calibration: { homeDirection: 180 } }
const head: FixtureDef = { id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 2, channels: 8, calibration: { homeDirection: 90, perspective: 'down' } }

function tickCount(el: Element): number {
  // The tick <text> also carries a <title> child, so match on the
  // title text rather than the element's full text content.
  return Array.from(el.querySelectorAll('title')).filter((t) => t.textContent === 'Beam direction calibrated').length
}

describe('calibration checkmark', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.getBoundingClientRect = function () {
      return RECT as DOMRect
    }
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      setChannels: () => {},
      getChannels: async () => new Array(512).fill(0)
    }
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
  })

  async function renderShow(setupWizardStep: WizardStep | null, previewEditing = false) {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    act(() => {
      useShowStore.setState({
        show: { ...base, id: 'test-show', fixtures: [dimmer, head], cues: [] },
        cues: [],
        presets: [],
        selectedFixtureIds: [],
        activeCueId: null,
        editingPresetId: null,
        editingCueAdHocId: null,
        manualOverrides: {},
        showOverrideLabels: false,
        previewEditing,
        setupWizardStep
      })
    })
    const el = renderInRoot(<StagePreview />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    return el
  }

  it('normal Preview shows no tick for a calibrated static dimmer or moving head', async () => {
    const el = await renderShow(null)
    expect(tickCount(el)).toBe(0)
  })

  it('normal Preview in edit mode shows no tick either', async () => {
    const el = await renderShow(null, true)
    expect(tickCount(el)).toBe(0)
  })

  it('wizard directions step still shows the tick for both calibrated fixtures', async () => {
    const el = await renderShow('directions')
    expect(tickCount(el)).toBe(2)
  })
})
