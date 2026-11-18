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
    expect(app).toContain('aria-label="Quit OpenLights"')
    expect(app).toContain('window.electronAPI.quitApp()')
    expect(app).not.toContain('src="./openlights-logo.png"')
    const projectBar = readFileSync('src/renderer/src/components/ProjectBar.tsx', 'utf8')
    const styles = readFileSync('src/renderer/src/index.css', 'utf8')
    expect(projectBar).not.toContain('<svg viewBox="0 0 28 18"')
    expect(styles).toContain('margin-left: 96px')
    expect(app).toContain('ref={editMenuRef}')
    expect(app).toContain('ref={settingsMenuRef}')
    expect(app).toContain("window.addEventListener('pointerdown', closeHeaderMenus)")
    expect(app).toContain("window.addEventListener('keydown', closeHeaderMenusOnEscape)")
    expect(main).toContain("titleBarStyle: 'hidden'")
    expect(main).toContain('titleBarOverlay:')
    expect(main).toContain("ipcMain.on('app:quit'")
    expect(main).toContain("event.sender.send('app:quitting')")
    expect(main).toContain("app.setName('OpenLights')")
    expect(main).toContain('app.dock.setIcon(nativeImage.createFromPath(APP_ICON))')
    expect(main).toContain("const USER_DATA_DIR = app.getPath('userData')")
    expect(main).not.toContain('frame: false')
  })
})
