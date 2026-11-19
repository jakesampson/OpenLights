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

/**
 * Group a fixture's colour attributes by pod (cell): the first pod's
 * colours are bare ("red") and later pods carry their pod number
 * ("red 2" in OFL profiles, "red2" in built-ins) — the same grouping
 * deriveBeams makes in oflFixtureFormat.ts. Returns pod number ->
 * base colour name -> the fixture's attribute string for it.
 */
function colourPods(emitters: string[]): Map<number, Map<string, string>> {
  const pods = new Map<number, Map<string, string>>()
  for (const emitter of emitters) {
    const match = /^(red|green|blue|white|amber|uv|cyan|magenta|yellow|lime) ?(\d+)?$/i.exec(emitter)
    if (!match) continue
    const pod = match[2] ? Number(match[2]) : 1
    const entry = pods.get(pod) ?? new Map<string, string>()
    entry.set(match[1].toLowerCase(), emitter)
    pods.set(pod, entry)
  }
  return pods
}

/** Pods in numeric order — channel order already lists pod 1 first, but the sort keeps the fan-out deterministic. */
function sortedPods(emitters: string[]): [number, Map<string, string>][] {
  return [...colourPods(emitters)].sort((a, b) => a[0] - b[0])
}

export function mixColor(rgb: RgbColor, emitters: string[]): Record<string, number> {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const output: Record<string, number> = {}
  // A whole colour is applied to every pod of a multipart fixture, not
  // just the first: the wheel (and a colour favourite, and copying a
  // colour onto the fixture) drives all the fixture's LEDs together
  // (Jake, 19 Nov 2026). Each pod mixes the same RGB the same way —
  // its own White / Amber / UV included — so a per-pod white is the
  // same white on every cell.
  for (const [, attrs] of sortedPods(emitters)) {
    if (['cyan', 'magenta', 'yellow'].every((a) => attrs.has(a))) {
      output[attrs.get('cyan')!] = 255 - clamp(rgb.red)
      output[attrs.get('magenta')!] = 255 - clamp(rgb.green)
      output[attrs.get('yellow')!] = 255 - clamp(rgb.blue)
      continue
    }
    let red = clamp(rgb.red), green = clamp(rgb.green), blue = clamp(rgb.blue)
    if (attrs.has('white')) { const white = Math.min(red, green, blue); output[attrs.get('white')!] = white; red -= white; green -= white; blue -= white }
    if (attrs.has('amber')) { const amber = Math.min(red, green / 0.45); output[attrs.get('amber')!] = clamp(amber); red -= amber; green -= amber * 0.45 }
    if (attrs.has('uv')) output[attrs.get('uv')!] = 0
    for (const [attribute, value] of Object.entries({ red, green, blue })) { const channel = attrs.get(attribute); if (channel) output[channel] = clamp(value) }
  }
  return output
}

/**
 * The base colour channels for a fixture colour — the channels the round
 * Color control owns. White / Amber / UV are separate LEDs (Guide p.85)
 * with their own sliders beside the wheel, so a wheel drag must not
 * write them: deriving them from the RGB, as mixColor does, makes the
 * wheel's own arcs move each other — saturation down stole brightness
 * into White (the residual RGB went monochromatic, so the saturation
 * arc snapped back to 100 and the brightness arc fell), and hue to
 * yellow drove Amber to full (Jake, 19 Nov 2026). CMY fixtures take
 * the complement; RGB fixtures take the RGB channels they have and
 * nothing else, so the other sliders stay where they were.
 */
export function baseColorChannels(rgb: RgbColor, emitters: string[]): Record<string, number> {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const output: Record<string, number> = {}
  // The wheel drives every pod of a multipart fixture, not just the
  // first (Jake, 19 Nov 2026): the same RGB lands on each cell's
  // channels — "red 2" / "red2" spellings alike — so all four LEDs of
  // a bar follow the one wheel. White / Amber / UV are still never
  // written here (see above); per-pod, the CMY complement applies
  // when a pod has all three.
  for (const [, attrs] of sortedPods(emitters)) {
    if (['cyan', 'magenta', 'yellow'].every((a) => attrs.has(a))) {
      output[attrs.get('cyan')!] = clamp(255 - rgb.red)
      output[attrs.get('magenta')!] = clamp(255 - rgb.green)
      output[attrs.get('yellow')!] = clamp(255 - rgb.blue)
    } else {
      for (const [attribute, value] of Object.entries(rgb)) { const channel = attrs.get(attribute); if (channel) output[channel] = clamp(value) }
    }
  }
  return output
}

/**
 * The colour channel names a fixture's base colour is stored in: CMY
 * when the fixture has all three, otherwise the RGB channels it has.
 * The same choice baseColorChannels makes when writing a colour.
 */
export function colorChannels(emitters: string[]): string[] {
  // Per pod, in pod order: the CMY set when a pod has all three,
  // otherwise the RGB channels it has. A multipart fixture's list
  // therefore covers every cell, so Set/Load/Reset Default follow the
  // wheel and cover all beams instead of only the first.
  const result: string[] = []
  for (const [, attrs] of sortedPods(emitters)) {
    if (['cyan', 'magenta', 'yellow'].every((a) => attrs.has(a))) result.push(attrs.get('cyan')!, attrs.get('magenta')!, attrs.get('yellow')!)
    else for (const a of ['red', 'green', 'blue']) { const channel = attrs.get(a); if (channel) result.push(channel) }
  }
  return result
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
