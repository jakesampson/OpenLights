import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// "Select Unused Items" (LightKey Guide ch.9, p.144): right-click in the
// Preset Palette and select the presets/sequences no cue contains. The
// pure search is covered in tests/presetPalette.test.ts; these tests prove
// the UI wiring — the menu entry, the scope expansion, and the selection.
describe('Select Unused Items UI (Guide ch.9, p.144)', () => {
  const root = resolve(__dirname, '..')
  const panel = readFileSync(resolve(root, 'src/renderer/src/components/GroupsPresetsPanel.tsx'), 'utf8')
  const lib = readFileSync(resolve(root, 'src/renderer/src/lib/presetPalette.ts'), 'utf8')

  it('offers "Select Unused Items" in the palette context menu', () => {
    expect(panel).toContain("'select-unused'")
    expect(panel).toContain("Select Unused Items")
    // It is not gated on a target — blank palette space searches the
    // whole palette, as the guide allows ("If you select no items,
    // Lightkey will search the entire Preset Palette").
    expect(panel).toContain("{item('select-unused', 'Select Unused Items')}")
  })

  it('searches within the selection, expanding groups, and selects the result', () => {
    expect(panel).toContain('findUnusedItems(show,')
    expect(panel).toContain('addGroup(child.id)')
    expect(panel).toContain("setSelected([")
    expect(panel).toContain("kind: 'preset', id: p.id")
    expect(panel).toContain("kind: 'sequence', id: s.id")
    expect(lib).toContain('export function findUnusedItems(')
  })

  it('reports the result in the palette note, including the empty case', () => {
    expect(panel).toContain('No unused items in the search scope.')
    expect(panel).toContain('Selected ${total} unused item')
  })
})
