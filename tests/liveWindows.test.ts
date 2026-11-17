import { describe, expect, it } from 'vitest'
import { normalizeLiveWindows, LIVE_WINDOW_COMMANDS } from '../src/shared/liveWindows'
describe('Live window restoration', () => {
  it('round trips saved descriptors and filters malformed or duplicate windows', () => {
    const saved = [{ id: 'w', pageId: 'p', width: 1000, height: 700 }]
    expect(normalizeLiveWindows(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
    expect(normalizeLiveWindows([null, ...saved, ...saved])).toEqual(saved)
    expect(normalizeLiveWindows([{ id: 'tiny', width: 1, height: 1 }])[0]).toMatchObject({ width: 640, height: 480 })
    expect(LIVE_WINDOW_COMMANDS).toContain('setLiveValue')
    expect(LIVE_WINDOW_COMMANDS).not.toContain('setShow')
  })
})
