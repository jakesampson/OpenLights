export interface ShortcutInput {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}
export function isEditingText(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  return Boolean(target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? ''))
}
export function historyShortcut(event: ShortcutInput, target: { tagName?: string; isContentEditable?: boolean } | null): 'undo' | 'redo' | null {
  if (isEditingText(target) || event.altKey || !(event.ctrlKey || event.metaKey)) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  return key === 'y' && !event.shiftKey ? 'redo' : null
}

export interface ShortcutBinding { key: string; label: string; command: string; code: string; ctrl?: boolean; shift?: boolean; alt?: boolean }
export const SHORTCUTS: ShortcutBinding[] = [
  { key: 'Ctrl+=', label: 'Zoom in', command: 'zoomIn', code: '=', ctrl: true },
  { key: 'Ctrl+-', label: 'Zoom out', command: 'zoomOut', code: '-', ctrl: true },
  { key: 'Ctrl+0', label: 'Zoom to fit', command: 'zoomFit', code: '0', ctrl: true },
  { key: 'Ctrl+Shift+0', label: 'Zoom to selection', command: 'zoomSelection', code: '0', ctrl: true, shift: true },
  { key: 'Ctrl+Z', label: 'Undo', command: 'undo', code: 'z', ctrl: true },
  { key: 'Ctrl+Y', label: 'Redo', command: 'redo', code: 'y', ctrl: true },
  { key: 'Ctrl+Shift+Z', label: 'Redo', command: 'redo', code: 'z', ctrl: true, shift: true },
  { key: 'Ctrl+S', label: 'Save project', command: 'save', code: 's', ctrl: true },
  { key: 'Ctrl+Shift+S', label: 'Save project as', command: 'saveAs', code: 's', ctrl: true, shift: true },
  { key: 'Ctrl+O', label: 'Open project', command: 'open', code: 'o', ctrl: true },
  { key: 'Ctrl+N', label: 'New project', command: 'new', code: 'n', ctrl: true },
  { key: 'Ctrl+W', label: 'Close project', command: 'close', code: 'w', ctrl: true },
  { key: 'Ctrl+D', label: 'Design view', command: 'design', code: 'd', ctrl: true },
  { key: 'Ctrl+L', label: 'Live view', command: 'live', code: 'l', ctrl: true },
  { key: 'Ctrl+J', label: 'Edit preview', command: 'editPreview', code: 'j', ctrl: true },
  // Show overridden properties (Guide ch.11, p.116: Fixture > Show
  // Properties, Cmd-P) — the Overrides toggle in the header.
  { key: 'Ctrl+P', label: 'Show overridden properties', command: 'showOverrides', code: 'p', ctrl: true },
  { key: 'Ctrl+Shift+H', label: 'Highlight mode', command: 'highlight', code: 'h', ctrl: true, shift: true },
  { key: 'Ctrl+Shift+Alt+P', label: 'Beam Direction…', command: 'beamDirection', code: 'p', ctrl: true, shift: true, alt: true },
  // Group (Guide p.35): Layout > Group, Control-click → Group — Command-Option-G on Mac (ctrl matches Cmd there).
  { key: 'Ctrl+Alt+G', label: 'Group', command: 'group', code: 'g', ctrl: true, alt: true },
  { key: 'F11', label: 'Full screen', command: 'fullscreen', code: 'f11' },
  { key: 'B', label: 'Blackout', command: 'blackout', code: 'b' },
  { key: 'Space', label: 'Go / play automation', command: 'go', code: ' ' },
  { key: 'N', label: 'Next cue', command: 'next', code: 'n' },
  { key: 'Right', label: 'Next cue', command: 'next', code: 'arrowright' },
  { key: 'P', label: 'Previous cue', command: 'previous', code: 'p' },
  { key: 'Left', label: 'Previous cue', command: 'previous', code: 'arrowleft' },
  { key: 'Esc', label: 'Stop / close panel', command: 'escape', code: 'escape' },
  ...Array.from({ length: 9 }, (_, index) => ({ key: String(index + 1), label: `Recall cue ${index + 1}`, command: `cue${index + 1}`, code: String(index + 1) }))
]
export function matchShortcut(event: ShortcutInput, target: { tagName?: string; isContentEditable?: boolean } | null): ShortcutBinding | undefined {
  if (isEditingText(target)) return undefined
  return SHORTCUTS.find((binding) => binding.code === event.key.toLowerCase() && Boolean(binding.ctrl) === Boolean(event.ctrlKey || event.metaKey) && Boolean(binding.shift) === Boolean(event.shiftKey) && Boolean(binding.alt) === Boolean(event.altKey))
}

