import type { CueDef, LiveControl, PresetDef } from '@shared/types'
import { resolveCueValues } from '@shared/cueResolution'

/**
 * The button colour a user picks in the properties popup defaults to this
 * purple (configureCueAppearance in showStore.ts) — it is a placeholder,
 * never a choice, so it must not win over the light colour (see
 * liveControlButtonColor). A deliberately picked colour does win.
 */
export const DEFAULT_BUTTON_APPEARANCE_COLOR = '#47235a'

/** LightKey's button-colour swatches (Jake's screenshot, 27 Nov 2026 —
 *  the Color submenu shows Automatic plus these twelve bars; every hex
 *  below was measured from that screenshot with PIL at the bar centres,
 *  so it is LightKey's palette, not an approximation). */
export const LIGHTKEY_BUTTON_COLORS: { hex: string; name: string }[] = [
  { hex: '#ffffff', name: 'White' },
  { hex: '#f19a98', name: 'Salmon' },
  { hex: '#f8cfa2', name: 'Peach' },
  { hex: '#fffb9f', name: 'Yellow' },
  { hex: '#dcfa9e', name: 'Light green' },
  { hex: '#a8f79d', name: 'Green' },
  { hex: '#a7fafd', name: 'Cyan' },
  { hex: '#9bc8fa', name: 'Light blue' },
  { hex: '#a4a9f9', name: 'Periwinkle' },
  { hex: '#c7acf9', name: 'Lavender' },
  { hex: '#f19fea', name: 'Pink' },
  { hex: '#f9daf1', name: 'Pale pink' },
]

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** The text colour with the better WCAG contrast against `background` —
 *  dark text on light colours, light text on dark ones. */
export function contrastingTextColor(background: string): string {
  return contrastRatio(background, '#111111') >= contrastRatio(background, '#ffffff') ? '#111111' : '#ffffff'
}

/** A hex colour at an alpha, as an rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/**
 * The light colour a Live button takes on (Jake, 22 Nov 2026): a colour
 * preset button shows its colour (Red renders red, Green green); a
 * dimmer-only button has no colour associated with it and returns null —
 * the caller defaults that to white. A cue button resolves its cue's
 * look; a button with only sequences has no static colour and also
 * returns null.
 *
 * The averaging mirrors getPresetColor (presetColor.ts — white/amber
 * mixed into RGB, peak scaled to 220) so a button and the cue dot agree,
 * with one difference: intensity is not skipped. The colour is the
 * association with the preset, not whether the preset's stored intensity
 * happens to be up — a Red preset captured while dark still reads red.
 * UV / Lime name no RGB channel, so a UV- or Lime-only button also
 * returns null (white) rather than inventing a colour.
 */
export function liveControlButtonColor(
  control: LiveControl,
  presets: PresetDef[],
  cues: CueDef[] = []
): string | null {
  const chosen = control.appearance?.color
  if (chosen && chosen.toLowerCase() !== DEFAULT_BUTTON_APPEARANCE_COLOR) return chosen
  const cue = control.cueId ? cues.find((item) => item.id === control.cueId) : undefined
  const source: CueDef = cue ?? {
    id: control.id,
    name: control.name,
    presetIds: control.presetIds ?? [],
    sequenceIds: control.sequenceIds ?? [],
    fixtureValues: control.adHocValues ?? {},
    fadeMs: 0
  }
  let red = 0
  let green = 0
  let blue = 0
  let count = 0
  let named = false
  for (const values of Object.values(resolveCueValues(source, presets))) {
    const white = clampByte(values.white ?? 0)
    const amber = clampByte(values.amber ?? 0)
    if (values.red || values.green || values.blue || white || amber) named = true
    red += clampByte((values.red ?? 0) + white + amber)
    green += clampByte((values.green ?? 0) + white + amber * 0.45)
    blue += clampByte((values.blue ?? 0) + white)
    count++
  }
  if (!named || !count) return null
  red /= count
  green /= count
  blue /= count
  const peak = Math.max(red, green, blue)
  if (peak === 0) return null
  const scale = 220 / peak
  const hex = (value: number) => clampByte(value * scale).toString(16).padStart(2, '0')
  return `#${hex(red)}${hex(green)}${hex(blue)}`
}

/** A button's fill: a translucent tint of its light colour while off (the
 *  LightKey look — the colour shows against the dark panel), solid while
 *  lit. */
export function liveButtonBackground(color: string, active: boolean): string {
  return active ? color : withAlpha(color, 0.28)
}

/**
 * A button's text colour. Off, the fill is a translucent tint over the
 * dark canvas (#3a1b47), so the effective background is always dark
 * enough for white text — even white at 28% composites to a dark grey,
 * about 6:1 against white. Lit, the fill is solid, so the text follows
 * whichever of dark/light reads better against the colour.
 */
export function liveButtonTextColor(color: string, active: boolean): string {
  return active ? contrastingTextColor(color) : '#ffffff'
}
