import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// LightKey's Get Info panel (Jake, 27 Nov 2026): the old docked "Cue
// Properties" side panel — a Name field, Contents / Options / Button
// tabs, and Presets/Sequences/Effects checklists hidden behind
// <details> — did not resemble LightKey's panel. The inspector was
// then rebuilt as a floating popover beside the control (27 Nov),
// and Jake's screenshots (8.53.54 / 8.54.15) showed LightKey's panel
// is docked to the right edge of the Design/Live panel, sliding in
// over the canvas. The inspector was that docked panel until 28 Nov
// 2026, when Jake showed it embeds itself into the Live view rather
// than sitting over it, with an adjustable width, while the canvas
// keeps scrolling underneath it — so it is now a flex sibling of the
// canvas viewport in the same row (opening it shrinks the canvas;
// closing it gives the canvas the full width back), with a draggable
// left edge (280–520px, default 340, persisted in app preferences)
// and no slide-in animation. Title centred, × top-left, one
// scrollable list of collapsible sections (Contents, Timing, Button,
// Modifiers, Live Triggers; Activate is the tail of the Button section
// and Group a label row), every setting an inline mini-dropdown or an
// on/off toggle. No Curve control (LightKey's Timing is Fade In/Out
// only), no Font section (font lives in the right-click menu), no
// "Attached to" (buttons attach by touching), and the Modifiers
// checklist lives directly in the panel's own scroll — no nested
// scroll container. See NOTES.md.
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

  it('embeds beside the canvas in the same flex row, with a draggable left edge (Jake, 28 Nov 2026)', () => {
    expect(workspace).toContain('live-properties-popup')
    expect(workspace).toContain('role="dialog"')
    expect(workspace).toContain('rounded-xl')
    // Embedded, not an overlay: no absolute positioning, no fixed
    // w-[340px] class — the width is an inline style from the
    // persisted inspector size, and the wrapper is the row's flex
    // child, so the canvas (flex-1) shrinks instead of being covered.
    expect(workspace).not.toContain('absolute bottom-0 right-0 top-0')
    expect(workspace).not.toContain('w-[340px]')
    expect(workspace).toContain('style={{ width: inspectorWidth }}')
    expect(workspace).toContain('flex min-h-0 shrink-0')
    // The thin divider on its left edge drags to resize it.
    expect(workspace).toContain('Resize properties panel')
    expect(workspace).toContain('beginInspectorResize')
    expect(workspace).toContain('onInspectorWidthChange')
    // Not positioned from the selected object's rect.
    expect(workspace).not.toContain('panelPos')
    expect(workspace).not.toContain('absolute bottom-2 right-2 top-2')
    expect(workspace).not.toContain('w-[300px]')
    // No slide-in animation any more: an in-flow panel has nothing to
    // slide over.
    expect(css).not.toContain('@keyframes live-properties-slide-in')
    expect(css).not.toContain('translateX(100%)')
    expect(css).not.toContain('@keyframes live-properties-pop-in')
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
    // Sections for a cue button: Contents, Timing, Button, Modifiers,
    // Live Triggers. A section collapses/expands in place; nothing opens a
    // submenu, a fly-out or a separate dialog. (Activate is the tail of
    // the Button section and Group a label row after it — LightKey's
    // screenshots 5.19.17 / 3.32.58 — not sections of their own.)
    const cueBranch = workspace.slice(workspace.indexOf('id="contents" title="Contents"'), workspace.indexOf('{contentsMenu &&'))
    let at = -1
    for (const id of ['contents', 'timing', 'button', 'modifiers', 'triggers']) {
      const next = cueBranch.indexOf(`id="${id}"`, at + 1)
      expect(next).toBeGreaterThan(at)
      at = next
    }
    // No Font section on a cue button: font lives in the right-click
    // menu (Jake, 27 Nov 2026). The Font section survives only for
    // cuelist/annotation targets, where it is the only font UI.
    expect(cueBranch).not.toContain('id="font"')
    expect(workspace).toContain('InspectorSection')
    expect(workspace).toContain('openSections')
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
    // No Show Fonts button: font lives in the right-click menu's Font
    // submenu (Jake, 27 Nov 2026).
    expect(workspace).not.toContain('Show Fonts')
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

  it('has no Curve control, no Attached to, and no nested scroll in Modifiers', () => {
    // Timing is Fade In/Out only (Jake, 27 Nov 2026 — LightKey has no
    // Curve selection). The curve data model stays (fadeCurves.ts
    // shapes fades with it) but no control sets it anymore.
    expect(workspace).not.toContain('label="Fade curve"')
    expect(workspace).not.toContain('label="Curve"')
    // Buttons attach by touching (Guide ch.11, pp.183–184); the
    // "Attached to" dropdown was this app's invention.
    expect(workspace).not.toContain('Attached to')
    expect(workspace).not.toContain('attachmentSelect')
    // The Modifiers checklist lives directly in the panel's own
    // scroll — no inner scroll container (Jake, 27 Nov 2026).
    expect(workspace).not.toContain('max-h-40')
    expect(workspace).not.toContain('max-h-32')
  })

  it('uses LightKey\'s directional fade ramps — ascending in, descending out', () => {
    // Jake, 27 Nov 2026: the old glyph drew the same ascending slope
    // for both, so Fade Out was wrong. LightKey's Fade In ramp rises
    // left-to-right, its Fade Out ramp falls left-to-right.
    expect(workspace).toContain('direction="in"')
    expect(workspace).toContain('direction="out"')
    expect(workspace).toContain('x1="4.5" y1="13.5" x2="13.5" y2="4.5"')
    expect(workspace).toContain('x1="4.5" y1="4.5" x2="13.5" y2="13.5"')
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

  it('fits entirely inside the visible panel — its height is the panel height', () => {
    // The panel is a flex sibling of the canvas viewport in the
    // section's canvas row, so the section must be exactly the visible
    // panel body's height. It used to be min-h-full (a floor, not a
    // ceiling): the 520px canvas forced the section to ~600px tall, the
    // popup ran off the bottom of the page, and reaching its bottom
    // meant scrolling the panel — which scrolled the button being
    // edited out of view (Jake, 18 Nov 2026).
    expect(workspace).toContain('relative flex h-full flex-col gap-2')
    expect(workspace).not.toContain('relative flex min-h-full flex-col gap-2')
    // The canvas scroll container must be allowed to shrink below the
    // 520px canvas height, so the canvas scrolls internally and the
    // section never grows past the panel body. It scrolls vertically as
    // well as horizontally now that the canvas can grow downwards past
    // the visible panel (Jake, 25 Nov 2026) — still internal scrolling,
    // so the section height (and the embedded panel beside it) is
    // unaffected.
    expect(workspace).toContain('min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto')
    // The embedded panel is full-height against the row with its own
    // internal scroll, so a long properties list is reachable without
    // moving the canvas beside it.
    expect(workspace).toContain('flex min-h-0 shrink-0')
    expect(workspace).toContain('min-h-0 overflow-y-auto')
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
