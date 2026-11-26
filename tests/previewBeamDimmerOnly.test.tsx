// Preview beam length follows the dimmer only, not the colour
// (Jake, 24 Nov 2026): during a colour-only transition the beam
// shrinks and re-grows; it should stay the same length and only
// change colour. The beam should only shrink when a dimmer change
// has been called. The dip is a virtual-dimmer problem: a Q12BT
// (rgba-4ch) has no intensity channel, so the Preview used the max
// colour channel as its brightness — and a linear red→blue crossfade
// passes through purple at half height (max 128), halving the beam
// mid-transition. A real-dimmer fixture reads its intensity channel
// and never dipped. The fix is a display dimmer the output engine
// tracks per fixture (the endpoint brightness of each base look,
// interpolated through the fade), which the Preview reads for
// fixtures with no intensity channel.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { StagePreview } from '../src/renderer/src/components/StagePreview'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { configureEffects, configurePresetOutput, sendImmediate } from '../src/renderer/src/lib/output'
import type { FixtureDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECT = { left: 0, top: 0, width: 800, height: 340, right: 800, bottom: 340, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

let container: HTMLDivElement | undefined
let rootNode: Root | undefined
let channels: number[] = []

// Q1 is a virtual-dimmer fixture (rgba-4ch: R/G/B/amber, no intensity
// channel). W1 is a real-dimmer control (led-wash: intensity first).
const q1: FixtureDef = { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 1, channels: 4 }
const w1: FixtureDef = { id: 'w1', name: 'W1', type: 'led-wash', channelStart: 5, channels: 7 }

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
  const show = {
    ...base,
    id: 'test-show',
    fixtures: [q1, w1],
    cues: [{ id: 'c1', name: 'Cue 1', fixtureValues: {
      q1: { intensity: 255, red: 255, green: 0, blue: 0, amber: 0 },
      w1: { intensity: 255, red: 255, green: 0, blue: 0, white: 0, amber: 0, uv: 0 }
    }, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({ show, cues: show.cues, presets: [], selectedFixtureIds: [], activeCueId: 'c1', editingPresetId: null, editingCueAdHocId: null, manualOverrides: {}, showOverrideLabels: false, previewEditing: false })
  })
}

async function renderPreview() {
  setShow()
  renderInRoot(<StagePreview />)
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

function labelFor(name: string) {
  const texts = [...(container?.querySelectorAll('text') ?? [])]
  const found = texts.find((t) => t.textContent === name)
  if (!found) throw new Error(`no label for ${name}`)
  return found as unknown as HTMLElement
}

function beamFor(name: string) {
  const label = labelFor(name)
  const group = label.closest('g')
  const polygon = group?.querySelector('polygon')
  if (!polygon) throw new Error(`no beam polygon for ${name}`)
  return polygon as unknown as HTMLElement
}

function beamGeometry(polygon: HTMLElement) {
  const points = (polygon.getAttribute('points') ?? '').split(' ').map((pair) => pair.split(',').map(Number))
  const ys = points.map(([, y]) => y)
  return { length: Math.max(...ys) - Math.min(...ys) }
}

function beamFill(polygon: HTMLElement) {
  const fill = polygon.getAttribute('fill') ?? ''
  // The beam is a soft glow now (Jake, 26 Nov 2026): the polygon's
  // fill is a per-beam gradient, so the colour lives on its stops.
  const match = fill.match(/^url\(#(.+)\)$/)
  if (match) {
    const gradient = container?.querySelector(`#${CSS.escape(match[1])}`)
    const stop = gradient?.querySelector('stop')
    return stop?.getAttribute('stop-color') ?? ''
  }
  return fill
}

// The stubbed live DMX frame: Q1's four channels, then W1's seven.
// Only the heartbeat test below reads it — the Preview takes its
// frames from the output engine now (Jake, 26 Nov 2026), and the
// other tests drive the frame through the engine instead.
function setFrame(q: [number, number, number, number], w: [number, number, number, number, number, number, number] = [255, 255, 0, 0, 0, 0, 0]) {
  channels = new Array(512).fill(0)
  channels[0] = q[0]; channels[1] = q[1]; channels[2] = q[2]; channels[3] = q[3]
  channels[4] = w[0]; channels[5] = w[1]; channels[6] = w[2]; channels[7] = w[3]
  channels[8] = w[4]; channels[9] = w[5]; channels[10] = w[6]
}

// Push a mid-transition frame through the output engine, as a preset
// layer would: the frame carries the given colours, but the display
// dimmer stays at the base look's endpoint brightness — the presets
// layer is not one of the post-base layers updateDisplayLevels reads
// the frame for, so the beam length follows the base dimmer, not the
// frame max.
function setEngineFrame(q: [number, number, number, number], w: [number, number, number, number, number, number, number] = [255, 255, 0, 0, 0, 0, 0]) {
  configurePresetOutput({ 1: q[0], 2: q[1], 3: q[2], 4: q[3], 5: w[0], 6: w[1], 7: w[2], 8: w[3], 9: w[4], 10: w[5], 11: w[6] })
}

// Tell the output engine the base look's endpoint brightness, as a
// cue send would: a patch with the fixture's channels at the look's
// values. Q1's brightness is the max colour channel (no dimmer
// channel); W1's is its intensity channel.
function setBaseLevels(qBrightness: number, wBrightness = qBrightness) {
  configureEffects({ fixtures: [q1, w1], effects: [], movementPaths: [], bpm: 120, master: 255, blackout: false })
  sendImmediate({ 1: qBrightness, 2: 0, 3: 0, 4: 0, 5: wBrightness, 6: qBrightness, 7: 0, 8: 0 })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.getBoundingClientRect = () => RECT as unknown as DOMRect
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    setChannels: () => {},
    getChannels: async () => [...channels]
  }
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
  // Leave the output engine with no levels, so the next test starts
  // from the DMX-only fallback unless it sets levels itself.
  configurePresetOutput({})
  sendImmediate({})
  configureEffects({ fixtures: [], effects: [] })
})

describe('beam length follows the dimmer, not the colour', () => {
  it('a colour-only mid-fade frame keeps the beam at full length on a virtual-dimmer fixture', async () => {
    // Midway through a red→blue crossfade at full dimmer: the DMX
    // frame is purple at half height on each channel. The old
    // derivation (max colour channel) read that as half brightness
    // and halved the beam; the display dimmer stays at full.
    setBaseLevels(255)
    setEngineFrame([128, 0, 128, 0])
    await renderPreview()
    expect(beamGeometry(beamFor('Q1')).length).toBeCloseTo(146, 5)
    expect(beamFill(beamFor('Q1'))).toBe('#800080')
  })

  it('a real-dimmer fixture never dipped, and still does not', async () => {
    setBaseLevels(255)
    setEngineFrame([128, 0, 128, 0], [255, 128, 0, 128, 0, 0, 0])
    await renderPreview()
    expect(beamGeometry(beamFor('W1')).length).toBeCloseTo(146, 5)
  })

  it('a dimmer change still shrinks the beam', async () => {
    setBaseLevels(128)
    setEngineFrame([128, 0, 0, 0])
    await renderPreview()
    expect(beamGeometry(beamFor('Q1')).length).toBeCloseTo(146 * (128 / 255), 5)
  })

  it('a combined colour+dimmer change follows the dimmer', async () => {
    // Red at full dimmer fading to blue at half dimmer: midway the
    // frame is (64, 0, 64) — half of half. The beam follows the
    // dimmer (half), not the frame max (quarter).
    setBaseLevels(128)
    setEngineFrame([64, 0, 64, 0])
    await renderPreview()
    expect(beamGeometry(beamFor('Q1')).length).toBeCloseTo(146 * (128 / 255), 5)
  })

  it('with no levels reported the Preview falls back to the frame max, as before', async () => {
    // The engine has not sent a base look yet (fresh load, live
    // window): the old derivation is the only signal available. The
    // frame here arrives over the IPC read — the local frame is stale
    // (the engine is not pushing in this window), so the Preview's
    // heartbeat falls back to getChannels after 500ms.
    configureEffects({ fixtures: [q1, w1], effects: [], movementPaths: [], bpm: 120, master: 255, blackout: false })
    setFrame([128, 0, 128, 0])
    await renderPreview()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)) })
    expect(beamGeometry(beamFor('Q1')).length).toBeCloseTo(146 * (128 / 255), 5)
  })
})
