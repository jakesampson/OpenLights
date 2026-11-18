import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrateShow } from '../src/shared/migrations'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { resolvePaletteDrop, type PaletteDragItem } from '../src/renderer/src/lib/paletteDrop'
import type { PresetGroup } from '../src/shared/types'

vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

// 18 Nov 2026 fix batch — the three bugs Jake found testing the
// palette/popup batch on his Mac. See NOTES.md.
describe('OpenLights fix batch — cues, palette drag, in-place preset edit', () => {
  const root = resolve(__dirname, '..')
  const panel = readFileSync(resolve(root, 'src/renderer/src/components/GroupsPresetsPanel.tsx'), 'utf8')
  const app = readFileSync(resolve(root, 'src/renderer/src/App.tsx'), 'utf8')
  const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')

  const group = (id: string, name: string, parentId: string | null = null, presetIds: string[] = [], sequenceIds: string[] = []): PresetGroup =>
    ({ id, name, parentId, exclusive: false, presetIds, sequenceIds })

  it('regression: creating a group never makes cues appear in the palette', () => {
    // Jake's screenshot 2: boot with an empty palette (4 cues exist),
    // create a group called "Colors", and a "Cues · 4" section appeared.
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      cues: ['Warm Welcome', 'Sermon Focus', 'Communion Glow', 'Cue 4'].map((name, i) => ({ id: `sc${i}`, name, fadeMs: 0, fixtureValues: {} }))
    }))
    expect(s().show!.presetGroups ?? []).toEqual([])
    expect(s().presets).toEqual([])
    s().createPresetGroup('Colors')
    expect(s().show!.presetGroups).toHaveLength(1)
    // The group creation touched nothing cue-related.
    expect(s().cues).toHaveLength(4)
    // And the palette has no cue UI at all for it to render into.
    for (const text of ['activateCue', '__scenes__', 'editingCue', 'Cues · {cues.length}']) expect(panel).not.toContain(text)
    // Cue selection still exists, outside the palette: Project Search
    // in the top bar (App) jumps to Design on the found cue.
    expect(app).toContain("result.type === 'cue'")
  })

  it('drag-and-drop: dragover checks drag types only, payload is read on drop', () => {
    // Root cause of "cannot drag a preset into a folder": the old code
    // called getData() during dragover, which Chromium returns empty for
    // until the drop — so preventDefault() was never called and the
    // browser never allowed the drop. LiveWorkspace already did it right.
    expect(panel).toContain('allowPaletteDrop(event)')
    expect(panel).toContain("event.dataTransfer.types.includes(PALETTE_DRAG_MIME)")
    expect(panel).not.toContain('if (readPaletteDrag(event))')
    expect(panel).toContain('applyPaletteDrop')
  })

  it('resolvePaletteDrop: preset into folder, sequence into folder, preset out to root', () => {
    const groups = [group('g1', 'Colors'), group('g2', 'Worship', null, ['p1'], ['s1'])]
    const into = resolvePaletteDrop({ kind: 'preset', id: 'p1' }, 'g1', groups)
    expect(into?.find((g) => g.id === 'g1')?.presetIds).toEqual(['p1'])
    expect(into?.find((g) => g.id === 'g2')?.presetIds).toEqual([])
    const seqInto = resolvePaletteDrop({ kind: 'sequence', id: 's1' }, 'g1', groups)
    expect(seqInto?.find((g) => g.id === 'g1')?.sequenceIds).toEqual(['s1'])
    expect(seqInto?.find((g) => g.id === 'g2')?.sequenceIds).toEqual([])
    const out = resolvePaletteDrop({ kind: 'preset', id: 'p1' }, null, groups)
    expect(out?.find((g) => g.id === 'g2')?.presetIds).toEqual([])
    // No-op drops change nothing and return null (caller skips the write).
    expect(resolvePaletteDrop({ kind: 'preset', id: 'p1' }, 'g2', groups)).toBeNull()
    expect(resolvePaletteDrop({ kind: 'preset', id: 'p9' }, null, groups)).toBeNull()
  })

  it('resolvePaletteDrop: nested groups work, cycles are rejected, reorder before a row works', () => {
    const groups = [group('outer', 'Outer Arc'), group('inner', 'Colors', 'outer'), group('leaf', 'Spots', 'inner', ['p1', 'p2'])]
    // Nesting a group under another group (LightKey: Outer Arc > Colors).
    const nested = resolvePaletteDrop({ kind: 'group', id: 'leaf' }, 'outer', groups)
    expect(nested?.find((g) => g.id === 'leaf')?.parentId).toBe('outer')
    // A group cannot be dropped into itself or one of its descendants.
    expect(resolvePaletteDrop({ kind: 'group', id: 'outer' }, 'inner', groups)).toBeNull()
    expect(resolvePaletteDrop({ kind: 'group', id: 'outer' }, 'outer', groups)).toBeNull()
    // Dragging a group back to the root un-nests it.
    expect(resolvePaletteDrop({ kind: 'group', id: 'inner' }, null, groups)?.find((g) => g.id === 'inner')?.parentId).toBeNull()
    // Dropping p2 onto p1 reorders it before p1, inside the same group.
    const reordered = resolvePaletteDrop({ kind: 'preset', id: 'p2' }, 'leaf', groups, { kind: 'preset', id: 'p1' })
    expect(reordered?.find((g) => g.id === 'leaf')?.presetIds).toEqual(['p2', 'p1'])
  })

  it('applyPaletteDrop (store): a drop lands in the group and survives as one undoable write', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      presets: [{ id: 'p1', name: 'Turquoise', category: 'color', fixtureValues: {} }],
      sequences: [{ id: 's1', name: 'Chase', steps: [] }]
    }))
    s().createPresetGroup('Colors')
    const groupId = s().show!.presetGroups!.at(-1)!.id
    const drag: PaletteDragItem = { kind: 'preset', id: 'p1' }
    s().applyPaletteDrop(drag, groupId)
    expect(s().show!.presetGroups![0].presetIds).toEqual(['p1'])
    s().applyPaletteDrop({ kind: 'sequence', id: 's1' }, groupId)
    expect(s().show!.presetGroups![0].sequenceIds).toEqual(['s1'])
    s().applyPaletteDrop(drag, null)
    expect(s().show!.presetGroups![0].presetIds).toEqual([])
    s().undo()
    expect(s().show!.presetGroups![0].presetIds).toEqual(['p1'])
  })

  it('in-place preset edit: session selects and activates the preset, edits write to it, Save keeps, Cancel restores', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({
      fixtures: ['a', 'b'].map((id, i) => ({ id, name: id, type: 'par', channelStart: 1 + i * 4, channels: 4 })),
      cues: [{ id: 'sc', name: 'S', fadeMs: 0, fixtureValues: { a: { intensity: 255, red: 100 }, b: { red: 120 } } }],
      presets: [{ id: 'p', name: 'Turquoise', category: 'color', fixtureValues: { a: { red: 1 }, b: { red: 2 } } }]
    }))
    s().activateCue('sc')
    expect(s().activePresetIds).toEqual([])
    s().startEditingPreset('p')
    expect(s().editingPresetId).toBe('p')
    expect(s().selectedFixtureIds).toEqual(['a', 'b'])
    expect(s().activePresetIds).toEqual(['p'])
    // Design writes go to the preset, never to the cue.
    s().updateEditingPresetValues({ red: 200 })
    expect(s().presets[0].fixtureValues).toEqual({ a: { red: 200 }, b: { red: 200 } })
    expect(s().cues[0].fixtureValues.a.red).toBe(100)
    // Undo still works on an edit.
    s().undo()
    expect(s().presets[0].fixtureValues.a.red).toBe(1)
    s().updateEditingPresetValues({ red: 200 })
    // Save ends the session and keeps the edits (and the preset applied).
    s().saveEditingPreset()
    expect(s().editingPresetId).toBeNull()
    expect(s().presets[0].fixtureValues.a.red).toBe(200)
    expect(s().activePresetIds).toEqual(['p'])
    // Cancel restores the snapshot: values, active presets, selection.
    s().startEditingPreset('p')
    s().updateEditingPresetValues({ red: 50, green: 90 })
    s().cancelEditingPreset()
    expect(s().editingPresetId).toBeNull()
    expect(s().presets[0].fixtureValues).toEqual({ a: { red: 200 }, b: { red: 200 } })
    expect(s().activePresetIds).toEqual(['p'])
    // A preset that was not active before editing is not active after Cancel.
    s().togglePreset('p')
    s().startEditingPreset('p')
    expect(s().activePresetIds).toEqual(['p'])
    s().cancelEditingPreset()
    expect(s().activePresetIds).toEqual([])
  })

  it('in-place preset edit: unknown id and no session are no-ops; deleting the preset ends the session', () => {
    const s = () => useShowStore.getState()
    s().setShow(migrateShow({ presets: [{ id: 'p', name: 'P', category: 'color', fixtureValues: {} }] }))
    s().startEditingPreset('missing')
    expect(s().editingPresetId).toBeNull()
    s().updateEditingPresetValues({ red: 9 })
    expect(s().presets[0].fixtureValues).toEqual({})
    s().startEditingPreset('p')
    s().deletePreset('p')
    expect(s().editingPresetId).toBeNull()
    expect(s().presets).toEqual([])
  })

  it('Edit opens the in-place editor, and the top bar shows name + Save / Cancel', () => {
    // Right-click → Edit routes through editItem, not the old inline
    // contents expansion; the palette row highlights the preset being
    // edited with its own Cancel (LightKey's yellow row).
    expect(panel).toContain('startEditingPreset(item.id)')
    expect(panel).toContain('cancelEditingPreset()')
    expect(panel).toContain('bg-yellow-400')
    // Design routes its controls into the preset while editing.
    expect(design).toContain('updateEditingPresetValues')
    expect(design).toContain('Editing preset')
    // App shows the LightKey-style pill in the top bar.
    expect(app).toContain('editingPresetId')
    expect(app).toContain('bg-yellow-400')
    expect(app).toContain('Cancel preset edit')
  })
})
