// Jake, 22 Nov 2026 — Live pads lift palette presets, and a dimmer
// alone raises the default colour (LightKey behaviour):
//   A. A Live Full On pad lifts an active palette Red preset — the
//      presets layer resolves against the effective levels, which now
//      include the pressed pads (effectiveIntensityLevels' liveLevels).
//      Clear Overrides does NOT release the palette presets (Jake's
//      22 Nov 2026 correction): it clears only the manual Design
//      overrides; a switched-on preset stays on.
//   B. A dimmer alone on a virtual-dimmer fixture (Q12BT, no intensity
//      channel) brings up its default blue: the base look (defaults
//      patch / cue patch) resolves against the same effective levels,
//      and the base is re-sent whenever an intensity source changes
//      (preset toggle, Live press; manual-override changes re-send it
//      via the App effect).
// The composed-frame checks live in livePresetLift.test.tsx (whole
// App); this file locks the units the App behaviour stands on.
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { getCurrentPatch } from '../src/renderer/src/lib/output'
import { effectiveIntensityLevels } from '../src/renderer/src/lib/effectiveIntensity'
import { completePresetBaseColour } from '../src/renderer/src/lib/presetColor'

// The base look now fades over the global Default fade instead of
// snapping (Jake, 24 Nov 2026), so a test asserting the settled base
// must run the pending animation frames to the end of the fade first.
const frames: Array<FrameRequestCallback | null> = []
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = null })

/** Run every pending frame with a time past the end of the fade. */
function finishFade() {
  const t = performance.now() + 2000
  let tick: FrameRequestCallback | undefined
  while (frames.length) {
    tick = frames.pop() ?? undefined
    if (tick) tick(t)
  }
}

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// p1: a par with a hardware dimmer (ch1 intensity, ch2 red, ch3 green,
// ch4 blue). q1: a Q12BT — rgba-4ch, ch20 red, ch21 green, ch22 blue,
// ch23 amber, NO intensity channel, so its dimmer is virtual.
const FIXTURES = [
  { id: 'p1', name: 'Par 1', type: 'par', channelStart: 1, channels: 4 },
  { id: 'q1', name: 'Q12BT 1', type: 'rgba-4ch', channelStart: 20, channels: 4 }
]
const RED = { id: 'red', name: 'Red', fixtureValues: { p1: { red: 255 }, q1: { red: 255 } } }
const FULL = { id: 'full', name: 'Full On', fixtureValues: { p1: { intensity: 255 }, q1: { intensity: 255 } } }

function seedShow() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: FIXTURES,
    fixtureGroups: [],
    presets: [RED, FULL],
    livePages: [{ id: 'page1', name: 'Page', fadeMs: 0, controls: [
      { id: 'pad-red', name: 'Red', type: 'push', presetIds: ['red'] },
      { id: 'pad-full', name: 'Full On', type: 'push', presetIds: ['full'] }
    ] }]
  }))
  act(() => {
    useShowStore.setState({
      presets: [RED, FULL],
      selectedFixtureIds: ['p1', 'q1'],
      activePresetIds: [],
      activeLiveValues: {},
      liveActivationOrder: {},
      liveActivationCounter: 0,
      manualOverrides: {},
      activeCueRef: null
    })
  })
  // The base is sent on show open; make the starting frame explicit.
  useShowStore.getState().refreshBaseOutput()
}

describe('effectiveIntensityLevels with live levels', () => {
  it('a pressed Live pad wins over a preset and an override', () => {
    const levels = effectiveIntensityLevels({
      cueValues: {},
      activePresetIds: ['full'],
      presets: [FULL],
      manualOverrides: { q1: { intensity: 128 } },
      liveLevels: { q1: 200 }
    })
    expect(levels.q1).toBe(200)
  })

  it('without live levels the cue/preset/override order is unchanged', () => {
    const levels = effectiveIntensityLevels({
      cueValues: { q1: { intensity: 10 } },
      activePresetIds: ['full'],
      presets: [FULL],
      manualOverrides: { q1: { intensity: 128 } }
    })
    expect(levels.q1).toBe(128)
  })
})

describe('completePresetBaseColour', () => {
  const fixtures = [
    { id: 'p1', name: 'Par 1', type: 'par', channelStart: 1, channels: 4 },
    { id: 'q1', name: 'Q12BT 1', type: 'rgba-4ch', channelStart: 20, channels: 4 }
  ] as Parameters<typeof completePresetBaseColour>[1]

  it('a Red preset names the whole base colour (green/blue become 0)', () => {
    const completed = completePresetBaseColour({ p1: { red: 255 }, q1: { red: 255 } }, fixtures)
    expect(completed.p1).toEqual({ red: 255, green: 0, blue: 0 })
    expect(completed.q1).toEqual({ red: 255, green: 0, blue: 0 })
  })

  it('a dimmer-only preset is untouched (no base colour named)', () => {
    const completed = completePresetBaseColour({ p1: { intensity: 255 }, q1: { intensity: 255 } }, fixtures)
    expect(completed.p1).toEqual({ intensity: 255 })
    expect(completed.q1).toEqual({ intensity: 255 })
  })

  it('a white-only preset does not fill the base colour (separate LED)', () => {
    const completed = completePresetBaseColour({ q1: { white: 200 } }, fixtures)
    expect(completed.q1).toEqual({ white: 200 })
  })

  it('a mixed red + white preset fills only the base colour', () => {
    const completed = completePresetBaseColour({ q1: { red: 255, white: 128 } }, fixtures)
    expect(completed.q1).toEqual({ red: 255, white: 128, green: 0, blue: 0 })
  })
})

