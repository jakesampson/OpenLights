import { describe, expect, it } from 'vitest'
import { BOTTOM_PANEL_REGIONS, bottomPanelMode } from '../src/renderer/src/lib/bottomPanel'

describe('Lightkey-style bottom panel', () => {
  it('uses scene tiles for Design and playback surfaces for Live', () => {
    expect(bottomPanelMode('Design', false)).toBe('scene-playback')
    expect(bottomPanelMode('Live', false)).toBe('live-buttons')
    expect(bottomPanelMode('Live', true)).toBe('cuelist-playback')
  })

  it('contains no scene or cue editing region', () => {
    expect(BOTTOM_PANEL_REGIONS).toEqual(['master', 'playback', 'shortcuts'])
    expect(BOTTOM_PANEL_REGIONS).not.toContain('editor')
  })
})
