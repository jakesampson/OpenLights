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
export function canParentGroup(groups: { id: string; parentId?: string | null }[], id: string, parentId: string | null): boolean {
  const seen = new Set<string>([id]); let current = parentId
  while (current) { if (seen.has(current)) return false; seen.add(current); const group = groups.find((g) => g.id === current); if (!group) return false; current = group.parentId ?? null }
  return true
}

/** Next free "Group N" name for the Group command (Layout > Group,
 *  Control-click → Group, Guide p.35). LightKey's auto-name for a group
 *  created from a selection is not documented in the guide; "Group N" is
 *  the name, editable afterwards in the Fixture Groups panel. */
export function nextGroupName(existingNames: string[]): string {
  const taken = new Set(existingNames.map((name) => name.trim()))
  let n = 1
  while (taken.has(`Group ${n}`)) n += 1
  return `Group ${n}`
}

/** Move fixtures into the named group, repairing the group records so they
 *  agree with the fixtures' `group` fields (Piece 5). The Group command
 *  writes the field; without this the migration's 'Ungrouped' record keeps
 *  claiming the fixtures and the new group never appears in the Fixture
 *  Groups panel. Records emptied by the move (and with no child groups)
 *  are dropped. */
export function moveFixturesToGroup(groups: FixtureGroup[], fixtureIds: string[], name: string): FixtureGroup[] {
  const ids = new Set(fixtureIds)
  const result = groups.map((g) => ({ ...g, fixtureIds: g.fixtureIds.filter((id) => !ids.has(id)) }))
  let group = result.find((g) => g.name === name)
  if (!group) { group = { id: `group:${encodeURIComponent(name)}`, name, parentId: null, fixtureIds: [] }; result.push(group) }
  for (const id of fixtureIds) if (!group.fixtureIds.includes(id)) group.fixtureIds.push(id)
  return result.filter((g) => g.fixtureIds.length > 0 || result.some((c) => c.parentId === g.id))
}
