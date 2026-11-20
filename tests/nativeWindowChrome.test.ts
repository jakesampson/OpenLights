// Native window chrome (Jake, 19 Nov 2026, screenshot image-7.png):
// the window's own close/minimize/maximize controls are the OS's, not
// buttons drawn by the app. On macOS the main window uses hiddenInset
// so macOS draws the native traffic lights at the top-left of the grey
// header; on Windows/Linux the native caption buttons come from the
// title bar overlay, restyled to the header itself. The old overlay
// was purple #3a1b47 at 72px — taller than the 50px header, which is
// the awkward block in Jake's screenshot. (An earlier 61px overlay
// had the same fault: under border-box the header's min-height 50
// already includes its padding and border, so 61 stuck out ~11px —
// Jake, 19 Nov 2026, screenshot image-8.png.) Source/wiring
// assertions (no DOM renderer), in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const main = readFileSync('src/main/index.ts', 'utf8')
const overlay = readFileSync('src/main/titleBarOverlay.ts', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const css = readFileSync('src/renderer/src/index.css', 'utf8')
const preload = readFileSync('src/preload/index.ts', 'utf8')

describe('macOS gets native traffic lights', () => {
  it('uses hiddenInset on darwin, with the lights centred in the header', () => {
    expect(main).toContain("titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden'")
    // 12px lights, vertically centred in the 50px header ((50 - 12) / 2).
    // The header is 50px, not 61: the app uses border-box, so min-height
    // 50 already includes its padding and border (see below).
    expect(main).toContain("{ x: 20, y: 19 }")
    // The header's .top-bar-mac spacing (patch icon at 80px, title at
    // 104px) already clears lights ending at ~72px.
    expect(css).toContain('.top-bar-mac .header-patch-button {')
    expect(css).toContain('left: 80px;')
  })
})

describe('Windows/Linux caption buttons match the header', () => {
  it('restyles the title bar overlay to the header grey at header height', () => {
    // Header grey #444345, header icon grey #d2d2d2, and the header's
    // exact rendered height: min-height 50 under box-sizing:
    // border-box, so padding and border are already inside the 50px —
    // the earlier 61px (50 + 5 + 5 + 1) double-counted them and the
    // overlay stuck out ~11px below the header (Jake, 19 Nov 2026,
    // screenshot image-8.png). The presets live in titleBarOverlay.ts;
    // the main window starts on the grey one.
    expect(overlay).toMatch(/TITLE_BAR_OVERLAY_MAIN[^}]*color: '#444345'/s)
    expect(overlay).toMatch(/TITLE_BAR_OVERLAY_MAIN[^}]*symbolColor: '#d2d2d2'/s)
    expect(overlay).toMatch(/TITLE_BAR_OVERLAY_MAIN[^}]*height: 50/s)
    expect(overlay).not.toContain('height: 72')
    expect(overlay).not.toContain('height: 61')
    expect(main).toContain('titleBarOverlay: process.platform === \'darwin\' ? false : TITLE_BAR_OVERLAY_MAIN')
  })

  it('switches the overlay to the wizard page colour while the wizard is open', () => {
    // The wizard page is purple, not the header grey — the native
    // buttons must blend with it, or they sit in a grey strip over the
    // wizard and cover its Back button (Jake, 20 Nov 2026, screenshot
    // image-25.png). The wizard preset is the panel colour, never the
    // header grey; the renderer reports the wizard state over IPC and
    // the main process restores the grey when it closes.
    expect(overlay).toMatch(/TITLE_BAR_OVERLAY_WIZARD[^}]*color: '#3a1b47'/s)
    expect(overlay).toMatch(/TITLE_BAR_OVERLAY_WIZARD[^}]*symbolColor: '#d2d2d2'/s)
    expect(overlay).toMatch(/TITLE_BAR_OVERLAY_WIZARD[^}]*height: 50/s)
    expect(main).toContain("ipcMain.on('window:set-titlebar-overlay'")
    expect(preload).toContain('setTitleBarOverlay')
    expect(app).toContain('setTitleBarOverlay')
  })
})

describe('no window controls are drawn by the renderer', () => {
  it('has no custom min/max/close buttons, state or IPC left', () => {
    expect(app).not.toContain('window-controls')
    expect(app).not.toContain('window-control')
    expect(app).not.toContain('minimizeWindow')
    expect(app).not.toContain('toggleWindowMaximize')
    expect(app).not.toContain('quitApp')
    expect(app).not.toContain('windowMaximized')
    expect(app).not.toContain('getWindowMaximized')
    expect(app).not.toContain('onWindowMaximized')
    expect(css).not.toContain('.window-controls')
    expect(css).not.toContain('.window-control')
    expect(preload).not.toContain('minimizeWindow')
    expect(preload).not.toContain('toggleWindowMaximize')
    expect(preload).not.toContain('quitApp')
    expect(preload).not.toContain('getWindowMaximized')
    expect(preload).not.toContain('onWindowMaximized')
    expect(main).not.toContain('window:minimize')
    expect(main).not.toContain('window:toggle-maximize')
    expect(main).not.toContain('window:is-maximized')
    expect(main).not.toContain("ipcMain.on('app:quit'")
    expect(main).not.toContain('window:maximized')
  })

  it('keeps the close path ProjectBar uses when switching projects', () => {
    expect(app).not.toContain('closeWindow')
    expect(preload).toContain('closeWindow')
    expect(main).toContain("ipcMain.on('window:close'")
  })
})
