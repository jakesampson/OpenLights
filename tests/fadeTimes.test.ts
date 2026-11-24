// Fade-time priority (Jake, 24 Nov 2026): Live page fade first, then
// the transition's own explicit fade time, then the global Default
// fade as the fallback.
import { describe, expect, it } from 'vitest'
import { resolveFadeMs, activeLivePageFadeMs } from '../src/renderer/src/lib/fadeTimes'

describe('activeLivePageFadeMs', () => {
  it('returns the active page fade where set', () => {
    expect(activeLivePageFadeMs([
      { id: 'a', fadeMs: 3000 },
      { id: 'b', fadeMs: 500 },
    ], 'b')).toBe(500)
  })

  it('falls back to the first page when no page is selected', () => {
    expect(activeLivePageFadeMs([{ id: 'a', fadeMs: 3000 }], null)).toBe(3000)
  })

  it('returns null when the page carries no fade time, or there are no pages', () => {
    expect(activeLivePageFadeMs([{ id: 'a' }], 'a')).toBeNull()
    expect(activeLivePageFadeMs([], 'a')).toBeNull()
    expect(activeLivePageFadeMs(undefined, 'a')).toBeNull()
  })

  it('an explicit 0 is a set fade time, not an unset one', () => {
    expect(activeLivePageFadeMs([{ id: 'a', fadeMs: 0 }], 'a')).toBe(0)
  })
})

describe('resolveFadeMs', () => {
  it('a Live page fade beats both the explicit time and the global default', () => {
    expect(resolveFadeMs({ pageFadeMs: 500, explicitFadeMs: 1000, defaultFadeMs: 2000 })).toBe(500)
  })

  it('the explicit time beats the global default when no page governs the transition', () => {
    expect(resolveFadeMs({ explicitFadeMs: 1000, defaultFadeMs: 2000 })).toBe(1000)
  })

  it('a cue with no explicit time falls back to the global Default fade', () => {
    expect(resolveFadeMs({ explicitFadeMs: undefined, defaultFadeMs: 1000 })).toBe(1000)
    expect(resolveFadeMs({ explicitFadeMs: null, defaultFadeMs: 1000 })).toBe(1000)
  })

  it('an explicit 0 is a snap by choice, not an unset value', () => {
    expect(resolveFadeMs({ explicitFadeMs: 0, defaultFadeMs: 1000 })).toBe(0)
    expect(resolveFadeMs({ pageFadeMs: 0, explicitFadeMs: 1000, defaultFadeMs: 2000 })).toBe(0)
  })

  it('no global set anywhere falls back to 1000 ms', () => {
    expect(resolveFadeMs({})).toBe(1000)
    expect(resolveFadeMs({ defaultFadeMs: undefined })).toBe(1000)
  })

  it('negative times clamp to 0', () => {
    expect(resolveFadeMs({ explicitFadeMs: -50, defaultFadeMs: 1000 })).toBe(0)
  })
})
