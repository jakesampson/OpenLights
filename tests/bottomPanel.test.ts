import { describe, expect, it } from 'vitest'
import { BOTTOM_PANEL_REGIONS, LIVE_EDIT_ADD_KINDS, bottomPanelMode } from '../src/renderer/src/lib/bottomPanel'
import { readFileSync } from 'node:fs'

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
  it('keeps Design as a fixed selected-fixture inspector', () => {
    const design = readFileSync('src/renderer/src/components/DesignTab.tsx', 'utf8')
    const css = readFileSync('src/renderer/src/index.css', 'utf8')
    expect(design).toContain('design-fixture-inspector')
    expect(design).not.toContain('<FixtureSelectionTools')
    expect(design).not.toContain('<FanningEditor')
    expect(css).toContain('.fixture-controls-bottom { height: 100%; min-height: 0; overflow: hidden; }')
  })
})
