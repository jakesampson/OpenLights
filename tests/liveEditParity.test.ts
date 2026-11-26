import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Live and Live Edit are one workspace (LiveWorkspace.tsx) with an `editing`
// flag. This repo has no DOM test renderer, so — like
// tests/sequenceEditor.test.ts — these tests assert on the workspace source
// and its wiring instead of mounting it. The output path both modes feed
// (setLiveValue -> configureLiveOutput) is covered in tests/liveOutput.test.ts
// and tests/store.test.ts.
describe('Live / Live Edit parity', () => {
  const workspace = readFileSync('src/renderer/src/components/LiveWorkspace.tsx', 'utf8')
  const store = readFileSync('src/renderer/src/stores/showStore.ts', 'utf8')

  it('renders one shared cue activation body in both modes, not a drag-only edit button', () => {
    // One cueBody helper owns toggle / flash / fader activation.
    expect(workspace).toContain('const cueBody = (control: LiveControl, level: number, textColor: string)')
    expect(workspace).toContain('setLiveValue(control.id, level ? 0 : 255)')
    expect(workspace).toContain('setLiveValue(control.id, 255)')
    expect(workspace).toContain('type="range"')
    // The old edit-mode branch replaced the whole control with a drag-only
    // button, so cues could not fire, flash, fade or show lit in Edit.
    expect(workspace).not.toContain('↕ {control.name}')
    expect(workspace).not.toContain('className="w-full cursor-grab rounded bg-bg px-2 py-2 text-left"')
    // The activation handlers are written once, in cueBody, and the cue
    // render calls it unconditionally (no `editing ?` around activation).
    const cueBodyUses = workspace.split('cueBody(control, level, textColor)').length - 1
    expect(cueBodyUses).toBe(1)
  })

  it('moves cues by dragging the whole button in Edit mode — no drag bar — and a click still fires', () => {
    // Jake, 22 Nov 2026: the button is draggable anywhere; the "↕ drag"
    // bar is gone. A press only arms the drag; movement past the
    // threshold starts it, so a click without movement still fires.
    expect(workspace).not.toContain('↕ drag')
    expect(workspace).not.toContain('aria-label={`Drag ${control.name}`}')
    expect(workspace).toContain('const DRAG_THRESHOLD = 4')
    expect(workspace).toContain('armedDrag.current = { ref, startX: event.clientX, startY: event.clientY, x, y }')
    expect(workspace).toContain('Math.hypot(event.clientX - armed.startX, event.clientY - armed.startY) <= DRAG_THRESHOLD')
    expect(workspace).toContain('onControlPointerDown')
    expect(workspace).toContain('onControlPointerMove')
    expect(workspace).toContain('onControlPointerUp')
    expect(workspace).toContain('onControlClickCapture')
    // The press must never preventDefault (that cancels the click) and
    // capture is taken only once the drag starts (taking it on press
    // would retarget the click to the wrapper and break firing).
    const press = workspace.slice(workspace.indexOf('const onControlPointerDown'), workspace.indexOf('const onControlPointerMove'))
    expect(press).not.toContain('preventDefault')
    expect(press).not.toContain('setPointerCapture')
    // A fader's slider keeps its own behaviour — a press on it never arms a drag.
    expect(workspace).toContain(".closest('input, select, textarea')")
    // A flash button pressed to start a drag is released when the move starts.
    expect(workspace).toContain("if (control?.type === 'flash' && (activeLiveValues[control.id] ?? 0) > 0) setLiveValue(control.id, 0)")
  })

  it('shows the cuelist transport in both modes', () => {
    // Go / Back / Stop used to be rendered only when `!editing`.
    expect(workspace).not.toContain('{!editing && list &&')
    expect(workspace).toContain('onClick={() => current >= 0 ? cueNext() : goToCue(list.id, 0)}>Go</button>')
    // Arrow calls, not bare handler references: React passes the click
    // event to a bare onClick={stopCue}, and in the Live window that
    // action is an IPC proxy that forwards every argument — Electron's
    // structured clone rejects the event, so Stop/Back silently did
    // nothing there (26 Nov 2026, found by the real-app probe).
    expect(workspace).toContain('onClick={() => cuePrev()}')
    expect(workspace).toContain('onClick={() => stopCue()}')
  })

  it('selects the pressed cue button or cue list in both modes, so the inspector follows it', () => {
    expect(workspace).toContain('const selectRef = (ref: Selection)')
    expect(workspace).toContain('onPointerDown={(e) => onControlPointerDown(e, ref, x, y)}')
    expect(workspace).toContain('onPointerDown={(e) => { selectRef(ref); beginDrag(e, ref, x, y) }}')
    // Selection is visible in both modes, not only while editing.
    expect(workspace).not.toContain("isSelected(ref) && editing ? 'border-accent'")
  })

  it('activation goes through the same store path in both modes', () => {
    // `liveEditing` is store UI state (like the page selection) so App can
    // show the LightKey edit shortcuts while Edit is open — but it is a
    // plain flag, not show data and not undo history, and setLiveValue does
    // not check the lock or any mode.
    expect(store).toContain('liveEditing: boolean')
    expect(store).toContain('setLiveEditing: (editing) => set({ liveEditing: editing })')
    // setLiveValue is a block body since the base-look refresh (Jake,
    // 22 Nov 2026: a Live press re-resolves the base against the pads),
    // but it still takes no lock or mode check — activation is the
    // same store path in both modes.
    const at = store.indexOf('setLiveValue: (id, value) => {')
    expect(at).toBeGreaterThan(-1)
    expect(store.slice(at, at + 1600)).not.toContain('locked')
  })

  it('leaves layout editing as edit-only affordances that do not change output', () => {
    // The edit toolbar, context menu, properties popup and edit keyboard
    // shortcuts stay gated on `editing` — they arrange the page, they do
    // not fire anything. The old bottom strip (button row, default-styles
    // details, preset palette) was replaced by the LightKey layout in
    // tests/liveEditLightKey.test.ts. Page properties are managed from Page
    // Manager; object properties live in the slide-in popup.
    for (const text of [
      '{editing && !locked && <>',
      '{editing && !locked && popupOpen && selection &&',
      'if (!editing || locked) return'
    ]) expect(workspace).toContain(text)
  })
})
