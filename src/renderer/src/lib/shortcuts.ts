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
  { key: 'F11', label: 'Full screen', command: 'fullscreen', code: 'f11' },
  { key: 'B', label: 'Blackout', command: 'blackout', code: 'b' },
  { key: 'Space', label: 'Go / play automation', command: 'go', code: ' ' },
  { key: 'N', label: 'Next cue', command: 'next', code: 'n' },
  { key: 'Right', label: 'Next cue', command: 'next', code: 'arrowright' },
  { key: 'P', label: 'Previous cue', command: 'previous', code: 'p' },
  { key: 'Left', label: 'Previous cue', command: 'previous', code: 'arrowleft' },
  { key: 'Esc', label: 'Stop / close panel', command: 'escape', code: 'escape' },
  ...Array.from({ length: 9 }, (_, index) => ({ key: String(index + 1), label: `Recall scene ${index + 1}`, command: `scene${index + 1}`, code: String(index + 1) }))
]
export function matchShortcut(event: ShortcutInput, target: { tagName?: string; isContentEditable?: boolean } | null): ShortcutBinding | undefined {
  if (isEditingText(target)) return undefined
  return SHORTCUTS.find((binding) => binding.code === event.key.toLowerCase() && Boolean(binding.ctrl) === Boolean(event.ctrlKey || event.metaKey) && Boolean(binding.shift) === Boolean(event.shiftKey) && Boolean(binding.alt) === Boolean(event.altKey))
}
