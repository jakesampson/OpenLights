import { describe, expect, it, vi } from 'vitest'
import { runToolbarCommand, type ToolbarCommand } from '../src/renderer/src/lib/toolbarCommands'
import { readFileSync } from 'node:fs'
describe('toolbar dispatch', () => {
  it('dispatches each command only to its intended action', () => {
    const names: ToolbarCommand[] = ['design', 'live', 'blackout', 'tap']
    for (const name of names) {
      const actions = { design: vi.fn(), live: vi.fn(), blackout: vi.fn(), tap: vi.fn() }
      runToolbarCommand(name, actions)
      for (const other of names) expect(actions[other]).toHaveBeenCalledTimes(other === name ? 1 : 0)
    }
  })
  it('uses one Lightkey-style header without a master slider', () => {
    const toolbar = readFileSync('src/renderer/src/components/WorkspaceToolbar.tsx', 'utf8')
    const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
    const main = readFileSync('src/main/index.ts', 'utf8')
    expect(toolbar).not.toContain('Master intensity')
    expect(toolbar).toContain('Fixture property menu')
    expect(toolbar).toContain('Copy Property')
    expect(toolbar).toContain('Add Effect for:')
    expect(toolbar).toContain('Optional lock PIN')
    expect(toolbar).toContain('Incorrect PIN')
    expect(toolbar).not.toContain('window.prompt')
    expect(toolbar).toContain("querySelectorAll<HTMLDetailsElement>('details[open]')")
    expect(toolbar).toContain("window.addEventListener('pointerdown', closeOutside)")
    expect(app.match(/<WorkspaceToolbar/g)).toHaveLength(1)
    expect(app).toContain('aria-label="Active cue"')
    expect(app).toContain('className="lightkey-action header-patch-button"')
    expect(app).not.toContain('src="./openlights-logo.png"')
    const projectBar = readFileSync('src/renderer/src/components/ProjectBar.tsx', 'utf8')
    const styles = readFileSync('src/renderer/src/index.css', 'utf8')
    expect(projectBar).not.toContain('<svg viewBox="0 0 28 18"')
    expect(app).toContain("top-bar ${isMac ? 'top-bar-mac' : ''}")
    expect(styles).toContain('.top-bar-mac .lightkey-project')
    expect(styles).toContain('margin-left: 104px')
    expect(styles).toContain('.header-patch-button')
    expect(styles).toContain('.top-bar-mac .header-patch-button')
    expect(styles).toContain('left: 80px')
    expect(styles).toContain('min-height: 50px')
    expect(styles).toContain('width: 32px')
    expect(styles).toContain('height: 34px')
    // Header grey is LightKey's, sampled from Jake's LightKey header
    // screenshot (RGB 68, 67, 69) — the bar only, not a retheme.
    expect(styles).toContain('background: #444345')
    expect(styles).not.toContain('color-mix(in srgb, var(--panel) 82%, #33413d)')
    // The header Edit control is the Preview edit toggle now (LightKey
    // Guide p.53), not the old Undo/Redo dropdown — Undo/Redo live in
    // the native app menu and on Ctrl+Z / Ctrl+Y instead.
    expect(app).not.toContain('ref={editMenuRef}')
    expect(app).not.toContain('Undo · Ctrl+Z')
    expect(app).toContain("aria-pressed={tab === 'Design' ? previewEditing : liveEditing}")
    expect(app).toContain('toggleCurrentViewEditing')
    expect(app).toContain("{(tab === 'Design' ? previewEditing : liveEditing) ? 'Done' : 'Edit'}")
    expect(app).toContain('ref={settingsMenuRef}')
    expect(app).toContain("window.addEventListener('pointerdown', closeHeaderMenus)")
    expect(app).toContain("window.addEventListener('keydown', closeHeaderMenusOnEscape)")
    const search = readFileSync('src/renderer/src/components/ProjectSearch.tsx', 'utf8')
    expect(search).toContain("aria-expanded={open}")
    expect(search).toContain("setOpen(true)")
    expect(search).toContain("window.addEventListener('pointerdown', closeOutside)")
    expect(search).toContain("window.addEventListener('keydown', closeOnEscape)")
    expect(styles).toContain('.project-search.open')
    expect(styles).not.toContain('.project-search:hover > input')
    // Search expands by flex reflow, not by overlay: it is an in-flow item,
    // the right cluster is pinned by an auto margin on Edit, and no
    // :has() transform nudges remain (they moved paint, not layout, and
    // let the open field paint over Edit).
    expect(styles).toContain('.top-bar > .flex:first-child > :nth-child(3) { margin-left: auto; }')
    expect(styles).not.toContain('.project-search { position: absolute')
    expect(styles).not.toContain(':nth-child(5) { position: absolute')
    expect(styles).not.toContain(':has(.project-search.open)')
    expect(styles).not.toContain('right: 196px')
    expect(styles).not.toContain('.top-bar-mac .project-search')
    expect(main).toContain("titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden'")
    expect(main).toContain('titleBarOverlay:')
    expect(main).toContain("mainWindow?.webContents.send('app:quitting')")
    expect(main).toContain("app.setName('OpenLights')")
    expect(main).toContain('app.dock.setIcon(nativeImage.createFromPath(APP_ICON))')
    expect(main).toContain("const USER_DATA_DIR = app.getPath('userData')")
    expect(main).not.toContain('frame: false')
  })
})
