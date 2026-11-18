import { describe, expect, it } from 'vitest'
import { BOTTOM_PANEL_REGIONS, LIVE_EDIT_ADD_KINDS, bottomPanelMode } from '../src/renderer/src/lib/bottomPanel'
import { readFileSync } from 'node:fs'

describe('Lightkey-style bottom panel', () => {
  it('uses fixture controls for Design', () => {
    expect(bottomPanelMode('Design', false)).toBe('fixture-controls')
  })

  it('contains no scene or cue editing region', () => {
    expect(BOTTOM_PANEL_REGIONS).toEqual(['master', 'playback', 'shortcuts'])
    expect(BOTTOM_PANEL_REGIONS).not.toContain('editor')
  })
  it('offers scene and custom controls from Live edit', () => {
    expect(LIVE_EDIT_ADD_KINDS).toEqual(['scene', 'cue', 'cuelist', 'label', 'frame'])
  })
  it('renders the Live page canvas inline without forced scene buttons or a master fader', () => {
    const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
    const live = readFileSync('src/renderer/src/components/LiveWorkspace.tsx', 'utf8')
    expect(app).toContain("tab === 'Live' ? <LiveWorkspace />")
    expect(app).not.toContain('liveEditorOpen')
    expect(app).not.toContain('<BottomPlayback view={tab}')
    expect(live).not.toContain('Manage pages')
    expect(live).not.toContain('aria-label="Live page"')
  })
  it('keeps Design as a fixed selected-fixture inspector', () => {
    const design = readFileSync('src/renderer/src/components/DesignTab.tsx', 'utf8')
    const css = readFileSync('src/renderer/src/index.css', 'utf8')
    expect(design).toContain('design-fixture-inspector')
    expect(design).not.toContain('<FixtureSelectionTools')
    expect(design).not.toContain('<FanningEditor')
    expect(design).not.toContain('Edit scene')
    expect(design).not.toContain('design-scene')
    expect(design).not.toContain('Manual override')
    expect(readFileSync('src/renderer/src/components/BottomPlayback.tsx', 'utf8')).not.toContain('Master output')
    expect(css).toContain('.fixture-controls-bottom { height: 100%; min-height: 0; overflow: hidden; }')
  })
})
