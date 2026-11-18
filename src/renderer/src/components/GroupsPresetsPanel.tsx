import { useEffect, useMemo, useRef, useState } from 'react'
import { SequenceEditor } from './SequenceEditor'
import { PresetContents } from './PresetContents'
import { useShowStore } from '../stores/showStore'
import { encodeLiveDrop, LIVE_DROP_MIME, LEGACY_PRESET_MIME, type LiveDropPayload } from '../lib/liveDrops'
import { exportPresetPalette, importPresetPalette, serializePresetPalette } from '../lib/presetPaletteIo'
import type { PresetCategory, PresetGroup } from '@shared/types'

// LightKey Preset Palette (18 Nov 2026, Jake's screenshots): ONE combined
// tree in the right sidebar — presets of every kind (colour, movement,
// dimmer, effects) and sequences/chases in the same browser, under groups
// the user creates. There are NO standard folders: no hardcoded Colors /
// Positions / Zoom / Spots / Outer Arc / Inner Arc, no "Fixture groups",
// no split "Presets" / "Sequences" sections with explanatory paragraphs.
// A new/empty project shows an empty tree with a short prompt; the user
// creates whatever groups they want (New Group, New Group From Selection).
// Existing data is never lost: presets/sequences already in a project stay,
// shown under the groups the user already made, or ungrouped at the root.
//
// What used to live here and where it went:
// - "Fixture groups / Manage" — moved to the Patch tool panel
//   (FixtureGroups), where fixture patching lives; the palette is for
//   presets/sequences, not fixtures.
// - Cues (stored looks) — LightKey has NO "scene" concept (Guide ch.9:
//   presets and sequences are the building blocks; a cue is a complete
//   look composed from presets), so cues never appear in the palette —
//   the palette is presets and sequences only. A previous version kept a
//   collapsed "Scenes" row at the bottom, gated on the tree being
//   non-empty — so creating any group made a "Scenes" section appear out
//   of nowhere (18 Nov 2026 bug, Jake's screenshot 2). Cue selection
//   lives outside the palette: Project Search in the top bar (finds cues
//   by name), number keys 1–9, and Live page buttons. The header menu
//   keeps "Convert cues to presets" so legacy looks can be moved into
//   presets.
// - Effects — the palette was their only toggle UI, so they stay as
//   leaf rows at the tree root (no heading), click to toggle.
// - Export JSON / Import JSON / Convert cues to presets — kept, in the header
//   "⋯" menu; LightKey has no such buttons in its palette.
// - "New Preset" / "New Preset With Snapshot" / "New Sequence" — new UI
//   wired to the existing capturePreset / updatePresetFromCurrent /
//   createSequence store actions (there was no "new preset" UI before).

/** Drag format for moving palette items between groups (palette-internal). */
const PALETTE_DRAG_MIME = 'application/x-openlights-palette-item'

type PaletteItemKind = 'preset' | 'sequence' | 'group' | 'effect'
interface PaletteItem { kind: PaletteItemKind; id: string }
interface PaletteDrag { kind: 'preset' | 'sequence' | 'group'; id: string }

const CATEGORY_LABELS: { value: PresetCategory; label: string }[] = [
  { value: 'color', label: 'Colour' },
  { value: 'position', label: 'Position' },
  { value: 'intensity', label: 'Intensity' },
  { value: 'other', label: 'Other' }
]

