import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrateShow } from '../src/shared/migrations'
import { syncPresetGroups } from '../src/renderer/src/lib/presetGroups'
import { applyLiveDrop, type LivePage } from '../src/renderer/src/lib/liveDrops'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { PresetDef, PresetGroup } from '../src/shared/types'

vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

// LightKey Preset Palette as one combined browser (18 Nov 2026, Jake's
// screenshots): presets of every kind and sequences in the same tree, under
// groups the user creates. No standard folders, no split Presets/Sequences
// sections, no "Fixture groups" panel. See NOTES.md.
describe('Preset Palette — LightKey combined tree', () => {
  const root = resolve(__dirname, '..')
  const panel = readFileSync(resolve(root, 'src/renderer/src/components/GroupsPresetsPanel.tsx'), 'utf8')
  const groupsLib = readFileSync(resolve(root, 'src/renderer/src/lib/presetGroups.ts'), 'utf8')
  const migrations = readFileSync(resolve(root, 'src/shared/migrations.ts'), 'utf8')
  const app = readFileSync(resolve(root, 'src/renderer/src/App.tsx'), 'utf8')
  const patch = readFileSync(resolve(root, 'src/renderer/src/components/PatchPanel.tsx'), 'utf8')

  it('has one combined tree: presets and sequences as draggable rows under user groups', () => {
    for (const text of [
      'Preset palette',
      'role="tree"',
      'aria-label="Preset palette"',
      'encodeLiveDrop',
      'LIVE_DROP_MIME',
      'assignSequenceGroup',
      'duplicatePreset',
      '<SequenceEditor sequenceId='
    ]) expect(panel).toContain(text)
    // Sequences are tree rows too (not a separate section/editor list).
    expect(panel).toContain("kind: 'sequence', id: sequence.id")
  })

  it('has no standard folders or split sections', () => {
    // Rendered UI strings, not comments: the header comment documents the
    // removals by name, so these assertions use the rendered forms.
    for (const text of [
      '>Fixture groups<',
      'Preset layers',
      'Cues · ${cues.length}',
      'Chases: ordered steps',
      'No sequences yet',
      'Patch fixtures and save cues to populate this tree',
      "from './FixtureGroups'",
      '<FixtureGroups',
      'PresetGroups',
      // 18 Nov 2026 regression (Jake's screenshot 2): the palette had a
      // collapsed cue row that only rendered once the tree was non-empty,
      // so creating a group made cues "magically appear". Cues are gone
      // from the palette entirely — no row, no picker, no edit modal, no
      // header-menu cue actions.
      'activateCue',
      '__scenes__',
      'editingCue',
      'New cue',
      'Duplicate active cue'
    ]) expect(panel).not.toContain(text)
    // Syncing never invents a category group.
    expect(groupsLib).not.toContain('`presets:${')
    expect(migrations).not.toContain('`presets:${')
  })

  it('keeps Export / Import / Convert in a header menu, not big palette buttons', () => {
    expect(panel).toContain('Preset palette menu')
    expect(panel).toContain('Export JSON')
    expect(panel).toContain('Import JSON')
    expect(panel).toContain('Convert cues')
  })

  it('has the LightKey palette right-click menu (minus features that do not exist)', () => {
    for (const text of [
      'Show Properties',
      'Add Overrides',
      'New Preset With Snapshot',
      'New Group From Selection',
      'New Sequence',
      'New Sequence From Selection',
      'PaletteContextMenu'
    ]) expect(panel).toContain(text)
    expect(panel).toContain('aria-label="Preset palette panel"')
    // In Design edit mode the sidebar becomes the Preview inspector
    // (Guide p.53); otherwise it is the Preset Palette sidebar.
    expect(app).toContain("aria-label={tab === 'Design' && previewEditing ? 'Preview inspector' : 'Preset palette sidebar'}")
    expect(app).toContain('openlights-preset-palette-context')
    // "External Control" does not exist in OpenLights — it must not be
    // faked as a menu item (the source comment records the omission).
    expect(panel).not.toContain("label: 'External Control'")
  })

  it('has the LightKey palette keyboard shortcuts, scoped to the palette', () => {
    for (const text of [
      "key === 'ArrowDown'",
      "key === 'ArrowUp'",
      'New preset',
      'New group'
    ]) expect(panel).toContain(text)
    expect(panel).toContain('stopPropagation')
    // The shortcut names are shown in the Shortcuts panel, whose rows
    // live in lib/shortcuts.ts (PALETTE_SHORTCUTS) now — App renders
    // buildShortcutsList, which includes them.
    const shortcuts = readFileSync(resolve(root, 'src/renderer/src/lib/shortcuts.ts'), 'utf8')
    expect(shortcuts).toContain('Select presets')
    expect(shortcuts).toContain('Shift+Cmd+N')
    expect(shortcuts).toContain('Shift+Cmd+E')
    expect(shortcuts).toContain('Edit preset')
    expect(app).toContain('buildShortcutsList')
  })

  it('renames the sidebar "Preset Palette" and moves fixture groups to Patch', () => {
    expect(app).toContain('Preset Palette')
    expect(app).not.toContain('Groups & Presets')
    expect(app).not.toContain('fixture tree')
    expect(patch).toContain('<FixtureGroups />')
    expect(panel).not.toContain("from './FixtureGroups'")
    expect(panel).not.toContain('<FixtureGroups')
  })

  it('migration strips seeded category groups without losing the presets', () => {
    const presets: PresetDef[] = ['a', 'b'].map((id) => ({ id, name: id, category: 'color', fixtureValues: {} }))
    const seeded: PresetGroup = { id: 'presets:color', name: 'color', parentId: null, exclusive: false, presetIds: ['a', 'b'] }
    const user: PresetGroup = { id: 'user-1', name: 'Worship', parentId: null, exclusive: false, presetIds: ['a'] }
    const show = migrateShow({ presets, presetGroups: [seeded, user] })
    expect(show.presetGroups).toEqual([user])
    expect(show.presets).toHaveLength(2)
    expect(migrateShow({ presets }).presetGroups).toEqual([])
  })

  it('sync never creates groups and strips seeded ones', () => {
    const presets: PresetDef[] = [{ id: 'a', name: 'A', category: 'color', fixtureValues: {} }]
    const seeded: PresetGroup = { id: 'presets:color', name: 'color', parentId: null, exclusive: false, presetIds: ['a', 'missing'] }
    expect(syncPresetGroups([seeded], presets)).toEqual([])
    expect(syncPresetGroups([], presets)).toEqual([])
  })

  it('assigns sequences to user groups, duplicates presets into their group, and keeps data on group delete', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      presets: [{ id: 'p1', name: 'Blue', category: 'color', fixtureValues: {} }],
      cues: [{ id: 'sc', name: 'S', fadeMs: 0, fixtureValues: {} }]
    }))
    s().createPresetGroup('Worship')
    const groupId = s().show!.presetGroups!.at(-1)!.id
    s().createSequence('Chase')
    const sequenceId = s().show!.sequences![0].id
    s().assignSequenceGroup(sequenceId, groupId)
    expect(s().show!.presetGroups![0].sequenceIds).toEqual([sequenceId])
    s().assignSequenceGroup(sequenceId, null)
    expect(s().show!.presetGroups![0].sequenceIds).toEqual([])
    s().assignPresetGroup('p1', groupId)
    s().duplicatePreset('p1')
    const copy = s().presets.find((p) => p.name === 'Blue copy')!
    expect(copy.category).toBe('color')
    expect(s().show!.presetGroups![0].presetIds).toEqual(['p1', copy.id])
    s().deletePresetGroup(groupId)
    expect(s().presets.map((p) => p.id)).toEqual(['p1', copy.id])
    s().undo()
    expect(s().show!.presetGroups).toHaveLength(1)
  })

  it('dragging a sequence onto a Live page auto-creates a button for it, selected', () => {
    const page: LivePage = { id: 'page', name: 'Main', controls: [] }
    const { page: next, refs } = applyLiveDrop(
      page,
      { presetIds: [], sequenceIds: ['s1'], sequenceNames: { s1: 'Chase' } },
      { kind: 'page', x: 100, y: 100 },
      () => 'new-cue'
    )
    expect(next.controls).toHaveLength(1)
    expect(next.controls[0].name).toBe('Chase')
    expect(next.controls[0].sequenceIds).toEqual(['s1'])
    expect(refs).toEqual([{ type: 'cue', id: 'new-cue' }])
  })
})
