import type { CueDef } from '@shared/types'

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export function getPresetColor(cue: CueDef): string {
  let red = 0
  let green = 0
  let blue = 0
  let count = 0

  for (const values of Object.values(cue.fixtureValues)) {
    const intensity = clampByte(values.intensity ?? 255) / 255
    if (intensity === 0) continue

    const white = clampByte(values.white ?? 0)
    const amber = clampByte(values.amber ?? 0)
    red += clampByte((values.red ?? 0) + white + amber) * intensity
    green += clampByte((values.green ?? 0) + white + amber * 0.45) * intensity
    blue += clampByte((values.blue ?? 0) + white) * intensity
    count++
  }

  if (!count) return '#777777'

  red /= count
  green /= count
  blue /= count
  const peak = Math.max(red, green, blue)
  if (peak === 0) return '#777777'

  const scale = 220 / peak
  const hex = (value: number) => clampByte(value * scale).toString(16).padStart(2, '0')
  return `#${hex(red)}${hex(green)}${hex(blue)}`
}
