export interface RgbColor { red: number; green: number; blue: number }
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