/** One row of the Shortcuts panel (bottom right). `section` is part of
 * the row's identity: two rows may share a key and a label in different
 * contexts, but never in the same list — see buildShortcutsList. */
export interface ShortcutRow { key: string; label: string; section: 'app' | 'palette' | 'live-edit' | 'preset' | 'effect' }

// LightKey Preset Palette shortcuts (Jake's 18 Nov screenshots): arrows
// select presets, esc clears, Return renames, Cmd/Ctrl+N new preset,
// Shift+Cmd/Ctrl+N new group, Shift+Cmd/Ctrl+E edit preset. They are
// active only while the palette tree has focus — Cmd/Ctrl+N is still
// "New project" elsewhere (see GroupsPresetsPanel).
export const PALETTE_SHORTCUTS: ShortcutRow[] = [
  { key: '↑ ↓', label: 'Select presets', section: 'palette' },
  { key: 'esc', label: 'Clear selection', section: 'palette' },
  { key: 'Return', label: 'Rename', section: 'palette' },
  { key: 'Cmd+N', label: 'New preset', section: 'palette' },
  { key: 'Shift+Cmd+N', label: 'New group', section: 'palette' },
  { key: 'Shift+Cmd+E', label: 'Edit preset', section: 'palette' }
]

/**
 * The Shortcuts panel's rows for one state. LightKey's rule (Guide pp.45,
 * 51): the panel shows the most relevant shortcuts for the current
 * context, one context at a time — never the full catalogue, and never
 * the same row twice. In Live Edit it shows only Nudge + Clear selection
 * (Jake's LightKey screenshots); the palette rows and Undo/Redo stay out
 * of that mode. The old construction concatenated the Live-edit rows
 * with the palette rows, so `esc — Clear selection` appeared twice with
 * the same React key — and React orphaned one DOM node per Edit in/out
 * cycle, growing the panel by a row each time (Jake, 20 Nov 2026: 8
 * identical rows). Every list this builds has unique (section, key,
 * label) triples by construction.
 */
export function buildShortcutsList(options: { tab: string; liveEditing: boolean; editingPreset: boolean; editingEffect?: boolean }): ShortcutRow[] {
  const rows: ShortcutRow[] = []
  if (options.editingPreset) rows.push({ key: 'esc', label: 'Cancel preset edit', section: 'preset' })
  // While an effect is being edited LightKey shows "esc End editing"
  // (Jake's screenshots, 9.31.29 pm) — Escape ends the edit (App.tsx).
  if (options.editingEffect) rows.push({ key: 'esc', label: 'End editing', section: 'effect' })
  if (options.tab === 'Live' && options.liveEditing) {
    rows.push(
      { key: '↑ ← ↓ →', label: 'Nudge', section: 'live-edit' },
      { key: 'esc', label: 'Clear selection', section: 'live-edit' }
    )
    return rows
  }
  for (const item of SHORTCUTS) {
    // Ctrl+J is the Preview edit toggle in every tab (Jake, 20 Nov 2026:
    // the header Edit button is Preview-only; Live editing has its own
    // button in the Live panel), so its label never becomes "Edit live page".
    rows.push({ key: item.key, label: item.label, section: 'app' })
  }
  rows.push(...PALETTE_SHORTCUTS)
  return rows
}
