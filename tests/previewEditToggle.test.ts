import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { SHORTCUTS, matchShortcut } from '../src/renderer/src/lib/shortcuts'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

const storeSource = readFileSync('src/renderer/src/stores/showStore.ts', 'utf8')
const appSource = readFileSync('src/renderer/src/App.tsx', 'utf8')
const previewSource = readFileSync('src/renderer/src/components/StagePreview.tsx', 'utf8')
const designSource = readFileSync('src/renderer/src/components/DesignTab.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/index.css', 'utf8')
const shortcutsSource = readFileSync('src/renderer/src/lib/shortcuts.ts', 'utf8')

describe('preview edit toggle (LightKey Guide p.53)', () => {
  it('holds preview editing as session-only store state, like liveEditing', () => {
    expect(storeSource).toContain('previewEditing: boolean')
    expect(storeSource).toContain('setPreviewEditing: (editing: boolean) => void')
    expect(storeSource).toContain('setPreviewEditing: (editing) => set({ previewEditing: editing })')
    const s = () => useShowStore.getState()
    expect(s().previewEditing).toBe(false)
    s().setPreviewEditing(true)
    expect(s().previewEditing).toBe(true)
    s().setPreviewEditing(false)
    expect(s().previewEditing).toBe(false)
    // Loading a show resets it, like liveEditing.
    s().setPreviewEditing(true)
    s().setShow(migrateShow({ fixtures: [] }))
    expect(s().previewEditing).toBe(false)
  })

  it('makes the header Edit button the Preview-only toggle, labelled Edit / Done', () => {
    // The header Edit button toggles Preview editing only (Jake,
    // 20 Nov 2026): Live page editing has its own Edit button in the
    // Live panel. The old context-sensitive handler flipped whichever
    // mode matched the current tab, so each button flipped both.
    expect(appSource).toContain('aria-pressed={previewEditing}')
    expect(appSource).toContain('onClick={togglePreviewEditing}')
    expect(appSource).toContain("{previewEditing ? 'Done' : 'Edit'}")
    expect(appSource).toContain('disabled={locked}')
    expect(appSource).not.toContain("disabled={locked || tab !== 'Design'}")
    expect(appSource).not.toContain('toggleCurrentViewEditing')
    expect(appSource).not.toContain('setLiveEditing(!state.liveEditing)')
    expect(appSource).not.toContain('ref={editMenuRef}')
    expect(appSource).not.toContain('Undo · Ctrl+Z')
  })

  it('toggles from Command-J, the guide’s alternate trigger', () => {
    expect(shortcutsSource).toContain("command: 'editPreview'")
    expect(shortcutsSource).toContain("code: 'j'")
    const binding = SHORTCUTS.find((item) => item.command === 'editPreview')
    expect(binding?.key).toBe('Ctrl+J')
    expect(matchShortcut({ key: 'j', metaKey: true }, { tagName: 'DIV' })?.command).toBe('editPreview')
    expect(matchShortcut({ key: 'j' }, { tagName: 'DIV' })).toBeUndefined()
    expect(appSource).toContain("command === 'editPreview'")
    // Cmd-J toggles Preview editing only — never Live editing.
    expect(appSource).toContain("command === 'editPreview') togglePreviewEditing()")
    expect(appSource).not.toContain('toggleCurrentViewEditing')
  })

  it('paints the header LightKey’s grey, sampled from Jake’s screenshot', () => {
    expect(styles).toContain('background: #444345')
    // Only the top bar: no other background rule uses the sampled grey.
    expect(styles.match(/#444345/g)).toHaveLength(1)
  })
  it('keeps the two Edit buttons independent (Jake, 20 Nov 2026)', () => {
    // The header button writes previewEditing only; the Live panel's own
    // toggleEditing writes liveEditing only. Neither file may reference
    // the other's setter, and the store flags stay independent.
    expect(appSource).not.toContain('setLiveEditing')
    const liveSource = readFileSync('src/renderer/src/components/LiveWorkspace.tsx', 'utf8')
    expect(liveSource).not.toContain('setPreviewEditing')
    expect(liveSource).toContain('setLiveEditing(true)')
    expect(liveSource).toContain('setLiveEditing(false)')
    const s = () => useShowStore.getState()
    s().setPreviewEditing(true)
    expect(s().liveEditing).toBe(false)
    s().setLiveEditing(true)
    expect(s().previewEditing).toBe(true)
    s().setPreviewEditing(false)
    expect(s().liveEditing).toBe(true)
    s().setLiveEditing(false)
  })
})

describe('preview toolbar after the toggle move', () => {
  it('renders no Locate, Fan… or Edit layout buttons on the preview', () => {
    expect(previewSource).not.toContain('locateFixtures(selectedFixtureIds)')
    expect(previewSource).not.toContain("'Done' : 'Edit layout'")
    expect(previewSource).not.toContain('>Fan…')
    expect(previewSource).not.toContain('const [editing, setEditing]')
    // Edit state comes from the store now, and locking exits edit mode.
    // Leaving Design does NOT exit it: the header Edit button is
    // Preview-only and must keep working in the Live tab (Jake,
    // 20 Nov 2026) — the old auto-clear undid every header toggle
    // made while in Live.
    expect(previewSource).toContain('const editing = previewEditing')
    expect(previewSource).toContain('if (locked) setPreviewEditing(false)')
    expect(previewSource).not.toContain('if (locked || !designMode) setPreviewEditing(false)')
    // The floating zoom cluster and the Preview label are gone from
    // the canvas (26 Nov 2026 cleanup — LightKey has neither in edit
    // mode); zoom lives in the View menu, on shortcuts and the wheel.
    expect(previewSource).not.toContain('Zoom out preview')
    expect(previewSource).not.toContain('>Preview</span>')
  })

  it('keeps fanning reachable from each Design panel control (Guide §8, p.119)', () => {
    // Each property's control dispatches the event with its own
    // property; the Preview listens and opens the HUD around the
    // fixtures' icons. No single Fan… button any more.
    expect(designSource).toContain("dispatchFanHud({ attribute: 'intensity' })")
    expect(designSource).toContain("dispatchFanHud({ attribute: 'color' })")
    expect(designSource).not.toContain('>Fan…')
    expect(previewSource).toContain("window.addEventListener('openlights-open-fan-hud', handler)")
    expect(previewSource).toContain('FanningHud')
    // The HUD component and its store logic are untouched.
    expect(previewSource).toContain('onNewFan={openFanHud}')
  })
})
