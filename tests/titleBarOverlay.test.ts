// Native caption-button strip (Windows/Linux titleBarOverlay) colours.
// The main window keeps LightKey's header grey; while the setup wizard is
// open the strip must match the wizard page, or the native buttons sit in
// a grey band over the wizard and cover its Back button (Jake, 20 Nov 2026,
// screenshot image-25.png). While the Project Browser is open the strip
// must match the app background purple instead (Jake, 23 Nov 2026,
// screenshot image-ff69c11b.png).
import { describe, it, expect } from 'vitest'
import { TITLE_BAR_OVERLAY_MAIN, TITLE_BAR_OVERLAY_WIZARD, TITLE_BAR_OVERLAY_WELCOME, titleBarOverlayForWizard, titleBarOverlayForScreen } from '../src/main/titleBarOverlay'

describe('title bar overlay', () => {
  it('main window keeps LightKey header grey at the header height', () => {
    expect(TITLE_BAR_OVERLAY_MAIN).toEqual({ color: '#444345', symbolColor: '#d2d2d2', height: 50 })
  })

  it('wizard uses the wizard page panel colour, same glyphs and height', () => {
    expect(TITLE_BAR_OVERLAY_WIZARD).toEqual({ color: '#3a1b47', symbolColor: '#d2d2d2', height: 50 })
  })

  it('welcome screen uses the app background purple, same glyphs and height', () => {
    expect(TITLE_BAR_OVERLAY_WELCOME).toEqual({ color: '#2a1233', symbolColor: '#d2d2d2', height: 50 })
  })

  it('selector returns the main overlay when the wizard is closed', () => {
    expect(titleBarOverlayForWizard(false)).toBe(TITLE_BAR_OVERLAY_MAIN)
  })

  it('selector returns the wizard overlay while the wizard is open', () => {
    expect(titleBarOverlayForWizard(true)).toBe(TITLE_BAR_OVERLAY_WIZARD)
  })

  it('screen selector maps each surface to its overlay', () => {
    expect(titleBarOverlayForScreen('main')).toBe(TITLE_BAR_OVERLAY_MAIN)
    expect(titleBarOverlayForScreen('wizard')).toBe(TITLE_BAR_OVERLAY_WIZARD)
    expect(titleBarOverlayForScreen('welcome')).toBe(TITLE_BAR_OVERLAY_WELCOME)
  })

  it('screen selector falls back to the main overlay for an unknown mode', () => {
    expect(titleBarOverlayForScreen('nonsense')).toBe(TITLE_BAR_OVERLAY_MAIN)
    expect(titleBarOverlayForScreen('')).toBe(TITLE_BAR_OVERLAY_MAIN)
  })

  it('wizard and main differ only in colour — the grey stays grey', () => {
    expect(TITLE_BAR_OVERLAY_WIZARD.color).not.toBe(TITLE_BAR_OVERLAY_MAIN.color)
    expect(TITLE_BAR_OVERLAY_WIZARD.symbolColor).toBe(TITLE_BAR_OVERLAY_MAIN.symbolColor)
    expect(TITLE_BAR_OVERLAY_WIZARD.height).toBe(TITLE_BAR_OVERLAY_MAIN.height)
  })

  it('welcome and main differ only in colour — the grey stays grey', () => {
    expect(TITLE_BAR_OVERLAY_WELCOME.color).not.toBe(TITLE_BAR_OVERLAY_MAIN.color)
    expect(TITLE_BAR_OVERLAY_WELCOME.symbolColor).toBe(TITLE_BAR_OVERLAY_MAIN.symbolColor)
    expect(TITLE_BAR_OVERLAY_WELCOME.height).toBe(TITLE_BAR_OVERLAY_MAIN.height)
  })
})
