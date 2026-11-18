import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// The sequence editor is a React component and this repo has no DOM test
// renderer, so — like tests/bottomPanel.test.ts and tests/cleanup.test.ts —
// these tests assert on the editor source and its wiring instead of mounting
// it. Store behaviour for the actions it calls is covered in
// tests/sequences.test.ts.
describe('sequence editor', () => {
  const editor = readFileSync('src/renderer/src/components/SequenceEditor.tsx', 'utf8')
  const panel = readFileSync('src/renderer/src/components/GroupsPresetsPanel.tsx', 'utf8')

  it('exists and is the wired authoring surface, not a dead panel', () => {
    expect(existsSync('src/renderer/src/components/SequenceEditor.tsx')).toBe(true)
    expect(editor).toContain('export function SequenceEditor')
    expect(panel).toContain("import { SequenceEditor } from './SequenceEditor'")
    // One sequence at a time, embedded under its tree row in the combined
    // LightKey palette (18 Nov 2026) — the old whole-list rendering with
    // its "Sequences" heading is gone; creation lives in the palette
    // header menu / right-click menu.
    expect(panel).toContain('<SequenceEditor sequenceId=')
    expect(panel).not.toContain('<SequenceEditor />')
    expect(panel).not.toContain('Run / stop')
  })

  it('creates, renames, duplicates, deletes and runs/stops sequences', () => {
    for (const text of ['updateSequence', 'duplicateSequence', 'deleteSequence', 'toggleSequence']) expect(editor).toContain(text)
    expect(editor).toContain('data-project-id')
    // Creation moved to the palette: header menu / right-click menu.
    for (const text of ['Capture sequence', 'createSequence', 'New Sequence', 'Stop all running sequences']) expect(panel).toContain(text)
  })

  it('edits sequence settings: timing, order, loop, repeats and keep-last-step', () => {
    for (const text of ['Timing', 'Beat controlled', 'Steps / beat', 'Time scale', 'Order', 'forward', 'backward', 'bounce', 'random', 'Loop', 'Repeats', 'Keep last step']) expect(editor).toContain(text)
  })

  it('edits steps: capture from the current look, reorder, fade/hold, beats, presets and fixture values', () => {
    for (const text of ['Capture current look as step', 'addSequenceStep', 'moveSequenceStep', 'duplicateSequenceStep', 'removeSequenceStep', 'Reverse steps', 'Shuffle steps', 'Fade (s)', 'Hold (s)', 'Beats', 'updateSequenceStep', 'Stored fixture properties', 'Remove fixture']) expect(editor).toContain(text)
  })

  it('uses the real time-driven playback and does not fake manual step advance', () => {
    // Playback is toggleSequence -> configureSequences -> sequenceClock; the
    // engine has no step-advance API, so the editor must not pretend to.
    expect(editor).toContain('sequenceClock')
    expect(editor).not.toMatch(/cueNext|goToStep|jumpToStep|advanceStep/)
    expect(editor).not.toContain('Go to next step')
  })
})
