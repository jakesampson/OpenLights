import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeLiveWindows, LIVE_WINDOW_COMMANDS } from '../src/shared/liveWindows'
describe('Live window restoration', () => {
  it('round trips saved descriptors and filters malformed or duplicate windows', () => {
    const saved = [{ id: 'w', pageId: 'p', width: 1000, height: 700 }]
    expect(normalizeLiveWindows(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
    expect(normalizeLiveWindows([null, ...saved, ...saved])).toEqual(saved)
    expect(normalizeLiveWindows([{ id: 'tiny', width: 1, height: 1 }])[0]).toMatchObject({ width: 640, height: 480 })
    expect(LIVE_WINDOW_COMMANDS).toContain('setLiveValue')
    expect(LIVE_WINDOW_COMMANDS).not.toContain('setShow')
    // The cuelist row toggle (Jake, 26 Nov 2026 — Option 2) calls
    // deactivateCue from the Live window. It must be a whitelisted
    // command, or the click only runs locally in the Live window's copy
    // of the store and the main window — and the rig — never hear it.
    expect(LIVE_WINDOW_COMMANDS).toContain('deactivateCue')
    // …and the row's active flag must also require the step's cue to be
    // the active one: deactivateCue deliberately keeps the list position
    // (activeCueListId/activeCueIndex) so Go resumes, so position alone
    // would leave a deactivated step reading as active.
    expect(LIVE_WINDOW_COMMANDS).toContain('stopCue')
  })

  it('never passes the click event to a proxied Live-window command', () => {
    // 26 Nov 2026, found by the real-app probe: the Live window's
    // Stop/Back/Clear-presets buttons were wired as onClick={stopCue}
    // etc. React passes the SyntheticEvent as the first argument, and
    // in the Live window those actions are IPC proxies that forward
    // EVERY argument — Electron's structured clone rejects the event,
    // so the command never reached the main window and the buttons
    // silently did nothing (plus a "could not be cloned" page error).
    // Every Live-window handler must call the action with no arguments.
    // The transport lives in the shared CueListsSection now (Jake, 27
    // Nov 2026 — the main window's Live tab shows the compact transport
    // too); LiveTab renders it, and the cuelist widget in LiveWorkspace
    // has its own transport.
    const section = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/CueListsSection.tsx'), 'utf8')
    const liveTab = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/LiveTab.tsx'), 'utf8')
    const workspace = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
    expect(liveTab).toContain('<CueListsSection />')
    for (const source of [section, workspace]) {
      expect(source).toContain('onClick={() => stopCue()}')
      expect(source).toContain('onClick={() => cuePrev()}')
      expect(source).not.toContain('onClick={stopCue}')
      expect(source).not.toContain('onClick={cuePrev}')
    }
    expect(liveTab).toContain('onClick={() => clearPresets()}')
    expect(liveTab).not.toContain('onClick={clearPresets}')
    // The row toggle already called deactivateCue() with no args — pin it.
    expect(section).toContain('deactivateCue()')
  })
})
