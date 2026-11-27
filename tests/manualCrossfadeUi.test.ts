import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 8.8a — manual crossfade fader (LightKey Guide ch.11, p.191: the Xfade
// slider lives in the cuelist; p.219: drag it from its current position
// to the opposite end to crossfade from the current cue to the next).
// The live-output behaviour is covered at the store level in
// tests/store.test.ts and the pure helpers in
// tests/cueListPlayback.test.ts; these tests prove the UI wiring — the
// slider is rendered inside the cuelist widget on the Live page and
// drives the store.
describe('manual crossfade fader UI (8.8a)', () => {
  const root = resolve(__dirname, '..')
  const slider = readFileSync(resolve(root, 'src/renderer/src/components/XfadeSlider.tsx'), 'utf8')
  const liveTab = readFileSync(resolve(root, 'src/renderer/src/components/LiveTab.tsx'), 'utf8')
  const workspace = readFileSync(resolve(root, 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')

  it('is a slider in the cuelist that drives the manual crossfade store value', () => {
    expect(slider).toContain('type="range"')
    expect(slider).toContain('aria-label={`Xfade ${list.name}`}')
    expect(slider).toContain('onChange={(event) => setManualCrossfade(Number(event.target.value))}')
    expect(slider).toContain('manualCrossfadeNextIndex(list, activeCueIndex)')
    expect(slider).toContain('manualCrossfadeProgress(manualCrossfadeAnchor, manualCrossfade)')
  })

  it('is disabled until playback has started and while there is no next cue', () => {
    expect(slider).toContain('const active = activeCueListId === list.id && activeCueIndex >= 0')
    expect(slider).toContain('const disabled = !active || !next')
    expect(slider).toContain('disabled={disabled}')
  })

  it('lives only in the cuelist widget — there is no fixed Cue Lists section any more', () => {
    // Jake, 27 Nov 2026 — cuelist as a canvas widget, LightKey's way;
    // the fixed CueListsSection is gone from both Live views.
    expect(liveTab).not.toContain('CueListsSection')
    const app = readFileSync(resolve(root, 'src/renderer/src/App.tsx'), 'utf8')
    expect(app).not.toContain('CueListsSection')
    expect(workspace).toContain('<XfadeSlider vertical listId={list.id} />')
  })

  it('is rendered inside the cuelist widget on the Live page', () => {
    expect(workspace).toContain('<XfadeSlider vertical listId={list.id} />')
    // The widget transport is the three pill buttons (Jake, 27 Nov 2026
    // — cuelist widget replication): Go/Stop, Pause, Next (Shift-click:
    // previous) — ▶/■, ❚❚, »/« glyphs with aria-labels, no Back /
    // Current: / Next: text any more.
    for (const text of ["aria-label={playing ? 'Stop cuelist' : 'Go'}", "aria-label={cuePaused ? 'Resume cuelist' : 'Pause cuelist'}", 'aria-label="Next cue"', '{goingForward ? \'»\' : \'«\'}']) expect(workspace).toContain(text)
    // ("Back" alone would also match liveButtonBackground; the old
    // transport's text buttons are the precise strings.)
    for (const text of ['>Back</button>', '>Go</button>', 'Current:', 'Next:']) expect(workspace).not.toContain(text)
  })
})
