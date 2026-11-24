// Cue recalls must fade instead of snapping (Jake, 24 Nov 2026):
// firing a cue (Go, number key, click) used to jump straight to the
// new look, because the manual-overrides effect re-asserted the base
// on every cue activation and its sendImmediate cancelled the fade
// the instant it started. Dimmer 0→100 must fade in smoothly,
// including on virtual-dimmer fixtures.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import type { ShowDef } from '../src/shared/types'

const engine = new DMXEngine()
const frames: Array<FrameRequestCallback | null> = []
vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = null })
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { configureEffects, getDisplayLevels, reassertBase, sendChannels, sendImmediate } from '../src/renderer/src/lib/output'

// Virtual-dimmer Q12BT (rgba-4ch, no intensity channel) at 1-4; a
// real-dimmer wash (led-wash, intensity first) at 5-11.
const fixtures = [
  { id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 1, channels: 4 },
  { id: 'w1', name: 'W1', type: 'led-wash', channelStart: 5, channels: 7 },
] as ShowDef['fixtures']
const darkValues = {
  q1: { intensity: 0, red: 0, green: 0, blue: 0 },
  w1: { intensity: 0, red: 0, green: 0, blue: 0 },
}
const litValues = {
  q1: { intensity: 255, red: 255, green: 0, blue: 0 },
  w1: { intensity: 255, red: 255, green: 0, blue: 0 },
}
const preferences = { defaultFadeMs: 1000, pageFadeMs: 500, theme: 'dark', dmxProtocol: 'open-dmx-usb' } as ShowDef['preferences']

function makeShow(overrides: Partial<ShowDef> = {}): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures,
    cues: [
      { id: 'dark', name: 'Dark', fadeMs: 1000, fixtureValues: darkValues },
      { id: 'lit', name: 'Lit', fadeMs: 1000, fixtureValues: litValues },
    ],
    automations: [],
    preferences,
    ...overrides,
  }
}

/** Run the latest scheduled frame once, at the given time. */
function step(time: number) {
  let tick: FrameRequestCallback | undefined
  while (frames.length) {
    tick = frames.pop() ?? undefined
    if (tick) break
  }
  if (tick) tick(time)
}

beforeEach(() => {
  frames.length = 0
  configureEffects({ fixtures })
  // Start every test from a known dark base.
  sendImmediate({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 })
  frames.length = 0
})

