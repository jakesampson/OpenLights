export interface RgbColor { red: number; green: number; blue: number }

/** Parse a `#rrggbb` hex colour, or null when it is not one. */
export function hexToRgb(hex: string): RgbColor | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!match) return null
  return { red: parseInt(match[1], 16), green: parseInt(match[2], 16), blue: parseInt(match[3], 16) }
}

/** Normalise a colour favourite to lowercase `#rrggbb`, or null when it is not a colour. */
export function normalizeColorFavorite(hex: string): string | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const part = (value: number) => value.toString(16).padStart(2, '0')
  return `#${part(rgb.red)}${part(rgb.green)}${part(rgb.blue)}`
}

export function mixColor(rgb: RgbColor, emitters: string[]): Record<string, number> {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  let red = clamp(rgb.red), green = clamp(rgb.green), blue = clamp(rgb.blue)
  if (['cyan', 'magenta', 'yellow'].every((a) => emitters.includes(a))) return { cyan: 255 - red, magenta: 255 - green, yellow: 255 - blue }
  const output: Record<string, number> = {}
  if (emitters.includes('white')) { const white = Math.min(red, green, blue); output.white = white; red -= white; green -= white; blue -= white }
  if (emitters.includes('amber')) { const amber = Math.min(red, green / 0.45); output.amber = clamp(amber); red -= amber; green -= amber * 0.45 }
  if (emitters.includes('uv')) output.uv = 0
  for (const [attribute, value] of Object.entries({ red, green, blue })) if (emitters.includes(attribute)) output[attribute] = clamp(value)
  return output
}
/** RGB (0–255 per channel) to lowercase `#rrggbb`. */
export function rgbToHex(rgb: RgbColor): string {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
  return `#${part(rgb.red)}${part(rgb.green)}${part(rgb.blue)}`
}

/**
 * The colour a fixture's stored values show as, as a hex string — the same
 * mixing DesignTab's colour display uses (white and amber folded into RGB;
 * CMY fixtures read as 255 minus each component). Null when the values
 * carry no colour channels at all.
 */
export function fixtureValuesToHex(values: Record<string, number>): string | null {
  if (['red', 'green', 'blue'].every((a) => values[a] !== undefined)) {
    const red = Math.min(255, (values.red ?? 0) + (values.white ?? 0) + (values.amber ?? 0))
    const green = Math.min(255, (values.green ?? 0) + (values.white ?? 0) + (values.amber ?? 0) * 0.45)
    const blue = Math.min(255, (values.blue ?? 0) + (values.white ?? 0))
    return rgbToHex({ red, green, blue })
  }
  if (['cyan', 'magenta', 'yellow'].every((a) => values[a] !== undefined)) {
    return rgbToHex({ red: 255 - (values.cyan ?? 0), green: 255 - (values.magenta ?? 0), blue: 255 - (values.yellow ?? 0) })
  }
  return null
}
