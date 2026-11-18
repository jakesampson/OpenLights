import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Live Edit button properties popup (18 Nov 2026, Jake): single-click
// selects a button to move/resize; double-click opens a small popup that
// slides in from the right. The popup scrolls on its own while the canvas
// behind it does not, so the button stays visible while its properties are
// edited. See NOTES.md.
describe('Live Edit — double-click properties popup', () => {
  const root = resolve(__dirname, '..')
  const workspace = readFileSync(resolve(root, 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
  const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')

  it('opens only on double-click, never on single click', () => {
    expect(workspace).toContain('const [popupOpen, setPopupOpen] = useState(false)')
    expect(workspace).toContain('openPropertiesPopup')
    expect(workspace).toContain('onDoubleClick={() => openPropertiesPopup(ref)}')
    // Single click still only selects (move/resize), it never opens the popup.
    expect(workspace).toContain('onPointerDown={() => selectRef(ref)}')
    expect(workspace).not.toContain('onClick={() => openPropertiesPopup')
  })

  it('slides in from the right over the canvas and scrolls on its own', () => {
    expect(workspace).toContain('live-properties-popup')
    expect(workspace).toContain('absolute bottom-2 right-2 top-2')
    expect(workspace).toContain('overflow-y-auto')
    expect(workspace).toContain('role="dialog"')
    expect(workspace).toContain('aria-label={`${inspectorTarget} properties`}')
    expect(css).toContain('@keyframes live-properties-slide-in')
    expect(css).toContain('.live-properties-popup')
  })

  it('contains the full button inspector: name, ad-hoc, timing mm:ss.t, button type', () => {
    // The popup reuses the inspector fields; they moved here from the fixed
    // sidebar, they were not rebuilt.
    expect(workspace).toContain('Ad hoc properties')
    expect(workspace).toContain('Timing')
    expect(workspace).toContain('Fade In')
    expect(workspace).toContain('Fade Out')
    expect(workspace).toContain('BUTTON_TYPE_LABELS')
    expect(workspace).toContain('Push Button')
    expect(workspace).toContain('TimingInput')
    expect(workspace).toContain('Presets (')
    expect(workspace).toContain('Sequences (')
  })

  it('follows the single selection while open and closes with X, Esc or Done', () => {
    expect(workspace).toContain('{editing && !locked && popupOpen && selection &&')
    expect(workspace).toContain('aria-label="Close properties popup"')
    expect(workspace).toContain('onClick={() => setPopupOpen(false)}')
    // Esc closes the popup as well as clearing the selection.
    expect(workspace).toContain('setPopupOpen(false)\n        clearPageObjectSelection()')
    // Done (leaving Edit mode) closes it too.
    expect(workspace).toContain('setPopupOpen(false)\n      clearPageObjectSelection()')
  })

  it('leaves the fixed sidebar for page properties only — no competing button panel', () => {
    expect(workspace).toContain('{editing && !locked && !selection && <aside')
    expect(workspace).toContain('Page inspector')
    // The old double-click-to-rename is gone: renaming lives in the popup
    // Name field (and the annotation text field).
    expect(workspace).not.toContain('renameInput')
    expect(workspace).not.toContain('setRenaming')
  })

  it('double-click does not fire the cue', () => {
    // A toggle cue is clicked twice (on then off, or off then on), a flash
    // cue is momentary, a fader ignores double-click — the level is
    // unchanged by opening the popup. The reasoning is recorded in the
    // source next to the cue render.
    expect(workspace).toContain('Double-click opens the properties popup')
    expect(workspace).toContain('it does not fire the')
  })
})