describe('cue recall fades', () => {
  it('a cue recall fades instead of snapping when the base is re-asserted mid-activation', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow())
    const t0 = performance.now()
    store.activateCue('lit')
    // This is the App manual-overrides effect: it re-asserts the base
    // on every cue activation, because effectiveLevels changed. Before
    // the fix its sendImmediate cancelled the fade here, so the rig
    // snapped to full the instant the cue fired.
    store.refreshBaseOutput()
    // Nothing has snapped: the fade only just started.
    expect(engine.getChannel(1)).toBe(0)
    expect(engine.getChannel(5)).toBe(0)
    // Halfway through the 1000 ms fade the rig is halfway there —
    // smoothstep(0.5) is 0.5, so both fixtures read about half.
    step(t0 + 500)
    expect(engine.getChannel(1)).toBeGreaterThan(90)
    expect(engine.getChannel(1)).toBeLessThan(170)
    expect(engine.getChannel(5)).toBeGreaterThan(90)
    expect(engine.getChannel(5)).toBeLessThan(170)
    // The fade lands.
    step(t0 + 1500)
    expect(engine.getChannel(1)).toBe(255)
    expect(engine.getChannel(5)).toBe(255)
    expect(engine.getChannel(6)).toBe(255)
  })

  it('a cue with no explicit fade time falls back to the global Default fade', () => {
    const show = makeShow({
      preferences: { ...preferences, defaultFadeMs: 2000 },
      cues: [
        { id: 'dark', name: 'Dark', fadeMs: 1000, fixtureValues: darkValues },
        // A cue from older data, with no fadeMs of its own.
        { id: 'lit', name: 'Lit', fixtureValues: litValues } as unknown as ShowDef['cues'][number],
      ],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    const t0 = performance.now()
    store.activateCue('lit')
    // A 2000 ms fade is only ~15% in at 500 ms (smoothstep 0.25),
    // and still not done at 1100 ms — a 1000 ms fade would be.
    step(t0 + 500)
    expect(engine.getChannel(1)).toBeGreaterThan(10)
    expect(engine.getChannel(1)).toBeLessThan(100)
    step(t0 + 1100)
    expect(engine.getChannel(1)).toBeLessThan(255)
    step(t0 + 2500)
    expect(engine.getChannel(1)).toBe(255)
  })

  it('a virtual-dimmer fixture fades its display dimmer with the channels', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow())
    const t0 = performance.now()
    store.activateCue('lit')
    store.refreshBaseOutput()
    step(t0 + 500)
    const levels = getDisplayLevels()
    // The Q fixture has no intensity channel — its beam length follows
    // the colour peak, which the fade interpolates like any channel.
    expect(levels.q1).toBeGreaterThan(90)
    expect(levels.q1).toBeLessThan(170)
    expect(levels.w1).toBeGreaterThan(90)
    expect(levels.w1).toBeLessThan(170)
    step(t0 + 1500)
    expect(getDisplayLevels().q1).toBe(255)
    expect(getDisplayLevels().w1).toBe(255)
  })

  it('a dimmer preset toggled on fades over the global Default fade', () => {
    // No active cue: the base is the defaults look (LightKey blue at
    // dimmer 0), so a dimmer preset has a default blue to lift — a cue
    // that explicitly zeroes blue would leave it nothing to raise.
    const show = makeShow({
      cues: [{ id: 'dark', name: 'Dark', fadeMs: 1000, fixtureValues: darkValues }],
      presets: [
        { id: 'full', name: '100%', fixtureValues: { q1: { intensity: 255 }, w1: { intensity: 255 } } },
      ] as ShowDef['presets'],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    expect(engine.getChannel(3)).toBe(0)
    const t0 = performance.now()
    store.togglePreset('full')
    // The preset carries no fade time of its own, so the dimmer change
    // fades over the global Default fade (1000 ms) instead of jumping.
    step(t0 + 500)
    expect(engine.getChannel(3)).toBeGreaterThan(90)
    expect(engine.getChannel(3)).toBeLessThan(170)
    expect(engine.getChannel(5)).toBeGreaterThan(90)
    expect(engine.getChannel(5)).toBeLessThan(170)
    step(t0 + 1500)
    expect(engine.getChannel(3)).toBe(255)
    expect(engine.getChannel(5)).toBe(255)
  })
})

