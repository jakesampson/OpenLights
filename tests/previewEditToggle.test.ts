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

  it('makes the header Edit button the toggle, labelled Edit / Done', () => {
    expect(appSource).toContain('aria-pressed={previewEditing}')
    expect(appSource).toContain("onClick={() => setPreviewEditing(!previewEditing)}")
    expect(appSource).toContain("{previewEditing ? 'Done' : 'Edit'}")
    expect(appSource).toContain("disabled={locked || tab !== 'Design'}")
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
  })

  it('paints the header LightKey’s grey, sampled from Jake’s screenshot', () => {
    expect(styles).toContain('background: #444345')
    // Only the top bar: no other background rule uses the sampled grey.
    expect(styles.match(/#444345/g)).toHaveLength(1)
  })
})

describe('preview toolbar after the toggle move', () => {
  it('renders no Locate, Fan… or Edit layout buttons on the preview', () => {
    expect(previewSource).not.toContain('locateFixtures(selectedFixtureIds)')
    expect(previewSource).not.toContain("'Done' : 'Edit layout'")
    expect(previewSource).not.toContain('>Fan…')
    expect(previewSource).not.toContain('const [editing, setEditing]')
    // Edit state comes from the store now, and leaving Design or locking
    // exits edit mode.
    expect(previewSource).toContain('const editing = previewEditing')
    expect(previewSource).toContain('if (locked || !designMode) setPreviewEditing(false)')
    // The zoom cluster and the Preview label stay.
    expect(previewSource).toContain('Zoom out preview')
    expect(previewSource).toContain('>Preview</span>')
  })

  it('keeps fanning reachable from the Design panel (Guide §8, p.119)', () => {
    // The Design panel dispatches the event with the picked property;
    // the Preview listens and opens the HUD around the fixtures' icons.
    expect(designSource).toContain("openlights-open-fan-hud")
    expect(designSource).toContain('>Fan…')
    expect(designSource).toContain('LightKey Guide §8, p.118–122')
    expect(previewSource).toContain("window.addEventListener('openlights-open-fan-hud', handler)")
    expect(previewSource).toContain('FanningHud')
    // The HUD component and its store logic are untouched.
    expect(previewSource).toContain('onNewFan={openFanHud}')
  })
})
