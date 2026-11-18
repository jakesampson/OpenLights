// Live Edit rebuild (18 Nov 2026): the old bottom strip — "+ Scene button /
// + Custom cue / + Cue list / + Label / + Frame" row, hint line, "Default
// styles for new objects" details and the "Preset palette / Export JSON /
// Import JSON / Convert scenes" section — was replaced by a LightKey-style
// layout (Guide ch.11 pp.176-223, Jake's 18 Nov screenshots): grid canvas,
// vertical Master fader left of the canvas, centred Design/Live switch +
// toolbar (+ / frame / T / green Done), right-click context menu, inspector
// right of the canvas, Preset Palette in the right sidebar, Nudge / esc
// shortcuts. Capabilities were moved, not deleted; see NOTES.md.
// These are source/wiring assertions (no DOM renderer); they pin the
// LightKey homes of each red-box item and guard the parity fix (30c8661a).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const workspace = readFileSync(resolve(root, 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
const groupsPresets = readFileSync(resolve(root, 'src/renderer/src/components/GroupsPresetsPanel.tsx'), 'utf8')
const sequenceEditor = readFileSync(resolve(root, 'src/renderer/src/components/SequenceEditor.tsx'), 'utf8')
const app = readFileSync(resolve(root, 'src/renderer/src/App.tsx'), 'utf8')

describe('Live Edit — LightKey layout', () => {
  it('removes the old bottom strip from Live Edit', () => {
    for (const text of [
      '+ Scene button',
      '+ Custom cue',
      '+ Cue list',
      'Choose scene…',
      // "Default styles for new objects" moved into the page inspector
      // (defaultStylesFields); only its old bottom-strip details wrapper
      // must be gone.
      '<details className="rounded border border-line bg-panel2 p-2 text-xs"><summary>Default styles for new objects</summary>',
      'Preset palette',
      'Export JSON',
      'Import JSON',
      'Convert scenes',
      'CueContentsEditor'
    ]) expect(workspace).not.toContain(text)
  })

  it('has a LightKey-style toolbar: Design/Live switch, +, frame, T, green Done', () => {
    expect(workspace).toContain('aria-label="Live edit tools"')
    expect(workspace).toContain('aria-label="New button"')
    expect(workspace).toContain('aria-label="New frame"')
    expect(workspace).toContain('aria-label="Insert text"')
    expect(workspace).toContain('Done')
    expect(workspace).toContain('#22c55e')
    expect(workspace).toContain('live-page-edit')
    expect(workspace).toContain('>Edit<')
  })

  it('has a vertical Master fader on the left of the bottom panel', () => {
    expect(workspace).toContain('aria-label="Live master"')
    expect(workspace).toContain('setMaster(Number(e.target.value))')
    expect(workspace).toContain('writingMode')
    expect(workspace).toContain('BPM')
  })

  it('has a LightKey right-click context menu on the canvas', () => {
    expect(workspace).toContain('aria-label="Live edit actions"')
    for (const item of ['New Button', 'Insert Text', 'Insert Cuelist', 'Cut', 'Copy', 'Paste', 'Duplicate', 'Delete', '✓ Edit Live View']) {
      expect(workspace).toContain(item)
    }
    expect(workspace).toContain('clampCanvasPoint')
  })

  it('inspector shows Ad hoc properties, Timing in mm:ss.t, and Button Type', () => {
    expect(workspace).toContain('Ad hoc properties')
    expect(workspace).toContain('Timing')
    expect(workspace).toContain('Fade In')
    expect(workspace).toContain('Fade Out')
    expect(workspace).toContain('BUTTON_TYPE_LABELS')
    expect(workspace).toContain('Push Button')
    expect(workspace).toContain('TimingInput')
  })

  it('keeps the Live / Live Edit parity fix: one shared cueBody', () => {
    expect(workspace).toContain('cueBody(control, level)')
    expect(workspace).toContain('Go')
    expect(workspace).toContain('Back')
    expect(workspace).toContain('Stop')
  })

  it('moves the Preset Palette to the right sidebar, with drag onto the page', () => {
    // Preset Palette side panel (the right sidebar when Live is open).
    expect(groupsPresets).toContain('Preset palette')
    expect(groupsPresets).toContain('Export JSON')
    expect(groupsPresets).toContain('Import JSON')
    expect(groupsPresets).toContain('Convert scenes')
    expect(groupsPresets).toContain('encodeLiveDrop')
    expect(groupsPresets).toContain('LIVE_DROP_MIME')
    expect(workspace).toContain('dropOnLivePage')
    // Presets AND sequences are draggable from their palette tree rows;
    // the drag lives on the row now, not in the sequence editor.
    expect(groupsPresets).toContain("kind: 'sequence', id: sequence.id")
    expect(sequenceEditor).not.toContain('encodeLiveDrop')
    expect(sequenceEditor).not.toContain('LIVE_DROP_MIME')
  })

  it('shows button properties in the slide-in popup, not the fixed sidebar', () => {
    // 18 Nov 2026 (Jake): double-click a button opens a small popup
    // sliding in from the right; the fixed sidebar is page-only.
    expect(workspace).toContain('live-properties-popup')
    expect(workspace).toContain('Close properties popup')
    expect(workspace).toContain('openPropertiesPopup')
    expect(workspace).toContain('onDoubleClick={() => openPropertiesPopup(ref)}')
    expect(workspace).toContain('overflow-y-auto')
    expect(workspace).toContain('Page inspector')
    expect(workspace).not.toContain('renameInput')
  })

  it('shows LightKey edit shortcuts (Nudge / Clear selection) while editing', () => {
    expect(app).toContain('Nudge')
    expect(app).toContain('Clear selection')
    expect(workspace).toContain('moveSelectedPageObjects')
    expect(workspace).toContain('stopImmediatePropagation')
  })
})
