// Native caption-button strip (Windows/Linux titleBarOverlay) colours.
//
// The main window uses LightKey's header grey #444345 at the header's exact
// 50px height. While the setup wizard is showing, the strip must match the
// wizard page instead: the wizard's step bar is the panel colour #3a1b47, so
// the native minimise / maximise / close buttons blend with the wizard
// instead of sitting in a grey strip over it (Jake, 20 Nov 2026, screenshot
// image-25.png — the grey strip covered the wizard's Back button). The main
// window keeps its grey. macOS ignores these (native traffic lights).

export interface TitleBarOverlayOptions {
  color: string
  symbolColor: string
  height: number
}

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

/** Which overlay the window should show: the wizard's while the setup
 *  wizard is open, the main window's otherwise. */
export function titleBarOverlayForWizard(wizardOpen: boolean): TitleBarOverlayOptions {
  return wizardOpen ? TITLE_BAR_OVERLAY_WIZARD : TITLE_BAR_OVERLAY_MAIN
}
