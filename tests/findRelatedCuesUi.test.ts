import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 6.12a — "Show in Cue" (LightKey Guide p.144): right-click a preset or
// sequence in the Preset Palette, pick a cue from the "Show in Cue"
// submenu, and OpenLights reveals that cue in the Live view. The pure
// listing logic is covered in tests/presetPalette.test.ts; these tests
// prove the UI wiring — the menu entry, the submenu fed by the pure
// functions, and the Live reveal in App.
describe('Find related cues UI (6.12a)', () => {
  const root = resolve(__dirname, '..')
  const panel = readFileSync(resolve(root, 'src/renderer/src/components/GroupsPresetsPanel.tsx'), 'utf8')
  const app = readFileSync(resolve(root, 'src/renderer/src/App.tsx'), 'utf8')
  const lib = readFileSync(resolve(root, 'src/renderer/src/lib/presetPalette.ts'), 'utf8')

  it('offers "Show in Cue" on preset and sequence rows in the palette context menu', () => {
    expect(panel).toContain('Show in Cue')
    // Only presets and sequences get the submenu — groups and effects do not.
    expect(panel).toContain("(target.kind === 'preset' || target.kind === 'sequence')")
    // Existing menu entries are untouched.
    for (const text of ['Show Properties', 'Add Overrides', 'Rename', 'Duplicate', 'Delete']) expect(panel).toContain(text)
  })

  it('feeds the submenu from the pure related-cue functions', () => {
    // Presets reuse the existing function as-is.
    expect(panel).toContain('findRelatedCues(show, target.id)')
    // Sequences use the sibling (controls carry sequenceIds too).
    expect(panel).toContain('findRelatedCuesForSequence(show, target.id)')
    expect(lib).toContain('export function findRelatedCuesForSequence(')
    // An empty result is stated, not an empty menu.
    expect(panel).toContain('No cues use this')
  })

  it('reveals the chosen cue in the Live view', () => {
    // Palette asks; App listens — same event name on both sides.
    expect(panel).toContain("openlights-reveal-live-control")
    expect(app).toContain("openlights-reveal-live-control")
    // The reveal selects the cue's page, selects the button, switches
    // to Live, and scrolls it into view (mirrors ProjectSearch's reveal).
    expect(app).toContain('selectLivePage(detail.pageId)')
    expect(app).toContain("setPageObjectSelection([{ type: 'cue', id: detail.controlId }])")
    expect(app).toContain("setTab('Live')")
    expect(app).toContain('scrollIntoView')
  })
})
