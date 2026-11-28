/**
 * Live-layer fade fallback: a live fade must start from what the rig was
 * actually showing, not from the base underneath.
 *
 * Jake, 28 Nov 2026 (ShowBuddyActive Demo): Full On + Green + Dimmer
 * Effect Live buttons lit; turning the Dimmer Effect off flashed blue
 * at full for ~0.5s, then green. While the effect ran, the live patch's
 * LED channels were stripped (the effect owned them), and by the time
 * the 500ms page fade started the effect was already gone from
 * effectPatch, so the old fallback read the blue base underneath:
 * green ramped 0 -> 255 while blue ramped 255 -> 0.
 *
 * Two parts to the fix, both in src/renderer/src/lib/output.ts:
 * (1) configureLiveOutput snapshots the last transmitted frame at fade
 * start and uses it as the fallback for channels the old live patch
 * did not drive (the effect-off case); a channel the new patch lets go
 * of still fades out to the underneath, or it would sit at its old
 * value through the fade and snap at the end.
 * (2) configureEffects defers the flush that runs when the last effect
 * stops by one microtask: the live layer still holds the stripped
 * patch at that point, so a flush right there would push the blue base
 * and poison the frame (1) snapshots. The live fade's own immediate
 * flush lands first in the same commit.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'
import {
  allZeroPatch,
  configureEffects,
  configureLiveOutput,
  configureOverrideOutput,
  configurePresetOutput,
  configureSequences,
  getLastOutputChannels,
  sendImmediate,
  setEffectBlackout,
  type FixtureLike,
  type EffectDef,
} from '../src/renderer/src/lib/output'

const WASH: FixtureLike = { id: 'w1', name: 'Wash', type: 'rgba-4ch', channelStart: 1, channels: 4 }
const RED = 1, GREEN = 2, BLUE = 3

function bellEffect(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    id: 'eff-bell', name: 'Bell Dimmer', attribute: 'intensity', kind: 'curve',
    durationMs: 2000, timingMode: 'fixed', offset: 128, size: 128, waveform: 'sine', phaseSpread: 0,
    fixtureIds: ['w1'],
    curvePoints: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }],
    curveComponents: [{
      component: 'intensity',
      points: [{ id: 'p0', x: 0, y: 0 }, { id: 'p1', x: 0.5, y: 1 }, { id: 'p2', x: 1, y: 0 }],
      curvedSegments: [false, false],
    }],
    enabled: true, ...overrides,
  }
}

/** A Dimmer effect pinned at half level — a constant 128 on the green. */
function flatEffect(): EffectDef {
  return {
    id: 'eff-flat', name: 'Flat Dimmer', attribute: 'intensity', kind: 'curve',
    durationMs: 2000, timingMode: 'fixed', offset: 128, size: 128, waveform: 'sine', phaseSpread: 0,
    fixtureIds: ['w1'],
    curveComponents: [{
      component: 'intensity',
      points: [{ id: 'p0', x: 0, y: 0.5 }, { id: 'p1', x: 1, y: 0.5 }],
      curvedSegments: [false],
    }],
    enabled: true,
  }
}

function makeHarness() {
  const engine = new DMXEngine()
  let frameId = 0
  const frames = new Map<number, (now: number) => void>()
  const electronAPI = {
    setChannels: (patch: Record<number, number>) => { engine.setChannels(patch) },
  }
  const framesSnapshot = () => [...frames.entries()]
  return {
    engine, frames,
    install() {
      vi.stubGlobal('window', { electronAPI })
      vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
        const id = ++frameId
        frames.set(id, cb)
        return id
      })
      vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
      setEffectBlackout(false)
      configurePresetOutput({})
      configureOverrideOutput({})
      configureLiveOutput({})
      sendImmediate(allZeroPatch())
    },
    async uninstall() {
      sendImmediate(allZeroPatch())
      configureLiveOutput({})
      configureEffects({ fixtures: [WASH], effects: [], baseValues: {}, bpm: 120, master: 255, blackout: false })
      // Let the deferred effect-stop flush run while the window stub is
      // still installed — after unstubAllGlobals it would throw.
      await Promise.resolve()
      vi.unstubAllGlobals()
    },
    // Run every registered rAF callback once at `now` — one-shot, like a
    // real rAF turn: the id is consumed when the callback fires, so the
    // effect loop's re-registration does not accumulate frames.
    runAll(now: number) {
      for (const [id, cb] of framesSnapshot()) { frames.delete(id); cb(now) }
    },
    channels() { return getLastOutputChannels() },
    // getLastOutputChannels is a 512-array indexed by channel-1, so read
    // a 1-based DMX channel number with this helper.
    ch(n: number) { return getLastOutputChannels()[n - 1] ?? 0 },
  }
}

beforeEach(() => { vi.restoreAllMocks() })

