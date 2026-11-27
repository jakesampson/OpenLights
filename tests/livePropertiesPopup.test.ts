import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// LightKey's floating Get Info panel (Jake, 27 Nov 2026): the old
// docked "Cue Properties" side panel — a Name field, Contents /
// Options / Button tabs, and Presets/Sequences/Effects checklists
// hidden behind <details> — did not resemble LightKey's panel. The
// inspector is now a rounded popover that floats beside the control,
// title centred, × top-left, one scrollable list of collapsible
// sections (Contents, Timing, Button, Font, Modifiers, Live Triggers;
// Activate is the tail of the Button section and Group a label row),
// every setting an inline mini-dropdown or an on/off toggle.
// See NOTES.md.
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

  it('floats beside the control — a rounded popover, not a docked panel', () => {
    expect(workspace).toContain('live-properties-popup')
    expect(workspace).toContain('role="dialog"')
    expect(workspace).toContain('rounded-xl')
    expect(workspace).toContain('w-[340px]')
    // Positioned from the selected object's on-screen rect, right of
    // it when that fits, otherwise left, clamped inside the panel.
    expect(workspace).toContain('panelPos')
    expect(workspace).toContain('data-page-object')
    // No docked sidebar geometry left.
    expect(workspace).not.toContain('absolute bottom-2 right-2 top-2')
    expect(workspace).not.toContain('w-[300px]')
    expect(css).toContain('@keyframes live-properties-pop-in')
    expect(css).not.toContain('@keyframes live-properties-slide-in')
    expect(css).toContain('.live-properties-popup')
  })

  it('has a centred title, × top-left, no Name field and no tabs', () => {
    expect(workspace).toContain('aria-label={`${panelTitle} inspector`}')
    expect(workspace).toContain('text-center text-[15px] font-semibold')
    expect(workspace).toContain('absolute left-0 top-0')
    expect(workspace).toContain('aria-label="Close properties popup"')
    // No Name field in the inspector — renaming stays in the Rename
    // menu item (the (+) naming input on the button itself is separate).
    expect(workspace).not.toContain('onChange={(e) => patchControl(selectedControl.id, { name: e.target.value })}')
    expect(workspace).not.toContain('role="tablist"')
    expect(workspace).not.toContain('inspectorTab')
  })

  it('is one scrollable list of collapsible sections in LightKey\'s order', () => {
    // Sections: Contents, Timing, Button, Font, Modifiers, Live
    // Triggers. A section collapses/expands in place; nothing opens a
    // submenu, a fly-out or a separate dialog. (Activate is the tail of
    // the Button section and Group a label row after it — LightKey's
    // screenshots 5.19.17 / 3.32.58 — not sections of their own.)
    for (const id of ['contents', 'timing', 'button', 'font', 'modifiers', 'triggers']) {
      expect(workspace).toContain(`id="${id}"`)
    }
    expect(workspace).toContain('InspectorSection')
    expect(workspace).toContain('openSections')
    // The section order in the cue branch: Contents, Timing, Button,
    // Font, Modifiers, Live Triggers.
    const cueBranch = workspace.slice(workspace.indexOf('id="contents" title="Contents"'), workspace.indexOf('{contentsMenu &&'))
    let at = -1
    for (const id of ['contents', 'timing', 'button', 'font', 'modifiers', 'triggers']) {
      const next = cueBranch.indexOf(`id="${id}"`, at + 1)
      expect(next).toBeGreaterThan(at)
      at = next
    }
    // The Presets/Sequences/Effects checklists hidden behind <details>
    // are gone — drag-in from the palette is the LightKey way.
    expect(workspace).not.toContain('Presets (')
    expect(workspace).not.toContain('Sequences (')
    expect(workspace).toContain('overflow-y-auto')
  })

  it('every setting is an inline mini-dropdown or an on/off toggle', () => {
    // MiniSelect: a native select styled as a pill with a blue up/down
    // chevron at the right edge, exactly as in Jake's screenshots.
    expect(workspace).toContain('MiniSelect')
    expect(workspace).toContain('⌃')
    expect(workspace).toContain('⌄')
    // Colour: Automatic + LightKey's 12 swatches, custom via the swatch.
    expect(workspace).toContain('ButtonColorField')
    expect(workspace).toContain('LIGHTKEY_BUTTON_COLORS')
    // Fade times keep the slope icon and ±0.1s steppers.
    expect(workspace).toContain('Increase ${label}')
    expect(workspace).toContain('Decrease ${label}')
    // Show Fonts opens the Font section in Edit mode only (guide p.204).
    expect(workspace).toContain('Show Fonts')
    expect(workspace).toContain('disabled={!editing}')
  })

  it('contains the full button inspector: ad-hoc, timing mm:ss.t, button type', () => {
    // The inspector fields moved here from the fixed sidebar; the
    // contents, timing and button settings were not rebuilt, only
    // re-housed in LightKey's layout.
    expect(workspace).toContain('Ad hoc properties')
    expect(workspace).toContain('Timing')
    expect(workspace).toContain('Fade In')
    expect(workspace).toContain('Fade Out')
    expect(workspace).toContain('BUTTON_TYPE_LABELS')
    expect(workspace).toContain('Push Button')
    expect(workspace).toContain('TimingInput')
    expect(workspace).toContain('Cue contents')
    expect(workspace).toContain('dropOnContents')
  })

  it('follows the single selection while open and closes with X, Esc, Done or a click on blank canvas', () => {
    // The popup renders whenever it was asked for (and the project is not
    // locked) — NOT only in Live Edit mode: the guide's first Edit Ad Hoc
    // Properties route is "Control-click a button in the Live view", with
    // no edit-mode qualifier (Jake, 27 Nov 2026 — the item silently did
    // nothing in Live mode because the popup was edit-gated).
    expect(workspace).toContain('{!locked && popupOpen && selection &&')
    expect(workspace).toContain('aria-label="Close properties popup"')
    expect(workspace).toContain('onClick={() => setPopupOpen(false)}')
    // Esc closes the popup as well as clearing the selection (Edit mode).
    expect(workspace).toContain('setPopupOpen(false)\n        clearPageObjectSelection()')
    // Done (leaving Edit mode) closes it too.
    expect(workspace).toContain('setPopupOpen(false)\n      clearPageObjectSelection()')
    // Esc also closes it in Live mode, and a click on blank canvas.
    expect(workspace).toContain("if (event.key === 'Escape') setPopupOpen(false)")
    expect(workspace).toContain('workspaceSectionRef.current?.contains(target)')
  })

  it('removes the page inspector so the canvas uses the full panel width', () => {
    expect(workspace).not.toContain('aria-label="page inspector"')
    expect(workspace).not.toContain('Page inspector')
    // Renaming is inline now, not a popup Name field (the Name field went
    // with the Task 1 inspector rebuild, Jake 27 Nov 2026) and not the
    // old renameInput: double-click a cue step, a group or the list name
    // in the widget and an inline input opens (Jake, 27 Nov 2026 —
    // cuelist widget replication).
    expect(workspace).not.toContain('renameInput')
    expect(workspace).toContain('aria-label="Cue name"')
    expect(workspace).toContain('aria-label="Group name"')
    expect(workspace).toContain('aria-label="Cuelist name"')
    expect(workspace).toContain('setRenamingStep')
    expect(workspace).toContain('setRenamingGroup')
    expect(workspace).toContain('setRenamingList')
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
    // The floating panel is positioned beside the control and its height
    // is clamped to the visible panel (maxHeight from the section rect),
    // with its own internal scroll, so a long properties list is
    // reachable without moving the canvas behind it.
    expect(workspace).toContain('maxHeight: Math.max(200, sRect.height - 16)')
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
