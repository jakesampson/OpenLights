import type { FixtureDef } from '@shared/types'
import { fixtureChannelMap } from '@shared/fixtureProfiles'
export function channelFixtureLabels(fixtures: FixtureDef[]): Record<number, string[]> {
  const labels: Record<number, string[]> = {}
  for (const fixture of fixtures) {
    const attributes = Object.fromEntries(Object.entries(fixtureChannelMap(fixture)).map(([name, offset]) => [offset, name]))
    for (let offset = 0; offset < fixture.channels; offset++) {
      const channel = fixture.channelStart + offset
      if (channel < 1 || channel > 512) continue
      labels[channel] = [...(labels[channel] ?? []), `${fixture.name}${attributes[offset] ? ` · ${attributes[offset]}` : ''}`]
    }
  }
  return labels
}
