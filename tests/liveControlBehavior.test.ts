// Live-button type / behaviour helpers (Jake, 27 Nov 2026 — LightKey
// guide ch.11, p.204): Type and Behaviour are separate axes. A Push
// Button with Toggle behaviour latches; with Flash behaviour it is
// momentary; a Fader has no behaviour.
import { describe, expect, it } from 'vitest'
import { controlBehavior, isFaderControl, isFlashControl, isLatchingControl } from '../src/renderer/src/lib/liveControlBehavior'
import type { LiveControl } from '../src/shared/types'

const control = (patch: Partial<LiveControl>): LiveControl => ({ id: 'c', name: 'C', type: 'push', presetIds: [], ...patch })

describe('live control behaviour', () => {
  it('defaults an unset behaviour to Toggle', () => {
    expect(controlBehavior(control({}))).toBe('toggle')
    expect(controlBehavior(control({ behavior: 'flash' }))).toBe('flash')
  })

  it('a Push Button with Toggle behaviour is the only latching control', () => {
    expect(isLatchingControl(control({}))).toBe(true)
    expect(isLatchingControl(control({ behavior: 'toggle' }))).toBe(true)
    expect(isLatchingControl(control({ behavior: 'flash' }))).toBe(false)
    expect(isLatchingControl(control({ type: 'faderHorizontal' }))).toBe(false)
    expect(isLatchingControl(control({ type: 'faderVertical' }))).toBe(false)
  })

  it('a Push Button with Flash behaviour is the only momentary control', () => {
    expect(isFlashControl(control({ behavior: 'flash' }))).toBe(true)
    expect(isFlashControl(control({}))).toBe(false)
    expect(isFlashControl(control({ type: 'faderHorizontal', behavior: 'flash' }))).toBe(false)
  })

  it('both fader orientations are faders', () => {
    expect(isFaderControl(control({ type: 'faderHorizontal' }))).toBe(true)
    expect(isFaderControl(control({ type: 'faderVertical' }))).toBe(true)
    expect(isFaderControl(control({}))).toBe(false)
  })
})
