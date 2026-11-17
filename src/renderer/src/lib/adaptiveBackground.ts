import type { FixtureDef, SceneDef } from '@shared/types'
import { previewFixtureValues } from './previewOutput'

/** A brightness-weighted hue from the current DMX values; neutral output has no hue. */
export function adaptiveBackgroundHue(fixtures: FixtureDef[], channels: number[], scene?: SceneDef): number | null {
  let red = 0, green = 0, blue = 0
  for (const fixture of fixtures) {
    const v = previewFixtureValues(fixture, channels, scene?.fixtureValues[fixture.id])
    const dimmer = Math.max(0, Math.min(255, v.intensity ?? 255)) / 255
    const average = (base: string) => {
      const names = [base, `${base}2`, `${base}3`, `${base}4`].filter((name) => typeof v[name] === 'number')
      return names.length ? names.reduce((sum, name) => sum + v[name], 0) / names.length : 0
    }
    const white = v.white ?? (fixture.type === 'dimmer' && v.red === undefined ? 255 : 0)
    const amber = v.amber ?? 0
    red += Math.min(255, average('red') + white + amber) * dimmer
    green += Math.min(255, average('green') + white + amber * 0.45) * dimmer
    blue += Math.min(255, average('blue') + white) * dimmer
  }
  const high = Math.max(red, green, blue), low = Math.min(red, green, blue)
  const delta = high - low
  if (high < 8 || delta / high < 0.12) return null
  let hue = high === red ? (green - blue) / delta : high === green ? 2 + (blue - red) / delta : 4 + (red - green) / delta
  hue = ((hue * 60) + 360) % 360
  return Math.round(hue)
}
