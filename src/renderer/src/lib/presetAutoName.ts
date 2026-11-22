import type { PresetCategory } from '@shared/types'

// LightKey-style auto-naming for a freshly captured preset (Jake, 22 Nov
// 2026): LightKey names a preset from the colour selected (his screenshot
// shows "Orange" and "Dark Blue"), or — when it is just dimmer — from the
// percentage ("28%", "70%", "Full On", "Off" in his LightKey screenshot).
// The name is only a starting point: the row opens in rename mode with
// the text selected, ready to type over.
//
// What LightKey's exact colour-name table is, the sources do not say —
// the guide never lists it and the screenshots show only two names — so
// the colour name is a hue name with a Dark/Light qualifier from the
// HSL lightness, which reproduces both visible names (Orange for a
// mid orange, Dark Blue for a deep blue). The dimmer names, by contrast,
// are exactly LightKey's visible ones: 0% is "Off", 100% is "Full On".

const HUE_NAMES: { max: number; name: string }[] = [
  { max: 15, name: 'Red' },
  { max: 45, name: 'Orange' },
  { max: 70, name: 'Yellow' },
  { max: 160, name: 'Green' },
  { max: 195, name: 'Cyan' },
  { max: 255, name: 'Blue' },
  { max: 285, name: 'Purple' },
  { max: 345, name: 'Magenta' },
  { max: 360, name: 'Red' }
]

/** LightKey-style colour name for an RGB triple (each 0–255). */
export function colorNameForRgb(red: number, green: number, blue: number): string {
  const r = Math.max(0, Math.min(255, red))
  const g = Math.max(0, Math.min(255, green))
  const b = Math.max(0, Math.min(255, blue))
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2 / 255
  // Near-grey: no hue to name.
  if (max - min < 24) {
    if (max > 235) return 'White'
    if (max < 40) return 'Black'
    return lightness > 0.66 ? 'Light Grey' : lightness < 0.33 ? 'Dark Grey' : 'Grey'
  }
  let hue: number
  if (max === r) hue = ((g - b) / (max - min)) * 60
  else if (max === g) hue = ((b - r) / (max - min)) * 60 + 120
  else hue = ((r - g) / (max - min)) * 60 + 240
  hue = (hue + 360) % 360
  const base = HUE_NAMES.find((entry) => hue < entry.max)?.name ?? 'Red'
  if (lightness < 0.33) return `Dark ${base}`
  if (lightness > 0.72) return `Light ${base}`
  return base
}

function firstColour(values: Record<string, number>): { r: number; g: number; b: number } | { led: string } | null {
  const has = (key: string) => Number.isFinite(values[key])
  // Beam 1 first (the wheel writes the bare names); a per-beam colour
  // captured on another beam falls back to its numbered names.
  if (has('red') || has('green') || has('blue')) {
    return { r: values.red ?? 0, g: values.green ?? 0, b: values.blue ?? 0 }
  }
  if (has('red1') || has('green1') || has('blue1')) {
    return { r: values.red1 ?? 0, g: values.green1 ?? 0, b: values.blue1 ?? 0 }
  }
  // CMY fixtures: convert to RGB for naming.
  if (has('cyan') || has('magenta') || has('yellow')) {
    return { r: 255 - (values.cyan ?? 0), g: 255 - (values.magenta ?? 0), b: 255 - (values.yellow ?? 0) }
  }
  if (has('white') || has('coolwhite')) return { led: 'White' }
  if (has('amber')) return { led: 'Amber' }
  if (has('uv') || has('ultraviolet')) return { led: 'Ultraviolet' }
  if (has('lime')) return { led: 'Lime' }
  return null
}

function isColourAttribute(attribute: string): boolean {
  return /^(red|green|blue|white|amber|uv|lime|cyan|magenta|yellow|colorwheel) ?\d*$/.test(attribute)
}

/** The preset category a captured value set belongs to: colour wins over
 * intensity, then position — the same precedence the auto-name uses. */
export function derivePresetCategory(fixtureValues: Record<string, Record<string, number>>): PresetCategory {
  const attributes = Object.values(fixtureValues).flatMap((patch) => Object.keys(patch))
  if (attributes.some(isColourAttribute)) return 'color'
  if (attributes.includes('intensity') || attributes.includes('dimmer')) return 'intensity'
  if (attributes.includes('pan') || attributes.includes('tilt')) return 'position'
  return 'other'
}

/**
 * LightKey's auto-name for a captured value set, from the first fixture
 * (in selection order) that holds values — fixtures in one capture
 * normally share the look. Colour first ("Orange"), otherwise the dimmer
 * percentage ("28%", "Off" at 0, "Full On" at 100); a position-only
 * capture falls back to "Position", and an empty capture to null.
 */
export function autoPresetName(fixtureValues: Record<string, Record<string, number>>, fixtureOrder: string[]): string | null {
  for (const fixtureId of fixtureOrder) {
    const values = fixtureValues[fixtureId]
    if (!values || !Object.keys(values).length) continue
    const colour = firstColour(values)
    if (colour) return 'led' in colour ? colour.led : colorNameForRgb(colour.r, colour.g, colour.b)
    if (Number.isFinite(values.intensity ?? values.dimmer)) {
      const percent = Math.round(((values.intensity ?? values.dimmer) / 255) * 100)
      if (percent <= 0) return 'Off'
      if (percent >= 100) return 'Full On'
      return `${percent}%`
    }
    if (Number.isFinite(values.pan) || Number.isFinite(values.tilt)) return 'Position'
    return 'Preset'
  }
  return null
}

/** Make a name unique among the existing presets: "28%", "28% 2", … */
export function uniquePresetName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}