export function GroupsPresetsPanel() {
  const {
    show,
    cues,
    presets,
    activePresetIds,
    activeSequenceIds,
    togglePreset,
    effects,
    activeCueId,
    selectedFixtureIds,
    updateEffect,
    removeEffect,
    capturePreset,
    updatePresetFromCurrent,
    editingPresetId,
    startEditingPreset,
    cancelEditingPreset,
    applyPaletteDrop,
    renamePreset,
    deletePreset,
    duplicatePreset,
    applyPresetsToOverrides,
    addOverridesToPresets,
    createPresetGroup,
    updatePresetGroup,
    assignPresetGroup,
    assignSequenceGroup,
    deletePresetGroup,
    createSequence,
    updateSequence,
    duplicateSequence,
    deleteSequence,
    toggleSequence,
    stopSequences,
    convertCuesToPresets,
    updateProject
  } = useShowStore()
  const groups = show?.presetGroups ?? []
  const sequences = show?.sequences ?? []
  const [search, setSearch] = useState('')
  const [paletteNote, setPaletteNote] = useState('')
  const paletteFile = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<PaletteItem[]>([])
  const [renaming, setRenaming] = useState<PaletteItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [propertiesId, setPropertiesId] = useState<string | null>(null)
  const [expandedSequenceId, setExpandedSequenceId] = useState<string | null>(null)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: PaletteItem | null } | null>(null)
  const [composer, setComposer] = useState<{ type: 'preset' | 'preset-snapshot' | 'group' | 'sequence'; fromSelection?: boolean; parentGroupId?: string | null } | null>(null)
  const [composerName, setComposerName] = useState('')
  const [composerCategory, setComposerCategory] = useState<PresetCategory>('color')
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenu && !headerMenu) return
    const close = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setContextMenu(null); setHeaderMenu(false) }
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [contextMenu, headerMenu])

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ x: number; y: number }>).detail
      if (!detail) return
      setSelected([])
      setHeaderMenu(false)
      setContextMenu({ x: detail.x, y: detail.y, target: null })
    }
    window.addEventListener('openlights-preset-palette-context', open)
    return () => window.removeEventListener('openlights-preset-palette-context', open)
  }, [])

  // --- membership helpers -------------------------------------------------
  const groupOfPreset = (presetId: string) => groups.find((g) => g.presetIds.includes(presetId))
  const groupOfSequence = (sequenceId: string) => groups.find((g) => (g.sequenceIds ?? []).includes(sequenceId))
  const ungroupedPresets = presets.filter((p) => !groupOfPreset(p.id))
  const ungroupedSequences = sequences.filter((s) => !groupOfSequence(s.id))
  const isCollapsed = (id: string) => collapsed[id] === true
  const toggleCollapsed = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  const isSelected = (item: PaletteItem) => selected.some((s) => s.kind === item.kind && s.id === item.id)
  const selectItem = (item: PaletteItem, additive: boolean) => {
    setSelected((prev) => additive
      ? isSelected(item) ? prev.filter((s) => !(s.kind === item.kind && s.id === item.id)) : [...prev, item]
      : [item])
  }

  // --- palette file exchange (header menu) --------------------------------
  const exportPalette = () => {
    try {
      const doc = exportPresetPalette(presets, show?.fixtures ?? [])
      const url = URL.createObjectURL(new Blob([serializePresetPalette(doc)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'openlights-preset-palette.json'
      a.click()
      URL.revokeObjectURL(url)
      setPaletteNote(`Exported ${presets.length} preset${presets.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setPaletteNote(`Export failed: ${String(error)}`)
    }
  }
  const importPalette = async (text: string) => {
    try {
      const result = importPresetPalette(text, show?.fixtures ?? [], {
        onSkip: (info) => console.warn(`Preset palette: skipped fixture ${info.fixtureName} (${info.fixtureId}) — ${info.reason}`)
      })
      updateProject({ presets: [...presets, ...result.presets] })
      const skipped = result.skipped.length
      setPaletteNote(`Imported ${result.presets.length} preset${result.presets.length === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} fixture${skipped === 1 ? '' : 's'} (see console)` : ''}.`)
    } catch (error) {
      setPaletteNote(`Import failed: ${String(error)}`)
    }
  }

  // --- creation ------------------------------------------------------------
  const createFromComposer = () => {
    const name = composerName.trim()
    if (!composer || !name) return
    if (composer.type === 'preset' || composer.type === 'preset-snapshot') {
      if (!activeCueId || !selectedFixtureIds.length) {
        setPaletteNote('Select fixtures in Design first, then capture a preset from the current look.')
        return
      }
      // capturePreset silently does nothing when no fixture value passes
      // the category filter, so only claim success when a preset was
      // actually added — the old code always said "created".
      const before = useShowStore.getState().presets.length
      capturePreset(name, composerCategory)
      if (composer.type === 'preset-snapshot') {
        // "New Preset With Snapshot": capture, then snapshot the current
        // look into the preset just created (it is appended last).
        const created = useShowStore.getState().presets.at(-1)
        if (created) updatePresetFromCurrent(created.id)
      }
      if (useShowStore.getState().presets.length > before) setPaletteNote(`Preset “${name}” created.`)
      else setPaletteNote(`Could not capture a preset — the selected fixtures have no values for this category.`)
    } else if (composer.type === 'group') {
      createPresetGroup(name, composer.parentGroupId ?? null)
      setPaletteNote(`Group “${name}” created.`)
      if (composer.fromSelection) {
        const created = useShowStore.getState().show?.presetGroups?.at(-1)
        if (created) {
          for (const item of selected) {
            if (item.kind === 'preset') assignPresetGroup(item.id, created.id)
            else if (item.kind === 'sequence') assignSequenceGroup(item.id, created.id)
          }
        }
      }
      setSelected([])
    } else if (composer.type === 'sequence') {
      createSequence(name)
      const created = useShowStore.getState().show?.sequences?.at(-1)
      if (created) {
        if (composer.fromSelection) {
          // "New Sequence From Selection": step 1 plays the selected presets.
          const presetIds = selected.filter((item) => item.kind === 'preset').map((item) => item.id)
          if (presetIds.length && created.steps[0]) updateSequence(created.id, { steps: [{ ...created.steps[0], presetIds }] })
        }
        setExpandedSequenceId(created.id)
      }
      setSelected([])
    }
    setComposer(null)
    setComposerName('')
  }

  // --- context-menu actions ------------------------------------------------
  const startRename = (item: PaletteItem, currentName: string) => { setRenaming(item); setRenameValue(currentName) }
  const commitRename = () => {
    if (!renaming) return
    const name = renameValue.trim()
    if (name) {
      if (renaming.kind === 'preset') renamePreset(renaming.id, name)
      else if (renaming.kind === 'sequence') updateSequence(renaming.id, { name })
      else if (renaming.kind === 'group') updatePresetGroup(renaming.id, { name })
    }
    setRenaming(null)
  }
  const openProperties = (item: PaletteItem) => {
    if (item.kind === 'preset') setPropertiesId((prev) => prev === item.id ? null : item.id)
    else if (item.kind === 'sequence') setExpandedSequenceId((prev) => prev === item.id ? null : item.id)
    else if (item.kind === 'group') setCollapsed((prev) => ({ ...prev, [item.id]: false }))
  }
  // Right-click → Edit (LightKey, Guide ch.9): a preset opens in place in
  // Design — top bar shows its name with Save/Cancel, the preview shows
  // the look, the bottom panel edits its values. A sequence opens its
  // existing SequenceEditor; a group renames inline (LightKey's Return =
  // Rename). Nothing here opens a menu. "Show Properties" (openProperties
  // above) still expands the inline contents list for presets.
  const editItem = (item: PaletteItem) => {
    if (item.kind === 'preset') startEditingPreset(item.id)
    else if (item.kind === 'sequence') setExpandedSequenceId(item.id)
    else if (item.kind === 'group') {
      const label = groups.find((g) => g.id === item.id)?.name
      if (label) startRename(item, label)
    }
  }
  const deleteItem = (item: PaletteItem, label: string) => {
    if (!confirm(`Delete ${item.kind} “${label}”?`)) return
    if (item.kind === 'preset') deletePreset(item.id)
    else if (item.kind === 'sequence') deleteSequence(item.id)
    else if (item.kind === 'group') deletePresetGroup(item.id)
    else if (item.kind === 'effect') removeEffect(item.id)
    setSelected((prev) => prev.filter((s) => !(s.kind === item.kind && s.id === item.id)))
  }
  const newGroupFromSelection = () => setComposer({ type: 'group', fromSelection: true })
  const newSequenceFromSelection = () => setComposer({ type: 'sequence', fromSelection: true })

  // --- drag & drop inside the palette --------------------------------------
  // In Chromium/Electron, dataTransfer.getData() returns '' during
  // dragover — the payload is only readable on drop. The old code called
  // getData() inside every dragover handler to decide whether to allow
  // the drop, so it always returned null, preventDefault() was never
  // called, and the browser never permitted a drop onto a folder — that
  // is why Jake could not drag a preset into a folder (18 Nov 2026).
  // Dragover now checks only the drag *types* (like LiveWorkspace does);
  // the payload is read only in the drop handlers below.
  const paletteDrag = (event: React.DragEvent, drag: PaletteDrag) => {
    event.dataTransfer.setData(PALETTE_DRAG_MIME, JSON.stringify(drag))
    event.dataTransfer.effectAllowed = 'copyMove'
  }
  const hasPaletteDrag = (event: React.DragEvent) => event.dataTransfer.types.includes(PALETTE_DRAG_MIME)
  const allowPaletteDrop = (event: React.DragEvent) => {
    if (!hasPaletteDrag(event)) return false
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    return true
  }
  const readPaletteDrag = (event: React.DragEvent): PaletteDrag | null => {
    // Only called from drop handlers: getData() works on drop.
    if (!event.dataTransfer.types.includes(PALETTE_DRAG_MIME)) return null
    try {
      const raw: unknown = JSON.parse(event.dataTransfer.getData(PALETTE_DRAG_MIME))
      if (raw && typeof raw === 'object' && ['preset', 'sequence', 'group'].includes((raw as { kind: string }).kind) && typeof (raw as { id: string }).id === 'string') return raw as PaletteDrag
    } catch { /* not a palette drag */ }
    return null
  }
  /** Drop onto a group (or the tree root): move the dragged item there. */
  const dropOntoGroup = (event: React.DragEvent, targetGroupId: string | null) => {
    const drag = readPaletteDrag(event)
    if (!drag) return
    event.preventDefault(); event.stopPropagation(); setDragOverId(null)
    applyPaletteDrop(drag, targetGroupId)
  }
  /** Drop onto a preset/sequence row: move into its group, before that row. */
  const dropOntoItem = (event: React.DragEvent, target: PaletteItem, targetGroupId: string | null) => {
    const drag = readPaletteDrag(event)
    if (!drag || drag.id === target.id) return
    event.preventDefault(); event.stopPropagation(); setDragOverId(null)
    if ((drag.kind === 'preset' && target.kind === 'preset') || (drag.kind === 'sequence' && target.kind === 'sequence')) {
      applyPaletteDrop(drag, targetGroupId, { kind: target.kind, id: target.id })
      return
    }
    applyPaletteDrop(drag, targetGroupId)
  }
  // Clear the drop highlight only when the pointer truly leaves the row,
  // not when it moves between the row's own children.
  const clearDragOver = (event: React.DragEvent, id: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverId((prev) => prev === id ? null : prev)
  }

  // --- keyboard navigation (LightKey Preset Palette shortcuts) -------------
  // Flat visible rows, in display order, for arrow-key navigation.
  const flatRows = useMemo((): PaletteItem[] => {
    const rows: PaletteItem[] = []
    const query = search.trim().toLowerCase()
    const matches = (label: string) => !query || label.toLowerCase().includes(query)
    const walk = (parentId: string | null) => {
      for (const group of groups.filter((g) => (g.parentId ?? null) === parentId)) {
        if (matches(group.name)) rows.push({ kind: 'group', id: group.id })
        if (!isCollapsed(group.id) || query) {
          for (const presetId of group.presetIds) {
            const preset = presets.find((p) => p.id === presetId)
            if (preset && matches(preset.name)) rows.push({ kind: 'preset', id: preset.id })
          }
          for (const sequenceId of group.sequenceIds ?? []) {
            const sequence = sequences.find((s) => s.id === sequenceId)
            if (sequence && matches(sequence.name)) rows.push({ kind: 'sequence', id: sequence.id })
          }
          walk(group.id)
        }
      }
    }
    walk(null)
    for (const preset of ungroupedPresets) if (matches(preset.name)) rows.push({ kind: 'preset', id: preset.id })
    for (const sequence of ungroupedSequences) if (matches(sequence.name)) rows.push({ kind: 'sequence', id: sequence.id })
    for (const effect of effects) if (matches(effect.name)) rows.push({ kind: 'effect', id: effect.id })
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, presets, sequences, effects, search, collapsed])

  const onTreeKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (mod && key === 'n' && !event.shiftKey) {
      // Cmd/Ctrl+N is "New project" globally; inside the palette it is
      // LightKey's "New preset". Stop it reaching the global handler.
      event.preventDefault(); event.stopPropagation()
      setComposer({ type: 'preset' })
      return
    }
    if (mod && key === 'n' && event.shiftKey) {
      event.preventDefault(); event.stopPropagation()
      setComposer({ type: 'group' })
      return
    }
    if (mod && shiftKey(event) && key === 'e') {
      event.preventDefault(); event.stopPropagation()
      const first = selected[0]
      if (first) editItem(first)
      return
    }
    if (event.key === 'Escape') {
      // Stop here so the global Esc handler does not also stop a cue.
      event.preventDefault(); event.stopPropagation()
      setSelected([]); setContextMenu(null); setComposer(null); setRenaming(null)
      return
    }
    if (event.key === 'Enter' && selected.length === 1) {
      const item = selected[0]
      const label = item.kind === 'preset' ? presets.find((p) => p.id === item.id)?.name
        : item.kind === 'sequence' ? sequences.find((s) => s.id === item.id)?.name
        : item.kind === 'group' ? groups.find((g) => g.id === item.id)?.name : undefined
      if (label) { event.preventDefault(); event.stopPropagation(); startRename(item, label) }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Stop here so the Live Edit arrow handler does not also nudge a
      // selected Live button while navigating the palette.
      event.preventDefault(); event.stopPropagation()
      if (!flatRows.length) return
      const current = selected.length === 1 ? flatRows.findIndex((r) => r.kind === selected[0].kind && r.id === selected[0].id) : -1
      const next = event.key === 'ArrowDown' ? Math.min(flatRows.length - 1, current + 1) : Math.max(0, current - 1)
      const row = flatRows[next]
      if (row) { setSelected([row]); treeRef.current?.querySelector<HTMLElement>(`[data-palette-row="${row.kind}:${row.id}"]`)?.focus() }
    }
  }
  function shiftKey(event: React.KeyboardEvent) { return event.shiftKey }

  // --- row rendering --------------------------------------------------------
  const query = search.trim().toLowerCase()
  const matchesQuery = (label: string) => !query || label.toLowerCase().includes(query)

  const dragPayloadFor = (item: PaletteItem): LiveDropPayload | null => {
    if (item.kind === 'preset') {
      const preset = presets.find((p) => p.id === item.id)
      return preset ? { presetIds: [preset.id], sequenceIds: [], presetNames: { [preset.id]: preset.name } } : null
    }
    if (item.kind === 'sequence') {
      const sequence = sequences.find((s) => s.id === item.id)
      return sequence ? { presetIds: [], sequenceIds: [sequence.id], sequenceNames: { [sequence.id]: sequence.name } } : null
    }
    return null
  }

  const rowContextMenu = (event: React.MouseEvent, item: PaletteItem) => {
    event.preventDefault(); event.stopPropagation()
    if (!isSelected(item)) setSelected([item])
    setContextMenu({ x: event.clientX, y: event.clientY, target: item })
  }

  const renameInput = (item: PaletteItem) => (
    <input
      autoFocus
      aria-label={`Rename ${item.kind}`}
      value={renameValue}
      onChange={(event) => setRenameValue(event.target.value)}
      onBlur={commitRename}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') commitRename(); else if (event.key === 'Escape') setRenaming(null) }}
      onClick={(event) => event.stopPropagation()}
      className="min-w-0 flex-1 rounded bg-bg px-1 py-0.5 text-xs"
    />
  )

  const presetRow = (presetId: string, parentGroupId: string | null) => {
    const preset = presets.find((p) => p.id === presetId)
    if (!preset || !matchesQuery(preset.name)) return null
    const item: PaletteItem = { kind: 'preset', id: preset.id }
    const payload = dragPayloadFor(item)!
    const active = activePresetIds.includes(preset.id)
    // LightKey highlights the preset being edited in yellow, with Cancel
    // next to it (Jake's 18 Nov screenshot 4).
    const editing = editingPresetId === preset.id
    return (
      <div key={preset.id} data-palette-row={`preset:${preset.id}`} tabIndex={-1}
        className={`group flex flex-col rounded ${isSelected(item) ? 'bg-panel2' : ''} ${dragOverId === preset.id ? 'outline outline-1 outline-[var(--accent)]' : ''}`}>
        <div
          className="flex items-center gap-1 pr-1"
          draggable
          onDragStart={(event) => {
            paletteDrag(event, { kind: 'preset', id: preset.id })
            event.dataTransfer.setData(LIVE_DROP_MIME, encodeLiveDrop(payload))
            event.dataTransfer.setData(LEGACY_PRESET_MIME, preset.id)
          }}
          onDragOver={(event) => { if (allowPaletteDrop(event)) setDragOverId(preset.id) }}
          onDragLeave={(event) => clearDragOver(event, preset.id)}
          onDrop={(event) => dropOntoItem(event, item, parentGroupId)}
          onClick={(event) => { selectItem(item, event.shiftKey); if (!editing) togglePreset(preset.id) }}
          onDoubleClick={() => openProperties(item)}
          onContextMenu={(event) => rowContextMenu(event, item)}
          role="treeitem"
          aria-selected={isSelected(item)}
          title={`${preset.category} · ${Object.keys(preset.fixtureValues).length} fixtures — drag onto a Live page in Edit mode to add a button, or onto a folder to move it there`}
        >
          <button type="button" className={`min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${editing ? 'bg-yellow-400 font-semibold text-black' : active ? 'selected' : 'hover:bg-panel2'}`}>
            <span className="dot" style={{ backgroundColor: editing ? '#111' : preset.category === 'color' ? '#f2aaee' : '#a4c4f6' }} />
            {renaming?.kind === 'preset' && renaming.id === preset.id ? renameInput(item) : <span className="truncate">{preset.name}</span>}
            {active && !editing && <span className="ml-auto text-[9px] uppercase tracking-wider text-dim">on</span>}
          </button>
          {editing && <button type="button" aria-label={`Cancel editing ${preset.name}`} className="rounded px-1.5 py-1 text-[10px] font-semibold text-black bg-yellow-400 hover:bg-yellow-300" onClick={(event) => { event.stopPropagation(); cancelEditingPreset() }}>Cancel</button>}
        </div>
        {propertiesId === preset.id && <div className="pl-4 pr-1 pb-1"><PresetContents preset={preset} /></div>}
      </div>
    )
  }

  const sequenceRow = (sequenceId: string, parentGroupId: string | null) => {
    const sequence = sequences.find((s) => s.id === sequenceId)
    if (!sequence || !matchesQuery(sequence.name)) return null
    const item: PaletteItem = { kind: 'sequence', id: sequence.id }
    const payload = dragPayloadFor(item)!
    const running = activeSequenceIds.includes(sequence.id)
    const expanded = expandedSequenceId === sequence.id
    return (
      <div key={sequence.id} data-palette-row={`sequence:${sequence.id}`} tabIndex={-1}
        className={`group flex flex-col rounded ${isSelected(item) ? 'bg-panel2' : ''} ${dragOverId === sequence.id ? 'outline outline-1 outline-[var(--accent)]' : ''}`}>
        <div
          className="flex items-center gap-1 pr-1"
          draggable
          onDragStart={(event) => {
            paletteDrag(event, { kind: 'sequence', id: sequence.id })
            event.dataTransfer.setData(LIVE_DROP_MIME, encodeLiveDrop(payload))
          }}
          onDragOver={(event) => { if (allowPaletteDrop(event)) setDragOverId(sequence.id) }}
          onDragLeave={(event) => clearDragOver(event, sequence.id)}
          onDrop={(event) => dropOntoItem(event, item, parentGroupId)}
          onClick={(event) => { selectItem(item, event.shiftKey); setExpandedSequenceId(expanded ? null : sequence.id) }}
          onContextMenu={(event) => rowContextMenu(event, item)}
          role="treeitem"
          aria-selected={isSelected(item)}
          title="Drag onto a Live page in Edit mode to add this sequence as a button"
        >
          <button type="button" className={`min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${running ? 'selected' : 'hover:bg-panel2'}`}>
            <span aria-hidden="true">↻</span>
            {renaming?.kind === 'sequence' && renaming.id === sequence.id ? renameInput(item) : <span className="truncate">{sequence.name} · {sequence.steps.length} step{sequence.steps.length === 1 ? '' : 's'}{running ? ' · running' : ''}</span>}
          </button>
          <button type="button" aria-label={`${running ? 'Stop' : 'Run'} sequence ${sequence.name}`} className="rounded px-1.5 py-1 text-[10px] text-dim hover:bg-panel2 hover:text-text" onClick={(event) => { event.stopPropagation(); toggleSequence(sequence.id) }}>{running ? 'Stop' : 'Run'}</button>
        </div>
        {expanded && <div className="pl-2 pr-1"><SequenceEditor sequenceId={sequence.id} /></div>}
      </div>
    )
  }

  // A group is shown for a search query when its name matches or any
  // descendant (preset, sequence, subgroup) matches.
  const groupHasMatch = (group: PresetGroup): boolean => {
    if (matchesQuery(group.name)) return true
    if (group.presetIds.some((id) => presets.find((p) => p.id === id && matchesQuery(p.name)))) return true
    if ((group.sequenceIds ?? []).some((id) => sequences.find((s) => s.id === id && matchesQuery(s.name)))) return true
    return groups.filter((g) => (g.parentId ?? null) === group.id).some((child) => groupHasMatch(child))
  }

  const groupRow = (group: PresetGroup, depth: number): React.ReactNode => {
    if (query && !groupHasMatch(group)) return null
    const item: PaletteItem = { kind: 'group', id: group.id }
    const collapsedGroup = isCollapsed(group.id) && !query
    const children = (
      <>
        {group.presetIds.map((id) => presetRow(id, group.id))}
        {(group.sequenceIds ?? []).map((id) => sequenceRow(id, group.id))}
        {groups.filter((g) => (g.parentId ?? null) === group.id).map((child) => groupRow(child, depth + 1))}
      </>
    )
    return (
      <div key={group.id} data-palette-row={`group:${group.id}`} tabIndex={-1}
        className={`flex flex-col rounded ${isSelected(item) ? 'bg-panel2' : ''} ${dragOverId === group.id ? 'outline outline-1 outline-[var(--accent)] bg-[var(--accent)]/10' : ''}`}
        style={{ marginLeft: depth * 8 }}
        onDragOver={(event) => { if (allowPaletteDrop(event)) setDragOverId(group.id) }}
        onDragLeave={(event) => clearDragOver(event, group.id)}
        onDrop={(event) => dropOntoGroup(event, group.id)}
      >
        <div
          className="flex items-center gap-1 pr-1"
          draggable
          onDragStart={(event) => paletteDrag(event, { kind: 'group', id: group.id })}
          onClick={(event) => { selectItem(item, event.shiftKey); toggleCollapsed(group.id) }}
          onContextMenu={(event) => rowContextMenu(event, item)}
          role="treeitem"
          aria-selected={isSelected(item)}
          aria-expanded={!collapsedGroup}
        >
          <button type="button" className="min-w-0 flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-panel2">
            <span className="inline-block transition-transform" style={{ transform: collapsedGroup ? 'none' : 'rotate(90deg)' }}>▸</span>
            <span aria-hidden="true">📁</span>
            {renaming?.kind === 'group' && renaming.id === group.id ? renameInput(item) : <span className="truncate font-semibold">{group.name}</span>}
            <span className="ml-auto rounded bg-panel2 px-1.5 py-0.5 text-[9px] text-dim">{group.presetIds.length + (group.sequenceIds ?? []).length}</span>
          </button>
        </div>
        {!collapsedGroup && <div className="flex flex-col gap-0.5 py-0.5 pl-4">{children}</div>}
      </div>
    )
  }

  const empty = !groups.length && !presets.length && !sequences.length && !effects.length
  const runningCount = activeSequenceIds.length

  return (
    <div aria-label="Preset palette panel" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-1" onClick={() => setHeaderMenu(false)} onContextMenu={(event) => {
      if ((event.target as Element).closest('[data-palette-row]')) return
      event.preventDefault(); event.stopPropagation(); setSelected([]); setHeaderMenu(false); setContextMenu({ x: event.clientX, y: event.clientY, target: null })
    }}>
      <div className="flex gap-1 px-1 pb-2">
        <input type="search" aria-label="Search palette" placeholder="Search palette" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 rounded border border-line bg-bg/50 px-2 py-1 text-xs text-text placeholder:text-dim" />
        <div className="relative" ref={menuRef}>
          <button type="button" aria-label="Preset palette menu" title="Preset palette menu" aria-expanded={headerMenu} className="rounded border border-line bg-panel2 px-2 py-1 text-sm text-text" onClick={(event) => { event.stopPropagation(); setHeaderMenu((open) => !open); setContextMenu(null) }}>⋯</button>
          {headerMenu && (
            <div role="menu" aria-label="Preset palette menu" className="absolute right-0 top-full z-[300] mt-1 min-w-52 rounded border border-line bg-panel p-1 shadow-xl">
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { setHeaderMenu(false); setComposer({ type: 'preset' }) }}>New preset</button>
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { setHeaderMenu(false); setComposer({ type: 'preset-snapshot' }) }}>New preset with snapshot</button>
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { setHeaderMenu(false); setComposer({ type: 'group' }) }}>New group</button>
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { setHeaderMenu(false); setComposer({ type: 'sequence' }) }}>New sequence</button>
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { setHeaderMenu(false); setComposer({ type: 'sequence' }); setComposerName('Sequence') }}>Capture sequence</button>
              <div className="my-1 border-t border-line" />
              <button type="button" role="menuitem" disabled={!presets.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { setHeaderMenu(false); exportPalette() }}>Export JSON</button>
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { setHeaderMenu(false); paletteFile.current?.click() }}>Import JSON</button>
              <button type="button" role="menuitem" disabled={!cues.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { setHeaderMenu(false); const added = convertCuesToPresets(); setPaletteNote(added ? `Converted ${added} cue${added === 1 ? '' : 's'} to presets (originals kept).` : 'Cues already converted.') }}>Convert cues to presets</button>
            </div>
          )}
        </div>
        <input ref={paletteFile} type="file" accept="application/json,.json" aria-label="Import preset palette JSON" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await importPalette(await file.text()) }} />
      </div>
      {paletteNote && <span className="px-2 text-[11px] text-dim" role="status">{paletteNote}</span>}
      {runningCount > 0 && (
        <button type="button" className="self-start px-2 text-[11px] text-dim hover:text-text" onClick={stopSequences}>
          Stop all running sequences ({runningCount})
        </button>
      )}
      {composer && (
        <div className="mx-1 flex flex-wrap items-center gap-1 rounded border border-line bg-panel2 p-2">
          <input autoFocus aria-label={composer.type === 'group' ? 'New group name' : composer.type === 'sequence' ? 'New sequence name' : 'New preset name'} placeholder={composer.type === 'group' ? 'Group name' : composer.type === 'sequence' ? 'Sequence name' : 'Preset name'} value={composerName} onChange={(event) => setComposerName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createFromComposer(); else if (event.key === 'Escape') { setComposer(null); setComposerName('') } }} className="min-w-0 flex-1 rounded bg-bg px-2 py-1 text-xs" />
          {(composer.type === 'preset' || composer.type === 'preset-snapshot') && (
            <select aria-label="Preset category" value={composerCategory} onChange={(event) => setComposerCategory(event.target.value as PresetCategory)} className="rounded bg-bg px-1 py-1 text-xs">
              {CATEGORY_LABELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          )}
          <button type="button" className="btn-theme text-xs" disabled={!composerName.trim()} onClick={createFromComposer}>Create</button>
          <button type="button" className="text-xs text-dim" onClick={() => { setComposer(null); setComposerName('') }}>Cancel</button>
          {composer.fromSelection && <span className="w-full text-[10px] text-dim">From the {selected.length} selected item{selected.length === 1 ? '' : 's'}.</span>}
        </div>
      )}
      {empty ? (
        <div className="px-2 py-3 text-[11px] text-dim">
          No presets yet. Right-click here to create a group, preset or sequence — folders are yours to make, none are built in.
        </div>
      ) : (
        <div
          ref={treeRef}
          role="tree"
          aria-label="Preset palette"
          tabIndex={0}
          onKeyDown={onTreeKeyDown}
          onDragOver={(event) => { allowPaletteDrop(event) }}
          onDrop={(event) => dropOntoGroup(event, null)}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-1 outline-none"
        >
          {groups.filter((g) => (g.parentId ?? null) === null).map((group) => groupRow(group, 0))}
          {ungroupedPresets.map((preset) => presetRow(preset.id, null))}
          {ungroupedSequences.map((sequence) => sequenceRow(sequence.id, null))}
          {effects.filter((effect) => matchesQuery(effect.name)).map((effect) => {
            const item: PaletteItem = { kind: 'effect', id: effect.id }
            return (
              <div key={effect.id} data-palette-row={`effect:${effect.id}`} tabIndex={-1} className={`flex items-center gap-1 rounded pr-1 ${isSelected(item) ? 'bg-panel2' : ''}`}>
                <button type="button" role="treeitem" aria-selected={isSelected(item)}
                  className={`min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${effect.enabled ? 'selected' : 'hover:bg-panel2'}`}
                  title={`${effect.attribute} · ${effect.waveform} — click to ${effect.enabled ? 'disable' : 'enable'}`}
                  onClick={(event) => { selectItem(item, event.shiftKey); updateEffect(effect.id, { enabled: !effect.enabled }) }}
                  onContextMenu={(event) => rowContextMenu(event, item)}
                >
                  <span aria-hidden="true">∿</span>
                  <span className="truncate">{effect.name}</span>
                  {effect.enabled && <span className="ml-auto text-[9px] uppercase tracking-wider text-dim">on</span>}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {contextMenu && <PaletteContextMenu
        x={contextMenu.x} y={contextMenu.y} target={contextMenu.target}
        menuRef={menuRef}
        hasSelection={selected.length > 0}
        onClose={() => setContextMenu(null)}
        onAction={(action) => {
          const target = contextMenu.target
          setContextMenu(null)
          if (action === 'new-preset') setComposer({ type: 'preset', parentGroupId: target?.kind === 'group' ? target.id : undefined })
          else if (action === 'new-preset-snapshot') setComposer({ type: 'preset-snapshot', parentGroupId: target?.kind === 'group' ? target.id : undefined })
          else if (action === 'new-group') setComposer({ type: 'group', parentGroupId: target?.kind === 'group' ? target.id : undefined })
          else if (action === 'new-group-from-selection') newGroupFromSelection()
          else if (action === 'new-sequence') setComposer({ type: 'sequence' })
          else if (action === 'new-sequence-from-selection') newSequenceFromSelection()
          else if (!target) return
          else if (action === 'show-properties') openProperties(target)
          else if (action === 'edit') editItem(target)
          else if (action === 'apply') {
            if (target.kind === 'preset') togglePreset(target.id)
            else if (target.kind === 'sequence') toggleSequence(target.id)
          } else if (action === 'add-overrides') {
            if (target.kind === 'preset') addOverridesToPresets([target.id])
          } else if (action === 'rename') {
            const label = target.kind === 'preset' ? presets.find((p) => p.id === target.id)?.name
              : target.kind === 'sequence' ? sequences.find((s) => s.id === target.id)?.name
              : target.kind === 'group' ? groups.find((g) => g.id === target.id)?.name : undefined
            if (label) startRename(target, label)
          } else if (action === 'duplicate') {
            if (target.kind === 'preset') duplicatePreset(target.id)
            else if (target.kind === 'sequence') duplicateSequence(target.id)
          } else if (action === 'delete') {
            const label = target.kind === 'preset' ? presets.find((p) => p.id === target.id)?.name
              : target.kind === 'sequence' ? sequences.find((s) => s.id === target.id)?.name
              : target.kind === 'group' ? groups.find((g) => g.id === target.id)?.name
              : target.kind === 'effect' ? effects.find((e) => e.id === target.id)?.name : undefined
            if (label) deleteItem(target, label)
          }
        }}
      />}
    </div>
  )
}

type PaletteMenuAction =
  | 'show-properties' | 'apply' | 'edit' | 'add-overrides' | 'rename' | 'duplicate' | 'delete'
  | 'new-preset' | 'new-preset-snapshot' | 'new-group' | 'new-group-from-selection'
  | 'new-sequence' | 'new-sequence-from-selection'

// Right-click menu modelled on LightKey's palette menu (Jake's 18 Nov
// screenshot 1): Show Properties, Apply, Edit, Add Overrides, Rename,
// Duplicate, Delete, then New Preset / New Preset With Snapshot / New Group
// / New Group From Selection / New Sequence / New Sequence From Selection.
// Two LightKey items are NOT here: "External Control" — no such feature
// exists in OpenLights — and group "Duplicate" — a preset can belong to
// only one group, so a duplicated group could not share its members.
function PaletteContextMenu({ x, y, target, menuRef, hasSelection, onClose, onAction }: {
  x: number; y: number; target: PaletteItem | null
  menuRef: { current: HTMLDivElement | null }
  hasSelection: boolean
  onClose: () => void
  onAction: (action: PaletteMenuAction) => void
}) {
  const item = (action: PaletteMenuAction, label: string, disabled = false) => (
    <button key={action} type="button" role="menuitem" disabled={disabled}
      className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40"
      onClick={() => onAction(action)}>{label}</button>
  )
  return (
    <div ref={menuRef} role="menu" aria-label="Preset palette actions" className="fixed z-[300] min-w-56 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: x, top: y }}>
      {target && <>
        {item('show-properties', 'Show Properties')}
        {item('apply', target.kind === 'sequence' ? 'Run / Stop' : 'Apply')}
        {item('edit', 'Edit')}
        {target.kind === 'preset' && item('add-overrides', 'Add Overrides')}
        <div className="my-1 border-t border-line" />
        {item('rename', 'Rename')}
        {target.kind !== 'group' && target.kind !== 'effect' && item('duplicate', 'Duplicate')}
        {item('delete', 'Delete')}
        <div className="my-1 border-t border-line" />
      </>}
      {item('new-preset', 'New Preset')}
      {item('new-preset-snapshot', 'New Preset With Snapshot')}
      {item('new-group', 'New Group')}
      {item('new-group-from-selection', 'New Group From Selection', !hasSelection)}
      {item('new-sequence', 'New Sequence')}
      {item('new-sequence-from-selection', 'New Sequence From Selection', !hasSelection)}
      <div className="my-1 border-t border-line" />
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={onClose}>Close</button>
    </div>
  )
}
