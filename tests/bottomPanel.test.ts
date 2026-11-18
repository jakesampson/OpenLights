import { describe, expect, it } from 'vitest'
import { BOTTOM_PANEL_REGIONS, LIVE_EDIT_ADD_KINDS, bottomPanelMode } from '../src/renderer/src/lib/bottomPanel'
import { readFileSync } from 'node:fs'

describe('Lightkey-style bottom panel', () => {
  it('uses fixture controls for Design', () => {
    expect(bottomPanelMode('Design', false)).toBe('fixture-controls')
  })

  it('contains no cue editing region', () => {
    expect(BOTTOM_PANEL_REGIONS).toEqual(['master', 'playback', 'shortcuts'])
    expect(BOTTOM_PANEL_REGIONS).not.toContain('editor')
  })
  it('offers cue and custom controls from Live edit', () => {
    // One cue-button kind only (LightKey, Guide ch.11 p.181): the old
    // separate 'scene' button kind was the same thing under the old name.
    expect(LIVE_EDIT_ADD_KINDS).toEqual(['cue', 'cuelist', 'label', 'frame'])
  })
  it('renders the Live page canvas inline without forced cue buttons or a master fader', () => {
    const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
    const live = readFileSync('src/renderer/src/components/LiveWorkspace.tsx', 'utf8')
    // The workspace takes a masterOverlay flag now (18 Nov 2026): the
    // Master column lives in the bottom panel shell in App.tsx, as an
    // overlay on top of the workspace — the workspace itself still renders
    // the canvas inline, with no master fader inside it.
    expect(app).toContain("tab === 'Live' ? <LiveWorkspace masterOverlay />")
    expect(live.indexOf('<MasterFader')).toBe(-1)
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
    // Jake, 18 Nov 2026: Fanning is NOT in LightKey's Design panel, so
    // the <FanningEditor> wiring from batch 1 is reversed — the panel no
    // longer renders it, and the component file is deleted. The fanning
    // model/store (saveFan/deleteFan, lib/fanning.ts, fan data on cues)
    // stays; only the Design panel UI goes. The header also has no
    // separator rule under it anymore ("1 fixture selected" sits directly
    // above the controls). Grouping, selection tools and layout sections
    // stay out of this panel.
    expect(design).not.toContain('FanningEditor')
    expect(design).not.toContain('border-b border-line')
    expect(design).toContain('<PositionControl')
    expect(design).not.toContain('Edit cue')
    expect(design).not.toContain('design-cue')
    expect(design).not.toContain('Manual override')
    expect(readFileSync('src/renderer/src/components/BottomPlayback.tsx', 'utf8')).not.toContain('Master output')
    expect(css).toContain('.fixture-controls-bottom { height: 100%; min-height: 0; overflow: hidden; }')
  })
})
