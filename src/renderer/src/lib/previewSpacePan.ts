// LightKey Guide p.53: "You can hold down the Space bar and drag to pan
// the Preview area." Space is also OpenLights' Go shortcut (shortcuts.ts),
// so while Space is held over the Preview in edit mode the Go command must
// not fire — App's key handler reads this flag before running Go.
// StagePreview's window keydown listener is registered first (child effects
// run before parent effects in React), so the flag is already set by the
// time App's handler runs; StagePreview clears it on keyup and on blur.
export const previewSpacePan = { held: false }
