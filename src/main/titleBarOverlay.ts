// Native caption-button strip (Windows/Linux titleBarOverlay) colours.
//
// The main window uses LightKey's header grey #444345 at the header's exact
// 50px height. While the setup wizard is showing, the strip must match the
// wizard page instead: the wizard's step bar is the panel colour #3a1b47, so
// the native minimise / maximise / close buttons blend with the wizard
// instead of sitting in a grey strip over it (Jake, 20 Nov 2026, screenshot
// image-25.png — the grey strip covered the wizard's Back button). While
// the Project Browser (welcome screen) is showing, the strip must match
// the welcome screen's background instead: the app background #2a1233, or
// the native buttons sit in a grey strip over the purple (Jake, 23 Nov
// 2026, screenshot image-ff69c11b.png). The main window keeps its grey.
// macOS ignores these (native traffic lights).
//
// Note: the welcome preset is the default `--bg` #2a1233. The adaptive
// background setting (`:root[data-adaptive="true"]`) re-tints --bg to the
// fixture hue, and the strip stays on the default purple then — the main
// process only ever sees a static colour, so an exact adaptive match
// would need the renderer to send the computed colour. The default
// adaptive hue (283) reproduces #2a1233, so the strip matches whenever
// the hue is at its default.

export interface TitleBarOverlayOptions {
  color: string
  symbolColor: string
  height: number
}

/** Which full-window surface the caption buttons sit over. */
export type TitleBarOverlayMode = 'main' | 'wizard' | 'welcome'

/** The main application window's overlay: LightKey header grey. */
export const TITLE_BAR_OVERLAY_MAIN: TitleBarOverlayOptions = {
  color: '#444345',
  symbolColor: '#d2d2d2',
  height: 50
}

/** The setup wizard's overlay: the wizard step bar's panel colour. */
export const TITLE_BAR_OVERLAY_WIZARD: TitleBarOverlayOptions = {
  color: '#3a1b47',
  symbolColor: '#d2d2d2',
  height: 50
}

/** The Project Browser's overlay: the app background purple. */
export const TITLE_BAR_OVERLAY_WELCOME: TitleBarOverlayOptions = {
  color: '#2a1233',
  symbolColor: '#d2d2d2',
  height: 50
}

/** Which overlay the window should show for a given surface. An
 *  unknown mode falls back to the main window's grey — the renderer
 *  only ever sends the three known modes, but a stray value must never
 *  leave the window without an overlay. */
export function titleBarOverlayForScreen(mode: TitleBarOverlayMode | string): TitleBarOverlayOptions {
  if (mode === 'wizard') return TITLE_BAR_OVERLAY_WIZARD
  if (mode === 'welcome') return TITLE_BAR_OVERLAY_WELCOME
  return TITLE_BAR_OVERLAY_MAIN
}

/** Which overlay the window should show: the wizard's while the setup
 *  wizard is open, the main window's otherwise. */
export function titleBarOverlayForWizard(wizardOpen: boolean): TitleBarOverlayOptions {
  return titleBarOverlayForScreen(wizardOpen ? 'wizard' : 'main')
}
