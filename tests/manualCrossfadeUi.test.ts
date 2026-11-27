import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 8.8a — manual crossfade fader (LightKey Guide ch.11, p.191: the Xfade
// slider lives in the cuelist; p.219: drag it from its current position
// to the opposite end to crossfade from the current cue to the next).
// The live-output behaviour is covered at the store level in
// tests/store.test.ts and the pure helpers in
// tests/cueListPlayback.test.ts; these tests prove the UI wiring — the
// slider is rendered inside both cuelist surfaces and drives the store.
describe('manual crossfade fader UI (8.8a)', () => {
  const root = resolve(__dirname, '..')
  const slider = readFileSync(resolve(root, 'src/renderer/src/components/XfadeSlider.tsx'), 'utf8')
  const section = readFileSync(resolve(root, 'src/renderer/src/components/CueListsSection.tsx'), 'utf8')
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

  it('is rendered inside the cuelist in the Live tab Cue Lists section', () => {
    // The section moved from LiveTab into the shared CueListsSection
    // (Jake, 27 Nov 2026); LiveTab renders it, and the main window's
    // Live tab renders the compact variant.
    expect(section).toContain('<XfadeSlider listId={list.id} />')
    expect(liveTab).toContain('<CueListsSection />')
    // The existing cuelist transport is untouched.
    for (const text of ['Stop', 'Back', 'Go', 'Current', 'Next']) expect(section).toContain(text)
  })

  it('is rendered inside the cuelist widget on the Live page', () => {
    expect(workspace).toContain('<XfadeSlider listId={list.id} />')
    // The existing widget transport is untouched.
    for (const text of ['Stop', 'Back', 'Go', 'Current:', 'Next:']) expect(workspace).toContain(text)
  })
})
