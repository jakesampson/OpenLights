// Fixture icons in the Preview (LightKey Guide p.32): each fixture
// type draws a distinct shape, filled with its live colour while on
// and dark while off; the selection indicator follows the shape.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { FixtureIcon } from '../src/renderer/src/components/FixtureIcon'
import type { FixtureIconKind } from '../src/renderer/src/lib/fixtureIcon'
import { StagePreview } from '../src/renderer/src/components/StagePreview'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { FixtureDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

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

function renderIcon(kind: FixtureIconKind, props: Partial<{ on: boolean; color: string; selected: boolean; cells: number }> = {}) {
  const el = renderInRoot(
    <svg>
      <FixtureIcon kind={kind} x={100} y={100} on={props.on ?? true} color={props.color ?? '#ff0000'} selected={props.selected ?? false} cells={props.cells} />
    </svg>
  )
  return el.querySelector('svg')!
}

describe('FixtureIcon', () => {
  it('PAR draws a lens circle with a hot centre while on', () => {
    const svg = renderIcon('par')
    expect(svg.querySelector('circle[r="5.5"]')?.getAttribute('fill')).toBe('#ff0000')
    expect(svg.querySelector('circle[r="2.6"]')).not.toBeNull()
  })

  it('wash draws a dotted-lens circle — seven dots inside the lens', () => {
    const svg = renderIcon('wash')
    expect(svg.querySelectorAll('circle[r="0.85"]')).toHaveLength(7)
  })

  it('moving head draws a three-blade pinwheel', () => {
    const svg = renderIcon('moving-head')
    expect(svg.querySelectorAll('path')).toHaveLength(3)
  })

  it('bulb draws a single small plain circle', () => {
    const svg = renderIcon('bulb')
    expect(svg.querySelector('circle[r="4"]')?.getAttribute('fill')).toBe('#ff0000')
    expect(svg.querySelectorAll('circle')).toHaveLength(1)
  })

  it('generic draws a rounded square', () => {
    const svg = renderIcon('generic')
    const rect = svg.querySelector('rect')
    expect(rect?.getAttribute('width')).toBe('9')
    expect(rect?.getAttribute('fill')).toBe('#ff0000')
  })

  it('panel draws a cell-divided rectangle', () => {
    const svg = renderIcon('panel')
    expect(svg.querySelector('rect')?.getAttribute('width')).toBe('11')
    expect(svg.querySelectorAll('line')).toHaveLength(3) // tick + two grid lines
  })

  it('strobe draws a wide plain rectangle', () => {
    const svg = renderIcon('strobe')
    expect(svg.querySelector('rect')?.getAttribute('width')).toBe('12')
  })

  it('blinder draws a dark housing with two coloured lenses', () => {
    const svg = renderIcon('blinder')
    const lenses = svg.querySelectorAll('circle[r="1.8"]')
    expect(lenses).toHaveLength(2)
    expect(lenses[0].getAttribute('fill')).toBe('#ff0000')
  })

  it('fog draws a dark square with a cloud glyph', () => {
    const svg = renderIcon('fog')
    expect(svg.querySelector('rect')).not.toBeNull()
    expect(svg.querySelectorAll('circle[r="1.6"]')).toHaveLength(1)
  })

  it('switch draws a dark square with a power mark', () => {
    const svg = renderIcon('switch')
    expect(svg.querySelector('rect')).not.toBeNull()
    expect(svg.querySelectorAll('line')).toHaveLength(2) // tick + power mark
  })

  it('LED matrix draws a dotted grid square', () => {
    const svg = renderIcon('led-matrix')
    expect(svg.querySelectorAll('circle[r="0.8"]')).toHaveLength(9)
  })

  it('LED strip (open) draws a wavy line in the fixture colour', () => {
    const svg = renderIcon('led-strip-open')
    const path = svg.querySelector('path')
    expect(path?.getAttribute('stroke')).toBe('#ff0000')
    expect(path?.getAttribute('fill')).toBe('none')
  })

  it('LED strip (closed) draws a dotted ring', () => {
    const svg = renderIcon('led-strip-closed')
    expect(svg.querySelector('circle[r="6.5"]')).not.toBeNull()
    expect(svg.querySelectorAll('circle[r="0.7"]')).toHaveLength(8)
  })

  it('LED bar with two or more cells draws nothing here — its housing lives with the cell rects', () => {
    const svg = renderIcon('led-bar', { cells: 4 })
    expect(svg.querySelectorAll('circle')).toHaveLength(0)
    expect(svg.querySelectorAll('rect')).toHaveLength(0)
    expect(svg.querySelectorAll('line')).toHaveLength(1) // the tick only
  })

  it('LED bar with one cell draws a small bar', () => {
    const svg = renderIcon('led-bar', { cells: 1 })
    expect(svg.querySelector('rect')?.getAttribute('width')).toBe('14')
  })

  it('off fixtures go dark and lose their hot centre', () => {
    const svg = renderIcon('par', { on: false })
    expect(svg.querySelector('circle[r="5.5"]')?.getAttribute('fill')).toBe('var(--panel2)')
    expect(svg.querySelector('circle[r="2.6"]')).toBeNull()
  })

  it('selected round icons get a circular ring, rectangular icons a rounded-rect ring', () => {
    expect(renderIcon('par', { selected: true }).querySelector('circle[r="9"]')).not.toBeNull()
    const panel = renderIcon('panel', { selected: true })
    expect(panel.querySelector('circle[r="9"]')).toBeNull()
    expect(panel.querySelector('rect[rx="3"]')).not.toBeNull()
  })
})

// --- StagePreview integration: a show with one fixture of each kind ---

const RECT = { left: 0, top: 0, width: 800, height: 340, right: 800, bottom: 340, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

let channels: number[] = []

const par: FixtureDef = { id: 'par1', name: 'P1', type: 'par', channelStart: 1, channels: 3 }
const wash: FixtureDef = { id: 'wash1', name: 'W1', type: 'led-wash', channelStart: 4, channels: 7 }
const head: FixtureDef = { id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 11, channels: 8 }
const dimmer: FixtureDef = { id: 'd1', name: 'D1', type: 'dimmer', channelStart: 19, channels: 1 }
const bar: FixtureDef = { id: 'bar1', name: 'B1', type: 'pixel-bar-17ch', channelStart: 20, channels: 17 }
const q: FixtureDef = { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 37, channels: 4 }

function fixtureGroup(el: Element, name: string) {
  const group = el.querySelector(`g[aria-label="${name}"]`)
  if (!group) throw new Error(`no fixture group for ${name}`)
  return group
}

describe('StagePreview fixture icons', () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.getBoundingClientRect = function () {
      return RECT as DOMRect
    }
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      setChannels: () => {},
      getChannels: async () => [...channels]
    }
    // The stubbed live DMX frame, all fixtures lit: PAR red, wash at
    // full with red, moving head at full with blue, dimmer at full,
    // the bar's cells and globals at full, Q12BT red.
    channels = new Array(512).fill(0)
    channels[0] = 255
    channels[3] = 255; channels[4] = 255
    channels[10] = 255; channels[13] = 255
    channels[18] = 255
    for (let i = 19; i <= 35; i++) channels[i] = 255
    channels[36] = 255
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
    channels = []
  })

  async function renderShow(selectedFixtureIds: string[] = []) {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const show = {
      ...base,
      id: 'test-show',
      fixtures: [par, wash, head, dimmer, bar, q],
      cues: [
        {
          id: 'c1',
          name: 'Cue 1',
          fixtureValues: {
            par1: { red: 255, green: 0, blue: 0 },
            wash1: { intensity: 255, red: 255, green: 128, blue: 0, white: 0, amber: 0, uv: 0 },
            mh1: { intensity: 255, red: 0, green: 0, blue: 255 },
            d1: { intensity: 255 },
            bar1: { intensity: 255, red: 255, green: 255, blue: 255 },
            q1: { red: 255, green: 0, blue: 0, amber: 0 }
          },
          fadeMs: 0
        }
      ]
    }
    act(() => {
      useShowStore.setState({
        show,
        cues: show.cues,
        presets: [],
        selectedFixtureIds,
        activeCueId: 'c1',
        editingPresetId: null,
        editingCueAdHocId: null,
        manualOverrides: {},
        showOverrideLabels: false,
        previewEditing: false
      })
    })
    const el = renderInRoot(<StagePreview />)
    // Let the mount-time output poll read the stubbed frame.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    return el
  }

  it('each fixture type draws its own icon shape', async () => {
    const el = await renderShow()
    // PAR: lens circle; wash: dotted lens; moving head: pinwheel paths.
    expect(fixtureGroup(el, 'P1').querySelector('circle[r="5.5"]')).not.toBeNull()
    expect(fixtureGroup(el, 'P1').querySelector('circle[r="2.6"]')).not.toBeNull()
    expect(fixtureGroup(el, 'W1').querySelectorAll('circle[r="0.85"]')).toHaveLength(7)
    expect(fixtureGroup(el, 'MH1').querySelectorAll('path')).toHaveLength(3)
    // Dimmer: small plain bulb; Q12BT (rgba-4ch): wash dotted lens.
    expect(fixtureGroup(el, 'D1').querySelector('circle[r="4"]')).not.toBeNull()
    expect(fixtureGroup(el, 'Q1').querySelectorAll('circle[r="0.85"]')).toHaveLength(7)
  })

  it('the LED bar draws a housing spanning its four cells', async () => {
    const el = await renderShow()
    const group = fixtureGroup(el, 'B1')
    // Four cells at 9 apart: housing is (4-1)*9+11 = 38 wide, 10 tall.
    const housing = group.querySelector('rect[width="38"]')
    expect(housing).not.toBeNull()
    expect(housing?.getAttribute('height')).toBe('10')
    // The four cell rects sit on top of the housing.
    expect(group.querySelectorAll('rect[width="7"]')).toHaveLength(4)
  })

  it('selected fixtures keep their selection ring, shaped to the icon', async () => {
    const el = await renderShow(['par1', 'bar1'])
    expect(fixtureGroup(el, 'P1').querySelector('circle[r="9"]')).not.toBeNull()
    // The bar's selection surround is drawn with its housing, not as a circle.
    expect(fixtureGroup(el, 'B1').querySelector('circle[r="9"]')).toBeNull()
    expect(fixtureGroup(el, 'B1').querySelector('rect[rx="3"]')).not.toBeNull()
  })
})
