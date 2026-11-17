import { describe, expect, it } from 'vitest'
import { BOTTOM_PANEL_REGIONS, LIVE_EDIT_ADD_KINDS, bottomPanelMode } from '../src/renderer/src/lib/bottomPanel'

describe('Lightkey-style bottom panel', () => {
  it('uses scene tiles for Design and playback surfaces for Live', () => {
    expect(bottomPanelMode('Design', false)).toBe('fixture-controls')
    expect(bottomPanelMode('Live', false)).toBe('live-buttons')
    expect(bottomPanelMode('Live', true)).toBe('cuelist-playback')
  })

  it('contains no scene or cue editing region', () => {
    expect(BOTTOM_PANEL_REGIONS).toEqual(['master', 'playback', 'shortcuts'])
    expect(BOTTOM_PANEL_REGIONS).not.toContain('editor')
  })
  it('offers scene and custom controls from Live edit', () => {
    expect(LIVE_EDIT_ADD_KINDS).toEqual(['scene', 'cue', 'cuelist', 'label', 'frame'])
  })
})
