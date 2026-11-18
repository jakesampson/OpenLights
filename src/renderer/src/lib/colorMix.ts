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
