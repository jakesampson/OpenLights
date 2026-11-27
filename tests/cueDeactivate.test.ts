// Clicking the lit cue in the Live tab's Cues section turns it off again
// (Jake, 26 Nov 2026): until now there was no way to deactivate a cue at
// all — activateCue always re-fired it, and stopCue only stops cue-list
// playback while the cue's values stay in the output. Deactivation fades
// back to the base look (no cue) over the cue's own fadeMs, falling back
// to the global Default fade — the same time the cue faded in over.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DMXEngine } from '../src/shared/dmx'
import type { ShowDef } from '../src/shared/types'

const engine = new DMXEngine()
const frames: Array<FrameRequestCallback | null> = []
vi.stubGlobal('window', { electronAPI: { setChannels: (values: Record<number, number>) => engine.setChannels(values) } })
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = null })
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { configureEffects, sendImmediate } from '../src/renderer/src/lib/output'

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
    cueLists: [
      {
        id: 'c1', name: 'Set',
        steps: [
          { id: 'step1', cueId: 'dark', fadeMs: 0, holdMs: 0 },
          { id: 'step2', cueId: 'lit', fadeMs: 0, holdMs: 0 },
        ],
        loop: false,
      },
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

describe('cue deactivation', () => {
  it('turning the active cue off returns the rig to the base look', () => {
    const show = makeShow({
      cues: [
        { id: 'dark', name: 'Dark', fadeMs: 0, fixtureValues: darkValues },
        { id: 'lit', name: 'Lit', fadeMs: 0, fixtureValues: litValues },
      ],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    store.activateCue('lit')
    expect(useShowStore.getState().activeCueId).toBe('lit')
    expect(engine.getChannel(1)).toBe(255)
    expect(engine.getChannel(5)).toBe(255)
    store.deactivateCue()
    expect(useShowStore.getState().activeCueId).toBeNull()
    // Dimmers closed — no light — and the cue's red is gone; the
    // defaults (blue underneath, pan/tilt centred) are back.
    expect(engine.getChannel(1)).toBe(0)
    expect(engine.getChannel(5)).toBe(0)
    expect(engine.getChannel(6)).toBe(0)
  })

  it('deactivation fades over the cue’s own fadeMs', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow())
    const t0 = performance.now()
    store.activateCue('lit')
    step(t0 + 1500)
    expect(engine.getChannel(1)).toBe(255)
    const t1 = performance.now()
    store.deactivateCue()
    // Nothing has snapped: the fade only just started.
    expect(engine.getChannel(1)).toBe(255)
    expect(engine.getChannel(5)).toBe(255)
    // Halfway through the 1000 ms fade the rig is halfway there —
    // smoothstep(0.5) is 0.5, so both fixtures read about half.
    step(t1 + 500)
    expect(engine.getChannel(1)).toBeGreaterThan(90)
    expect(engine.getChannel(1)).toBeLessThan(170)
    expect(engine.getChannel(5)).toBeGreaterThan(90)
    expect(engine.getChannel(5)).toBeLessThan(170)
    // The fade lands: dimmers closed, no light.
    step(t1 + 1500)
    expect(engine.getChannel(1)).toBe(0)
    expect(engine.getChannel(5)).toBe(0)
    expect(useShowStore.getState().activeCueId).toBeNull()
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
    step(t0 + 2500)
    expect(engine.getChannel(1)).toBe(255)
    const t1 = performance.now()
    store.deactivateCue()
    // A 2000 ms fade is only ~15% in at 500 ms (smoothstep 0.25),
    // and still not done at 1100 ms — a 1000 ms fade would be.
    step(t1 + 500)
    expect(engine.getChannel(1)).toBeGreaterThan(100)
    expect(engine.getChannel(1)).toBeLessThan(255)
    step(t1 + 1100)
    expect(engine.getChannel(1)).toBeGreaterThan(0)
    expect(engine.getChannel(1)).toBeLessThan(255)
    step(t1 + 2500)
    expect(engine.getChannel(1)).toBe(0)
    expect(useShowStore.getState().activeCueId).toBeNull()
  })

  it('activating again after deactivating brings the cue back', () => {
    const show = makeShow({
      cues: [
        { id: 'dark', name: 'Dark', fadeMs: 0, fixtureValues: darkValues },
        { id: 'lit', name: 'Lit', fadeMs: 0, fixtureValues: litValues },
      ],
    })
    const store = useShowStore.getState()
    store.setShow(show)
    store.activateCue('lit')
    store.deactivateCue()
    expect(useShowStore.getState().activeCueId).toBeNull()
    expect(engine.getChannel(1)).toBe(0)
    store.activateCue('lit')
    expect(useShowStore.getState().activeCueId).toBe('lit')
    expect(engine.getChannel(1)).toBe(255)
  })

  it('deactivating with no active cue is a no-op', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow())
    expect(useShowStore.getState().activeCueId).toBeNull()
    store.deactivateCue()
    expect(useShowStore.getState().activeCueId).toBeNull()
    expect(engine.getChannel(1)).toBe(0)
    expect(engine.getChannel(5)).toBe(0)
  })

  it('cue-list Go/Back still activate — they never toggle', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow())
    store.goToCue('c1', 0)
    expect(useShowStore.getState().activeCueId).toBe('dark')
    expect(useShowStore.getState().cuePlaying).toBe(true)
    store.cueNext()
    expect(useShowStore.getState().activeCueId).toBe('lit')
    expect(useShowStore.getState().cuePlaying).toBe(true)
    store.cuePrev()
    expect(useShowStore.getState().activeCueId).toBe('dark')
    expect(useShowStore.getState().cuePlaying).toBe(true)
  })

  it('toggling off a playing list stops playback but keeps its place, so Go resumes', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow())
    store.goToCue('c1', 0)
    expect(useShowStore.getState().activeCueId).toBe('dark')
    expect(useShowStore.getState().cuePlaying).toBe(true)
    store.deactivateCue()
    expect(useShowStore.getState().activeCueId).toBeNull()
    expect(useShowStore.getState().cuePlaying).toBe(false)
    expect(useShowStore.getState().activeCueListId).toBe('c1')
    expect(useShowStore.getState().activeCueIndex).toBe(0)
    store.cueNext()
    expect(useShowStore.getState().activeCueId).toBe('lit')
    expect(useShowStore.getState().cuePlaying).toBe(true)
    expect(useShowStore.getState().activeCueIndex).toBe(1)
  })

  it('wizard Go! creates a "Full" preset and no cue at all', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow({ cues: [] }))
    store.startSetupWizard()
    store.setSetupWizardStep('done')
    store.finishSetupWizard()
    expect(useShowStore.getState().setupWizardStep).toBeNull()
    // New projects start cue-free (Jake, 26 Nov 2026): no Home cue.
    expect(useShowStore.getState().cues).toHaveLength(0)
    expect(useShowStore.getState().activeCueId).toBeNull()
    // Instead the first preset carries the old Home cue's values and
    // starts active, so the rig still comes on full at the start.
    expect(useShowStore.getState().presets).toHaveLength(1)
    const full = useShowStore.getState().presets[0]
    expect(full.name).toBe('Full')
    expect(full.category).toBe('intensity')
    expect(full.fixtureValues).toEqual({
      q1: { intensity: 255 },
      w1: { intensity: 255 },
    })
    expect(useShowStore.getState().activePresetIds).toEqual([full.id])
  })

  it('Stop deactivates the playing list’s cue instead of only pausing', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow({
      cues: [
        { id: 'dark', name: 'Dark', fadeMs: 0, fixtureValues: darkValues },
        { id: 'lit', name: 'Lit', fadeMs: 0, fixtureValues: litValues },
      ],
    }))
    store.goToCue('c1', 0)
    expect(useShowStore.getState().activeCueId).toBe('dark')
    expect(useShowStore.getState().cuePlaying).toBe(true)
    store.cueNext()
    expect(useShowStore.getState().activeCueId).toBe('lit')
    expect(engine.getChannel(1)).toBe(255)
    store.cuePrev()
    expect(useShowStore.getState().activeCueId).toBe('dark')
    expect(useShowStore.getState().activeCueIndex).toBe(0)
    store.stopCue()
    // LightKey p.218: Stop deactivates the cues in the cuelist. The
    // lights go out (not just the playback), but the list keeps its
    // place, so Go resumes from the current step.
    expect(useShowStore.getState().activeCueId).toBeNull()
    expect(useShowStore.getState().cuePlaying).toBe(false)
    expect(useShowStore.getState().activeCueListId).toBe('c1')
    expect(useShowStore.getState().activeCueIndex).toBe(0)
    expect(engine.getChannel(1)).toBe(0)
    expect(engine.getChannel(5)).toBe(0)
    store.cueNext()
    expect(useShowStore.getState().activeCueId).toBe('lit')
    expect(useShowStore.getState().cuePlaying).toBe(true)
  })

  it('Stop with nothing playing is a no-op for the active cue', () => {
    const store = useShowStore.getState()
    store.setShow(makeShow({
      cues: [
        { id: 'dark', name: 'Dark', fadeMs: 0, fixtureValues: darkValues },
        { id: 'lit', name: 'Lit', fadeMs: 0, fixtureValues: litValues },
      ],
    }))
    store.activateCue('lit')
    expect(useShowStore.getState().activeCueId).toBe('lit')
    store.stopCue()
    // Not playing, so Stop only ever meant "stop playback" — the
    // plain active cue stays put (its own off switch is the toggle).
    expect(useShowStore.getState().activeCueId).toBe('lit')
    expect(engine.getChannel(1)).toBe(255)
  })
})

