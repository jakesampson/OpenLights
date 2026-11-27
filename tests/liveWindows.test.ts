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
    // (activeCueListId/activeCueIndex), so position alone would leave
    // a deactivated step reading as active.
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
    // The transport lives on the cuelist widget on the canvas now (Jake,
    // 27 Nov 2026 — cuelist as a widget, LightKey's way; the fixed
    // CueListsSection is gone); LiveTab renders the workspace, and the
    // widget in LiveWorkspace has its own transport.
    const liveTab = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/LiveTab.tsx'), 'utf8')
    const workspace = readFileSync(resolve(__dirname, '..', 'src/renderer/src/components/LiveWorkspace.tsx'), 'utf8')
    expect(liveTab).not.toContain('CueListsSection')
    // The widget transport calls its actions inside arrows (Jake,
    // 27 Nov 2026 — cuelist widget replication): Go/Stop wraps
    // stopCue(), the third button wraps cuePrev()/cueNext(). Go
    // restarts from the first enabled cue when the list is stopped
    // or finished (Jake, 28 Nov 2026) — it does not advance from
    // the current step.
    expect(workspace).toContain('if (playing) stopCue(); else if (firstIndex >= 0) goToCue(list.id, firstIndex)')
    expect(workspace).toContain('if (event.shiftKey) cuePrev(); else cueNext()')
    expect(workspace).not.toContain('onClick={stopCue}')
    expect(workspace).not.toContain('onClick={cuePrev}')
    expect(liveTab).toContain('onClick={() => clearPresets()}')
    expect(liveTab).not.toContain('onClick={clearPresets}')
    // Stop still deactivates with no arguments — the call lives in the
    // store's stopCue now (the row toggle that used to call
    // deactivateCue() is gone: single-click selects, double-click
    // activates, Guide ch.11 p.219).
    const store = readFileSync(resolve(__dirname, '..', 'src/renderer/src/stores/showStore.ts'), 'utf8')
    expect(store).toContain('if (state.cuePlaying && state.activeCueRef) get().deactivateCue()')
  })
})
