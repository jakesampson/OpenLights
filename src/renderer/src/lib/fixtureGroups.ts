import type { FixtureGroup } from '@shared/types'
import type { FixtureDef } from '@shared/types'
export function syncFixtureGroups(groups: FixtureGroup[], fixtures: FixtureDef[]): FixtureGroup[] {
  const valid = new Set(fixtures.map((f) => f.id))
  const result = groups.map((g) => ({ ...g, fixtureIds: g.fixtureIds.filter((id) => valid.has(id)) }))
  for (const fixture of fixtures) {
    if (result.some((g) => g.fixtureIds.includes(fixture.id))) continue
    const name = fixture.group?.trim() || 'Ungrouped'
    let group = result.find((g) => g.name === name)
    if (!group) { group = { id: `group:${encodeURIComponent(name)}`, name, parentId: null, fixtureIds: [] }; result.push(group) }
    group.fixtureIds.push(fixture.id)
  }
  return result
}
export function fixtureGroupMembers(groups: FixtureGroup[], id: string, visited = new Set<string>()): string[] {
  if (visited.has(id)) return []
  visited.add(id)
  const group = groups.find((g) => g.id === id)
  return [...new Set([...(group?.fixtureIds ?? []), ...groups.filter((g) => g.parentId === id).flatMap((g) => fixtureGroupMembers(groups, g.id, visited))])]
}
export function canParentGroup(groups: FixtureGroup[], id: string, parentId: string | null): boolean {
  const seen = new Set<string>([id]); let current = parentId
  while (current) { if (seen.has(current)) return false; seen.add(current); const group = groups.find((g) => g.id === current); if (!group) return false; current = group.parentId ?? null }
  return true
}