describe('live fade fallback', () => {
  it('switching a Dimmer effect off hands back to the Green pad without flashing blue', async () => {
    const h = makeHarness()
    h.install()
    try {
      // Base underneath is blue at full (Full On pad's intensity over the
      // fixture's default blue); the live layer covers it with green.
      sendImmediate({ [BLUE]: 255 })
      configureEffects({
        fixtures: [WASH], effects: [bellEffect()],
        baseValues: { w1: { red: 0, green: 255, blue: 0 } },
        bpm: 120, master: 255, blackout: false,
      })
      configureLiveOutput({})
      // Drive the effect loop until the bell is near its peak.
      const t0 = performance.now()
      let green = 0, steps = 0
      while (green < 200 && steps < 40) {
        h.runAll(t0 + steps * 100)
        green = h.ch(GREEN) ?? 0
        steps++
      }
      expect(green).toBeGreaterThanOrEqual(200)
      expect(h.ch(BLUE)).toBe(0)

      // Switch the effect off. The stop flush is deferred a microtask,
      // so the rig still shows the green bell right now — no blue frame
      // is pushed before the live fade starts.
      configureEffects({
        fixtures: [WASH], effects: [bellEffect({ enabled: false })],
        baseValues: { w1: { red: 0, green: 255, blue: 0 } },
        bpm: 120, master: 255, blackout: false,
      })
      expect(h.ch(GREEN)).toBeGreaterThan(150)
      expect(h.ch(BLUE)).toBe(0)

      // The App's commit then flushes the sequences, preset and override
      // layers — all synchronous — before the live layer. Each composes
      // the stale stripped live patch with the effect already gone, so
      // the blue base is what the rig shows by the time the fade starts.
      // (Probed 28 Nov 2026: the blue frame came from configureSequences
      // and configurePresetOutput, not from configureEffects.)
      configureSequences([], [])
      configurePresetOutput({})
      expect(h.ch(GREEN)).toBe(0)
      expect(h.ch(BLUE)).toBe(255)

      // Then start the live fade to the Green pad — exactly what the app
      // does when the Dimmer Effect button is clicked off while Green is
      // lit. The fade must start from what the rig was showing before
      // the effect stopped (green at the bell's level, blue 0) — not
      // from the poisoned blue frame those flushes just pushed.
      configureLiveOutput({ [RED]: 0, [GREEN]: 255, [BLUE]: 0 }, 500)
      expect(h.ch(GREEN)).toBeGreaterThan(150)
      expect(h.ch(BLUE)).toBe(0)
      // Halfway through the 500ms page fade: still green, still no blue.
      const fadeStart = performance.now()
      h.runAll(fadeStart + 250)
      expect(h.ch(GREEN)).toBeGreaterThan(150)
      expect(h.ch(BLUE)).toBe(0)
      // At the end of the fade: green full, blue 0.
      h.runAll(fadeStart + 501)
      expect(h.ch(GREEN)).toBe(255)
      expect(h.ch(BLUE)).toBe(0)
      // Let the deferred effect-stop flush run: it composes with the
      // corrected live patch, so it must not reintroduce blue either.
      await Promise.resolve()
      expect(h.ch(GREEN)).toBe(255)
      expect(h.ch(BLUE)).toBe(0)
    } finally {
      await h.uninstall()
    }
  })

  it('a live fade into a stripped patch (effect on) moves toward the effect level instead of holding and snapping', async () => {
    const h = makeHarness()
    h.install()
    try {
      // Green pad lit on a blue base, no effect running yet.
      sendImmediate({ [BLUE]: 255 })
      configureLiveOutput({ [RED]: 0, [GREEN]: 255, [BLUE]: 0 })
      expect(h.ch(GREEN)).toBe(255)
      expect(h.ch(BLUE)).toBe(0)
      // Start a Dimmer effect pinned at half level and switch the live
      // patch to the stripped state (the effect owns the LED channels
      // now). The effect level is a constant 128.
      configureEffects({
        fixtures: [WASH], effects: [flatEffect()],
        baseValues: { w1: { red: 0, green: 255, blue: 0 } },
        bpm: 120, master: 255, blackout: false,
      })
      const t0 = performance.now()
      h.runAll(t0 + 100)
      // While the Green pad is still lit unstripped, the live layer sits
      // above the effect and still shows the pad's 255 — the effect's
      // 128 only shows once the live patch is stripped by the fade.
      expect(h.ch(GREEN)).toBe(255)
      expect(h.ch(BLUE)).toBe(0)
      configureLiveOutput({}, 500)
      const fadeStart = performance.now()
      // Halfway through: the green is on its way from the pad level
      // (255) down to the effect level (128) — it must not sit at 255
      // and snap at the end.
      h.runAll(fadeStart + 250)
      const midGreen = h.ch(GREEN) ?? 0
      expect(midGreen).toBeGreaterThan(150)
      expect(midGreen).toBeLessThan(240)
      expect(h.ch(BLUE)).toBe(0)
      // At the end: the effect carries the green at its own level.
      h.runAll(fadeStart + 501)
      expect(h.ch(GREEN)).toBe(128)
      expect(h.ch(BLUE)).toBe(0)
    } finally {
      await h.uninstall()
    }
  })

  it('a plain preset fade (no effect involved) still crossfades from the old colour', async () => {
    const h = makeHarness()
    h.install()
    try {
      sendImmediate({ [BLUE]: 255 })
      configureLiveOutput({ [RED]: 255, [GREEN]: 0, [BLUE]: 0 })
      expect(h.ch(RED)).toBe(255)
      expect(h.ch(BLUE)).toBe(0)
      // Red pad off, Green pad on: the fade starts from red, not blue.
      configureLiveOutput({ [RED]: 0, [GREEN]: 255, [BLUE]: 0 }, 500)
      expect(h.ch(RED)).toBeGreaterThan(150)
      expect(h.ch(GREEN)).toBe(0)
      expect(h.ch(BLUE)).toBe(0)
      const fadeStart = performance.now()
      h.runAll(fadeStart + 250)
      const mid = { [RED]: h.ch(RED), [GREEN]: h.ch(GREEN), [BLUE]: h.ch(BLUE) }
      expect(mid[RED] ?? 0).toBeGreaterThan(0)
      expect(mid[GREEN] ?? 0).toBeGreaterThan(0)
      expect(mid[BLUE]).toBe(0)
      h.runAll(fadeStart + 501)
      expect(h.ch(RED)).toBe(0)
      expect(h.ch(GREEN)).toBe(255)
      expect(h.ch(BLUE)).toBe(0)
    } finally {
      await h.uninstall()
    }
  })
})
