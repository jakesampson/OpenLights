import { beforeEach, describe, expect, it, vi } from 'vitest'

const setChannels = vi.fn()
;(globalThis as any).window = { location: { search: '' }, electronAPI: { setChannels } }
;(globalThis as any).performance = { now: () => 0 }
;(globalThis as any).requestAnimationFrame = vi.fn(() => 1)
;(globalThis as any).cancelAnimationFrame = vi.fn()

import { sendImmediate, setBlindOutput } from '../src/renderer/src/lib/output'

describe('blind output', () => {
  beforeEach(() => { setBlindOutput(false); setChannels.mockClear(); sendImmediate({ 1: 10 }); setChannels.mockClear() })

  it('holds edits away from DMX and commits the current look on exit', () => {
    setBlindOutput(true)
    setChannels.mockClear()
    sendImmediate({ 1: 200 })
    expect(setChannels.mock.calls.at(-1)?.[0][1]).toBe(10)
    setBlindOutput(false)
    expect(setChannels.mock.calls.at(-1)?.[0][1]).toBe(200)
  })
})
