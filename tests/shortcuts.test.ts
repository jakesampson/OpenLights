import { describe, expect, it } from 'vitest'
import { historyShortcut, SHORTCUTS, matchShortcut } from '../src/renderer/src/lib/shortcuts'
describe('history shortcuts', () => {
  it('has unique bindings and resolves every displayed entry to an implemented command family', () => {
    const signatures = SHORTCUTS.map((s) => `${s.ctrl ?? false}/${s.shift ?? false}/${s.alt ?? false}/${s.code}`)
    expect(new Set(signatures).size).toBe(signatures.length)
    for (const binding of SHORTCUTS) {
      expect(matchShortcut({ key: binding.code, ctrlKey: binding.ctrl, shiftKey: binding.shift, altKey: binding.alt }, null)?.command).toBe(binding.command)
      expect(/^(undo|redo|save|saveAs|open|new|close|design|live|fullscreen|blackout|highlight|beamDirection|group|go|next|previous|escape|cue[1-9]|zoomIn|zoomOut|zoomFit|zoomSelection|editPreview|showOverrides|settings|selectAll|deselectAll|beamColor|fixtureOptions)$/.test(binding.command)).toBe(true)
    }
  })
  it('maps Windows undo and both redo bindings', () => {
    expect(historyShortcut({ key: 'z', ctrlKey: true }, null)).toBe('undo')
    expect(historyShortcut({ key: 'y', ctrlKey: true }, null)).toBe('redo')
    expect(historyShortcut({ key: 'Z', ctrlKey: true, shiftKey: true }, null)).toBe('redo')
    expect(historyShortcut({ key: 'z' }, null)).toBeNull()
    expect(historyShortcut({ key: 'z', ctrlKey: true, altKey: true }, null)).toBeNull()
  })
  it('preserves native editing in text and selection controls', () => {
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { isContentEditable: true }]) expect(historyShortcut({ key: 'z', ctrlKey: true }, target)).toBeNull()
  })
})