describe('cue-list Go fades over the step time', () => {
  it('cueNext uses the step fadeMs, and a step without one uses the global default', () => {
    const show = makeShow({
      preferences: { ...preferences, defaultFadeMs: 3000 },
      cueLists: [
        {
          id: 'list', name: 'List', steps: [
            { id: 's1', cueId: 'dark', fadeMs: 0, holdMs: 0 },
            { id: 's2', cueId: 'lit', fadeMs: 2000, holdMs: 0 },
          ],
        },
      ],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    store.goToCue('list', 0)
    step(performance.now() + 100)
    expect(engine.getChannel(1)).toBe(0)
    const t0 = performance.now()
    store.cueNext()
    // The step's own 2000 ms wins over the 3000 ms global.
    step(t0 + 500)
    expect(engine.getChannel(1)).toBeGreaterThan(10)
    expect(engine.getChannel(1)).toBeLessThan(100)
    step(t0 + 1100)
    expect(engine.getChannel(1)).toBeLessThan(255)
    step(t0 + 2500)
    expect(engine.getChannel(1)).toBe(255)
  })

  it('a step with no explicit time falls back to the global default', () => {
    const show = makeShow({
      preferences: { ...preferences, defaultFadeMs: 2000 },
      cueLists: [
        {
          id: 'list', name: 'List', steps: [
            { id: 's1', cueId: 'dark', fadeMs: 0, holdMs: 0 },
            { id: 's2', cueId: 'lit', holdMs: 0 } as unknown as ShowDef['cueLists'][number]['steps'][number],
          ],
        },
      ],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    store.goToCue('list', 0)
    step(performance.now() + 100)
    const t0 = performance.now()
    store.cueNext()
    step(t0 + 500)
    expect(engine.getChannel(1)).toBeGreaterThan(10)
    expect(engine.getChannel(1)).toBeLessThan(100)
    step(t0 + 2500)
    expect(engine.getChannel(1)).toBe(255)
  })
})

describe('Live page fade and the base look', () => {
  it('a dimmer preset toggled on fades over the active page fade, not the global', () => {
    // No active cue: the base is the defaults look. The page carries
    // its own 3000 ms fade; the global Default fade is 1000 ms — the
    // lift must follow the page, so at 1500 ms it is only halfway.
    const show = makeShow({
      livePages: [{ id: 'page1', name: 'Page', fadeMs: 3000, controls: [] }],
      cues: [{ id: 'dark', name: 'Dark', fadeMs: 1000, fixtureValues: darkValues }],
      presets: [
        { id: 'full', name: '100%', fixtureValues: { q1: { intensity: 255 }, w1: { intensity: 255 } } },
      ] as ShowDef['presets'],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    const t0 = performance.now()
    store.togglePreset('full')
    step(t0 + 1500)
    expect(engine.getChannel(3)).toBeGreaterThan(90)
    expect(engine.getChannel(3)).toBeLessThan(170)
    step(t0 + 2500)
    expect(engine.getChannel(3)).toBeLessThan(255)
    step(t0 + 3500)
    expect(engine.getChannel(3)).toBe(255)
    expect(engine.getChannel(5)).toBe(255)
  })

  it('a Live Full On toggle lifts the default blue over the page fade', () => {
    // The pressed pad's lift lives in the base (the virtual-dimmer
    // fixture has no intensity channel for the pad to write), so the
    // base re-send after the press must fade over the page's 3000 ms,
    // matching the pad's own fade — not the 1000 ms global.
    const show = makeShow({
      livePages: [{
        id: 'page1', name: 'Page', fadeMs: 3000,
        controls: [{ id: 'pad-full', name: 'Full On', type: 'toggle', presetIds: ['full'] }],
      }],
      cues: [{ id: 'dark', name: 'Dark', fadeMs: 1000, fixtureValues: darkValues }],
      presets: [
        { id: 'full', name: '100%', fixtureValues: { q1: { intensity: 255 }, w1: { intensity: 255 } } },
      ] as ShowDef['presets'],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    const t0 = performance.now()
    store.setLiveValue('pad-full', 255)
    step(t0 + 1500)
    expect(engine.getChannel(3)).toBeGreaterThan(90)
    expect(engine.getChannel(3)).toBeLessThan(170)
    step(t0 + 2500)
    expect(engine.getChannel(3)).toBeLessThan(255)
    step(t0 + 3500)
    expect(engine.getChannel(3)).toBe(255)
  })

  it('a page with no fade time falls back to the global Default fade', () => {
    const show = makeShow({
      livePages: [{ id: 'page1', name: 'Page', controls: [] }],
      cues: [{ id: 'dark', name: 'Dark', fadeMs: 1000, fixtureValues: darkValues }],
      presets: [
        { id: 'full', name: '100%', fixtureValues: { q1: { intensity: 255 }, w1: { intensity: 255 } } },
      ] as ShowDef['presets'],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    const t0 = performance.now()
    store.togglePreset('full')
    step(t0 + 500)
    expect(engine.getChannel(3)).toBeGreaterThan(90)
    expect(engine.getChannel(3)).toBeLessThan(170)
    step(t0 + 1500)
    expect(engine.getChannel(3)).toBe(255)
  })
})

describe('the page fade never reaches a cue recall', () => {
  it('cueNext stays on the step time even on a page with its own fade', () => {
    // Deliberate scoping (fadeTimes.ts header): a cue-list recall is
    // not a page transition, so it consults the step/cue time and
    // then the global — the page fade never reaches it. The page
    // says 3000 ms and the global says 3000 ms; the step says 2000 ms.
    const show = makeShow({
      livePages: [{ id: 'page1', name: 'Page', fadeMs: 3000, controls: [] }],
      preferences: { ...preferences, defaultFadeMs: 3000 },
      cueLists: [
        {
          id: 'list', name: 'List', steps: [
            { id: 's1', cueId: 'dark', fadeMs: 0, holdMs: 0 },
            { id: 's2', cueId: 'lit', fadeMs: 2000, holdMs: 0 },
          ],
        },
      ],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    store.goToCue('list', 0)
    step(performance.now() + 100)
    const t0 = performance.now()
    store.cueNext()
    step(t0 + 1100)
    expect(engine.getChannel(1)).toBeLessThan(255)
    step(t0 + 2500)
    expect(engine.getChannel(1)).toBe(255)
  })

  it('a cue with no explicit time uses the global, not the page fade', () => {
    const show = makeShow({
      livePages: [{ id: 'page1', name: 'Page', fadeMs: 3000, controls: [] }],
      preferences: { ...preferences, defaultFadeMs: 1000 },
      cues: [
        { id: 'dark', name: 'Dark', fadeMs: 1000, fixtureValues: darkValues },
        { id: 'lit', name: 'Lit', fixtureValues: litValues } as unknown as ShowDef['cues'][number],
      ],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    const t0 = performance.now()
    store.activateCue('lit')
    step(t0 + 500)
    expect(engine.getChannel(1)).toBeGreaterThan(90)
    expect(engine.getChannel(1)).toBeLessThan(170)
    step(t0 + 1500)
    expect(engine.getChannel(1)).toBe(255)
  })
})

describe('reassertBase', () => {
  const dark = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 }
  const lit = { 1: 255, 2: 0, 3: 0, 4: 0, 5: 255, 6: 255, 7: 0, 8: 0 }

  it('leaves a fade alone when it is already heading to the same target', () => {
    sendImmediate(dark)
    const t0 = performance.now()
    sendChannels(lit, 1000)
    step(t0 + 500)
    const mid = engine.getChannel(1)
    expect(mid).toBeGreaterThan(90)
    reassertBase(lit)
    // Still mid-fade: nothing snapped to full.
    expect(engine.getChannel(1)).toBe(mid)
    step(t0 + 1500)
    expect(engine.getChannel(1)).toBe(255)
  })

  it('retargets a fade in flight toward a new target without snapping', () => {
    sendImmediate(dark)
    const t0 = performance.now()
    sendChannels(lit, 2000)
    step(t0 + 500)
    const mid = engine.getChannel(1)
    expect(mid).toBeGreaterThan(10)
    expect(mid).toBeLessThan(100)
    reassertBase(dark)
    // The retarget does not snap back to dark: the value is untouched
    // until the next tick, and it then glides back down.
    expect(engine.getChannel(1)).toBe(mid)
    step(t0 + 1200)
    expect(engine.getChannel(1)).toBeLessThan(mid)
    expect(engine.getChannel(1)).toBeGreaterThan(0)
    step(t0 + 2500)
    expect(engine.getChannel(1)).toBe(0)
  })

  it('fades over the given time when idle, and sends immediately without one', () => {
    sendImmediate(dark)
    const t0 = performance.now()
    reassertBase(lit, 1000)
    step(t0 + 500)
    expect(engine.getChannel(1)).toBeGreaterThan(90)
    expect(engine.getChannel(1)).toBeLessThan(170)
    step(t0 + 1500)
    expect(engine.getChannel(1)).toBe(255)
    reassertBase(dark)
    expect(engine.getChannel(1)).toBe(0)
  })
})
