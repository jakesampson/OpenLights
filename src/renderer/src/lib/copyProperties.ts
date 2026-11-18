import type { FixtureDef } from '@shared/types'
import { fixtureMode } from '@shared/fixtureProfiles'
import { mixColor } from './colorMix'
export function mapCopiedProperties(source: FixtureDef, values: Record<string, number>, target: FixtureDef): Record<string, number> {
  const sourceChannels = fixtureMode(source)?.channels ?? [], targetChannels = fixtureMode(target)?.channels ?? []
  const result: Record<string, number> = {}
  for (const channel of targetChannels) if (sourceChannels.some((c) => c.attribute === channel.attribute && c.propertyType === channel.propertyType) && values[channel.attribute] !== undefined) result[channel.attribute] = Math.round(Math.max(channel.min, Math.min(channel.max, values[channel.attribute])))
  if (['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber'].some((key) => key in values)) {
    const rgb = 'cyan' in values ? { red: 255 - values.cyan, green: 255 - (values.magenta ?? 0), blue: 255 - (values.yellow ?? 0) } : { red: Math.min(255, (values.red ?? 0) + (values.white ?? 0) + (values.amber ?? 0)), green: Math.min(255, (values.green ?? 0) + (values.white ?? 0) + (values.amber ?? 0) * 0.45), blue: Math.min(255, (values.blue ?? 0) + (values.white ?? 0)) }
    Object.assign(result, mixColor(rgb, targetChannels.map((c) => c.attribute)))
  }
  return result
}
