import { describe, expect, it } from 'vitest'
import type { FadeCurve, LiveControl } from '../src/shared/types'
import { cueTransitionLevel, fadeCurve } from '../src/renderer/src/lib/fadeCurves'

const curves: FadeCurve[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 's-curve']
describe('fade curves and cue timing', () => {
  for (const curve of curves) it(`${curve} has stable endpoints and midpoint`, () => {
    expect(fadeCurve(curve, 0)).toBe(0)
    expect(fadeCurve(curve, 1)).toBe(1)
    expect(fadeCurve(curve, 0.5)).toBeGreaterThanOrEqual(0.25)
    expect(fadeCurve(curve, 0.5)).toBeLessThanOrEqual(0.75)
  })
  it('applies delay, fade-in and fade-out to cue output levels', () => {
    const cue: LiveControl = { id: 'c', name: 'Cue', type: 'push', presetIds: [], timing: { delayMs: 100, fadeInMs: 400, fadeOutMs: 200, curve: 'linear' } }
    expect(cueTransitionLevel(cue, 0, 255, 50)).toBe(0)
    expect(cueTransitionLevel(cue, 0, 255, 300)).toBe(128)
    expect(cueTransitionLevel(cue, 255, 0, 200)).toBe(128)
  })
})