describe('Clear Overrides keeps live palette presets', () => {
  beforeEach(() => seedShow())

  it('clearManualOverrides clears the manual overrides but leaves the active presets on', () => {
    act(() => {
      useShowStore.getState().togglePreset('red')
      useShowStore.setState({ manualOverrides: { p1: { red: 100 } } })
    })
    expect(useShowStore.getState().activePresetIds).toContain('red')
    act(() => { useShowStore.getState().clearManualOverrides() })
    expect(useShowStore.getState().manualOverrides).toEqual({})
    expect(useShowStore.getState().activePresetIds).toEqual(['red'])
  })

  it('clearing with only a preset active leaves the preset untouched', () => {
    act(() => { useShowStore.getState().togglePreset('red') })
    act(() => { useShowStore.getState().clearManualOverrides() })
    expect(useShowStore.getState().activePresetIds).toEqual(['red'])
    expect(useShowStore.getState().manualOverrides).toEqual({})
  })
})

describe('cue layer base-colour completion', () => {
  beforeEach(() => seedShow())

  it('a cue referencing a Red-only preset sends pure red (no blue leak)', () => {
    // Old-style preset in the file: colour only, no zeros — the cue
    // layer must complete it, the way the presets layer already does
    // (Jake, 22 Nov 2026). The Full On preset is active so the dimmer
    // is up; without the completion the zero-missing fill restores the
    // default blue under the red and the Q fixture comes out magenta.
    act(() => {
      const base = useShowStore.getState().show!
      const cue = { id: 'cue-red', name: 'Red Cue', presetIds: ['red'], fixtureValues: {}, fadeMs: 0 }
      const page = base.livePages![0]
      useShowStore.setState({
        show: { ...base, livePages: [{ ...page, controls: [...page.controls, { id: 'btn-red', name: 'Red Cue', type: 'push', cue, presetIds: [] }] }] },
        activePresetIds: ['full']
      })
    })
    act(() => { useShowStore.getState().activateCue('cue-red') })
    const patch = getCurrentPatch()
    expect(patch[20]).toBe(255) // q1 red
    expect(patch[21]).toBe(0) // q1 green
    expect(patch[22]).toBe(0) // q1 blue
    expect(patch[23]).toBe(0) // q1 amber — never written, stays 0
    expect(patch[2]).toBe(255) // p1 red
    expect(patch[4]).toBe(0) // p1 blue
  })
})

describe('base look tracks intensity sources', () => {
  beforeEach(() => seedShow())

  it('a palette dimmer preset alone raises the default blue on the Q fixture', () => {
    act(() => { useShowStore.getState().togglePreset('full') })
    // The lift fades in over the global Default fade (Jake, 24 Nov
    // 2026) — it is at full only once the fade has landed.
    finishFade()
    const base = getCurrentPatch()
    expect(base[22]).toBe(255) // q1 blue
    expect(base[20]).toBe(0) // q1 red stays off
    expect(base[4]).toBe(255) // p1 blue
    expect(base[1]).toBe(255) // p1 intensity channel
  })

  it('toggling the dimmer preset off drops the default blue again', () => {
    act(() => { useShowStore.getState().togglePreset('full') })
    finishFade()
    expect(getCurrentPatch()[22]).toBe(255)
    act(() => { useShowStore.getState().togglePreset('full') })
    finishFade()
    expect(getCurrentPatch()[22]).toBe(0)
    // p1's blue channel stays 255 in the base patch — a hardware
    // fixture carries its colour unscaled and dims in hardware — but
    // its intensity channel drops, so the fixture itself goes dark.
    expect(getCurrentPatch()[1]).toBe(0)
  })

  it('a Live dimmer pad alone raises the default blue, and releasing it drops it', () => {
    act(() => { useShowStore.getState().setLiveValue('pad-full', 255) })
    const base = getCurrentPatch()
    expect(base[22]).toBe(255) // q1 blue
    expect(base[4]).toBe(255) // p1 blue
    expect(base[1]).toBe(255) // p1 intensity channel
    act(() => { useShowStore.getState().setLiveValue('pad-full', 0) })
    expect(getCurrentPatch()[22]).toBe(0)
    // See above: p1's blue channel stays 255 in the base patch; its
    // intensity channel is what drops.
    expect(getCurrentPatch()[1]).toBe(0)
  })

  it('a colour preset alone does not raise anything (no dimmer source)', () => {
    act(() => { useShowStore.getState().togglePreset('red') })
    expect(getCurrentPatch()[20]).toBe(0)
    expect(getCurrentPatch()[22]).toBe(0)
  })
})