describe('cue toggle wiring (cuelist rows)', () => {
  it('the cuelist row deactivates when active and activates otherwise', () => {
    // The cue grid is gone (Jake, 26 Nov 2026 — Option 2): the toggle
    // lives on the cuelist rows. The rows moved onto the cuelist widget
    // on the canvas (Jake, 27 Nov 2026 — cuelist as a widget, LightKey's
    // way; the fixed CueListsSection is gone).
    const workspace = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
    expect(workspace).toContain('onClick={() => (active ? deactivateCue() : goToCue(list.id, index))}')
    const liveTab = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/LiveTab.tsx'), 'utf8')
    expect(liveTab).not.toContain('CueListsSection')
  })

  it('neither Live view renders a cue grid any more', () => {
    const liveTab = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/LiveTab.tsx'), 'utf8')
    expect(liveTab).not.toContain('LiveCueButtons')
    const app = readFileSync(resolve(__dirname, '..', 'src/renderer/src/App.tsx'), 'utf8')
    expect(app).not.toContain('LiveCueButtons')
  })

  it('the main window renders only the Live canvas, no Cues section below it', () => {
    const app = readFileSync(resolve(__dirname, '..', 'src/renderer/src/App.tsx'), 'utf8')
    const body = app.slice(app.indexOf('live-page-shell'))
    expect(body).toContain('<LiveWorkspace masterOverlay toolbarHost={liveToolbarHost} />')
    expect(body).not.toContain('LiveCueButtons')
    expect(body).not.toContain('>Cues</h3>')
  })

  it('activateCue itself is still activation-only — no toggle inside the store', () => {
    const store = readFileSync(resolve(__dirname, '..', 'src/renderer/src/stores/showStore.ts'), 'utf8')
    const activation = store.slice(store.indexOf('  activateCue: (id) =>'))
    const body = activation.slice(0, activation.indexOf('  deactivateCue: () =>'))
    expect(body).not.toContain('deactivateCue')
    expect(body).not.toContain('activeCueId: null')
  })
})
