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
    expect(workspace).toContain('const cueBody = (control: LiveControl, level: number)')
    expect(workspace).toContain('setLiveValue(control.id, level ? 0 : 255)')
    expect(workspace).toContain('setLiveValue(control.id, 255)')
    expect(workspace).toContain('type="range"')
    // The old edit-mode branch replaced the whole control with a drag-only
    // button, so cues could not fire, flash, fade or show lit in Edit.
    expect(workspace).not.toContain('↕ {control.name}')
    expect(workspace).not.toContain('className="w-full cursor-grab rounded bg-bg px-2 py-2 text-left"')
    // The activation handlers are written once, in cueBody, and the cue
    // render calls it unconditionally (no `editing ?` around activation).
    const cueBodyUses = workspace.split('cueBody(control, level)').length - 1
    expect(cueBodyUses).toBe(1)
  })

  it('moves cues only from an edit-mode drag grip, never from the activation body', () => {
    expect(workspace).toContain('aria-label={`Drag ${control.name}`}')
    expect(workspace).toContain('↕ drag')
    // The grip is the only beginDrag caller on a cue; the body has no drag.
    expect(workspace).toContain('onPointerDown={(e) => beginDrag(e, ref, x, y)}')
  })

  it('shows the cuelist transport in both modes', () => {
    // Go / Back / Stop used to be rendered only when `!editing`.
    expect(workspace).not.toContain('{!editing && list &&')
    expect(workspace).toContain('onClick={() => current >= 0 ? cueNext() : goToCue(list.id, 0)}>Go</button>')
    expect(workspace).toContain('onClick={cuePrev}')
    expect(workspace).toContain('onClick={stopCue}')
  })

  it('selects the pressed cue button or cue list in both modes, so the inspector follows it', () => {
    expect(workspace).toContain('const selectRef = (ref: Selection)')
    expect(workspace).toContain('onPointerDown={() => selectRef(ref)}')
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
    expect(store).toContain('setLiveValue: (id, value) => set((state) => {')
    expect(store).not.toContain('setLiveValue: (id, value) => set((state) => {\n    if (state.locked)')
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
