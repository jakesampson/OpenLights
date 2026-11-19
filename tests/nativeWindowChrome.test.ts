// Native window chrome (Jake, 19 Nov 2026, screenshot image-7.png):
// the window's own close/minimize/maximize controls are the OS's, not
// buttons drawn by the app. On macOS the main window uses hiddenInset
// so macOS draws the native traffic lights at the top-left of the grey
// header; on Windows/Linux the native caption buttons come from the
// title bar overlay, restyled to the header itself. The old overlay
// was purple #3a1b47 at 72px — taller than the 61px header, which is
// the awkward block in Jake's screenshot. Source/wiring assertions
// (no DOM renderer), in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const main = readFileSync('src/main/index.ts', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const css = readFileSync('src/renderer/src/index.css', 'utf8')
const preload = readFileSync('src/preload/index.ts', 'utf8')

describe('macOS gets native traffic lights', () => {
  it('uses hiddenInset on darwin, with the lights centred in the header', () => {
    expect(main).toContain("titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden'")
    // 12px lights, vertically centred in the 61px header ((61 - 12) / 2).
    expect(main).toContain("{ x: 20, y: 24 }")
    // The header's .top-bar-mac spacing (patch icon at 80px, title at
    // 104px) already clears lights ending at ~72px.
    expect(css).toContain('.top-bar-mac .header-patch-button {')
    expect(css).toContain('left: 80px;')
  })
})

describe('Windows/Linux caption buttons match the header', () => {
  it('restyles the title bar overlay to the header grey at header height', () => {
    // Header grey #444345, header icon grey #d2d2d2, and the header's
    // exact rendered height: min-height 50 + 5px padding top/bottom +
    // 1px border = 61px, so the overlay strip is flush with the header
    // and nothing sticks out below it.
    expect(main).toContain("{ color: '#444345', symbolColor: '#d2d2d2', height: 61 }")
    expect(main).not.toContain('#3a1b47')
    expect(main).not.toContain('height: 72')
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
