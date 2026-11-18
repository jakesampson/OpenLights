import { describe, expect, it } from 'vitest'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import { composeOutput } from '../src/renderer/src/lib/outputModel'
import type { FixtureDef } from '../src/shared/types'
describe('fixture property defaults', () => {
  it('uses project overrides over profile defaults and restores defaults when overlays release', () => {
    const fixture: FixtureDef = { id: 'f', name: 'Head', type: 'moving-head', channels: 8, channelStart: 1, defaultValues: { pan: 40 } }
    const defaults = computeCueChannels([fixture], { id: 's', name: 'Empty', fadeMs: 0, fixtureValues: {} }, 255, true)
    expect(defaults[2]).toBe(40); expect(defaults[3]).toBe(128)
    expect(composeOutput({ defaults, overrides: { 2: 230 } })[2]).toBe(230)
    expect(composeOutput({ defaults })[2]).toBe(40)
  })
})
