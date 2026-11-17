import type { FixtureChannel, FixtureDef } from '@shared/types'
import { fixtureMode } from '@shared/fixtureProfiles'
export function availableProperties(fixtures: FixtureDef[]): FixtureChannel[] {
  if (!fixtures.length) return []
  const channels = fixtures.map((fixture) => (fixtureMode(fixture)?.channels ?? []).filter((c) => c.number < fixture.channels))
  const result = channels[0].filter((c) => !fixtures.some((f) => f.hiddenProperties?.includes(c.attribute)) && channels.every((list) => list.some((other) => other.attribute === c.attribute && other.propertyType === c.propertyType))).map((c) => {
    const matches = channels.map((list) => list.find((other) => other.attribute === c.attribute)!)
    return { ...c, min: Math.max(...matches.map((other) => other.min)), max: Math.min(...matches.map((other) => other.max)) }
  }).filter((c) => c.min <= c.max)
  const order = fixtures[0].propertyOrder ?? []
  return result.sort((a, b) => { const ai = order.indexOf(a.attribute), bi = order.indexOf(b.attribute); return (ai < 0 ? 1000 + a.number : ai) - (bi < 0 ? 1000 + b.number : bi) })
}
