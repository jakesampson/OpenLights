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
    // The press handler is onControlPointerDown now (drag-anywhere, Jake
    // 22 Nov 2026) — it selects first, then arms the drag in Edit mode.
    expect(workspace).toContain('onPointerDown={(e) => onControlPointerDown(e, ref, x, y)}')
    expect(workspace).toContain('selectRef(ref)')
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

  it('removes the page inspector so the canvas uses the full panel width', () => {
    expect(workspace).not.toContain('aria-label="page inspector"')
    expect(workspace).not.toContain('Page inspector')
    // The old double-click-to-rename is gone: renaming lives in the popup
    // Name field (and the annotation text field).
    expect(workspace).not.toContain('renameInput')
    expect(workspace).not.toContain('setRenaming')
  })

  it('fits entirely inside the visible panel — its height is bounded by the panel, not the canvas', () => {
    // The popup's top-2/bottom-2 insets are against the Live section, so
    // the section must be exactly the visible panel body's height. It used
    // to be min-h-full (a floor, not a ceiling): the 520px canvas forced
    // the section to ~600px tall, the popup ran off the bottom of the page,
    // and reaching its bottom meant scrolling the panel — which scrolled
    // the button being edited out of view (Jake, 18 Nov 2026).
    expect(workspace).toContain('relative flex h-full flex-col gap-2')
    expect(workspace).not.toContain('relative flex min-h-full flex-col gap-2')
    // The canvas scroll container must be allowed to shrink below the
    // 520px canvas height, so the canvas scrolls internally and the
    // section never grows past the panel body. It scrolls vertically as
    // well as horizontally now that the canvas can grow downwards past
    // the visible panel (Jake, 25 Nov 2026) — still internal scrolling,
    // so the section height (and the popup against it) is unaffected.
    expect(workspace).toContain('min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto')
    // The popup itself is unchanged: anchored top and bottom with its own
    // internal scroll, so a long properties list is reachable without
    // moving the canvas behind it.
    expect(workspace).toContain('absolute bottom-2 right-2 top-2')
    expect(workspace).toContain('overflow-y-auto')
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
