import type { SceneDef } from '@shared/types'

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export function getPresetColor(scene: SceneDef): string {
  let red = 0
  let green = 0
  let blue = 0
  let count = 0

  for (const values of Object.values(scene.fixtureValues)) {
    const intensity = clampByte(values.intensity ?? 0) / 255
    if (intensity === 0) continue

    red += clampByte(values.red ?? 0) * intensity
    green += clampByte(values.green ?? 0) * intensity
    blue += clampByte(values.blue ?? 0) * intensity
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
