import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildShortcutsList } from '../src/renderer/src/lib/shortcuts'

const appSource = readFileSync('src/renderer/src/App.tsx', 'utf8')
const shortcutsSource = readFileSync('src/renderer/src/lib/shortcuts.ts', 'utf8')

function assertUnique(rows: { key: string; label: string; section: string }[]) {
  const keys = rows.map((row) => `${row.section}:${row.key}:${row.label}`)
  expect(new Set(keys).size).toBe(keys.length)
}

describe('Shortcuts panel list (Jake, 20 Nov 2026)', () => {
  it('never lists the same row twice in any state — no duplicate React keys', () => {
    // The old construction concatenated the Live-edit rows with the
    // palette rows, so `esc — Clear selection` appeared twice with the
    // same key — and React orphaned one DOM node per Edit in/out cycle,
    // growing the panel by a row each time (8 identical rows in Jake's
    // screenshot).
    for (const tab of ['Design', 'Live']) {
      for (const liveEditing of [false, true]) {
        for (const editingPreset of [false, true]) {
          const rows = buildShortcutsList({ tab, liveEditing, editingPreset })
          assertUnique(rows)
          // Exactly one Clear selection row in every state: the Live-edit
          // one while editing a Live page, the palette one otherwise.
          expect(rows.filter((row) => row.label === 'Clear selection')).toHaveLength(1)
        }
      }
    }
  })

  it('shows only Nudge + Clear selection in Live Edit, like LightKey', () => {
    // Jake's LightKey screenshots: Live Edit shows 2 rows — no Undo/Redo,
    // no palette rows.
    const rows = buildShortcutsList({ tab: 'Live', liveEditing: true, editingPreset: false })
    expect(rows).toEqual([
      { key: '↑ ← ↓ →', label: 'Nudge', section: 'live-edit' },
      { key: 'esc', label: 'Clear selection', section: 'live-edit' }
    ])
  })

  it('shows the full list plus palette rows outside Live Edit', () => {
    const rows = buildShortcutsList({ tab: 'Design', liveEditing: false, editingPreset: false })
    assertUnique(rows)
    expect(rows.some((row) => row.label === 'Undo' && row.section === 'app')).toBe(true)
    expect(rows.some((row) => row.label === 'Select presets' && row.section === 'palette')).toBe(true)
    expect(rows.some((row) => row.label === 'Clear selection' && row.section === 'palette')).toBe(true)
    // Ctrl+J stays the Preview edit toggle in every tab — its label never
    // becomes "Edit live page" (Bug 5: the header Edit is Preview-only).
    expect(rows.find((row) => row.label === 'Edit preview')).toBeTruthy()
    expect(rows.some((row) => row.label === 'Edit live page')).toBe(false)
  })

  it('App renders the builder list with section-qualified keys', () => {
    expect(appSource).toContain('buildShortcutsList({ tab, liveEditing, editingPreset: Boolean(editingPresetId) })')
    expect(appSource).toContain('key={`${s.section}:${s.key}:${s.label}`}')
    expect(appSource).not.toContain('paletteShortcuts')
    expect(appSource).not.toContain("key={s.key + s.label}")
    expect(shortcutsSource).toContain('export function buildShortcutsList')
  })
})
