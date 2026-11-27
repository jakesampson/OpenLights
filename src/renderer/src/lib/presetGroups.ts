import type { PresetDef, PresetGroup } from '@shared/types'

// LightKey-style palette (18 Nov 2026, Jake's screenshots): there are NO
// standard / seeded folders. The user creates whatever groups they want, so
// syncing must never invent a group. Earlier versions auto-created one group
// per preset category (`presets:<category>`, name = "color"/"position"/...)
// and migration did the same for old shows; that is the standard-folder
// structure Jake asked to remove. syncPresetGroups now only prunes: it drops
// preset/sequence ids that no longer exist and strips any seeded
// `presets:*` group (those ids are only ever auto-created —
// createPresetGroup uses crypto.randomUUID() — so stripping them cannot
// delete a user-made group). Presets in no group are ungrouped, not lost:
// the palette renders them at the tree root.
export function syncPresetGroups(groups: PresetGroup[], presets: PresetDef[]): PresetGroup[] {
  const valid = new Set(presets.map((p) => p.id))
  return groups
    .filter((g) => !g.id.startsWith('presets:'))
    .map((g) => ({ ...g, presetIds: g.presetIds.filter((id) => valid.has(id)) }))
}
export function presetGroupMembers(groups: PresetGroup[], id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return []
  seen.add(id)
  return [...new Set([...(groups.find((g) => g.id === id)?.presetIds ?? []), ...groups.filter((g) => g.parentId === id).flatMap((g) => presetGroupMembers(groups, g.id, seen))])]
}
// The Get Info contents sub-heading (Jake, 28 Nov 2026 — LightKey's
// Demo Project "Deep Blue" screenshot): a preset's rows sit under its
// ROOT palette folder, not its immediate parent and not the fixture
// group — a preset in Inner Arc → Colors shows "Inner Arc". Walks
// parentId to the top; a preset in no group has no heading (undefined),
// and a parent cycle or a dangling parentId stops at the last group
// actually found instead of looping.
export function presetRootFolder(groups: PresetGroup[], presetId: string): PresetGroup | undefined {
  let current = groups.find((g) => g.presetIds.includes(presetId))
  if (!current) return undefined
  const seen = new Set<string>([current.id])
  while (current.parentId) {
    const parent = groups.find((g) => g.id === current!.parentId)
    if (!parent || seen.has(parent.id)) break
    seen.add(parent.id)
    current = parent
  }
  return current
}
export function activateGroupedPreset(active: string[], id: string, groups: PresetGroup[]): string[] {
  if (active.includes(id)) return active.filter((item) => item !== id)
  const release = new Set(groups.filter((g) => g.exclusive && presetGroupMembers(groups, g.id).includes(id)).flatMap((g) => presetGroupMembers(groups, g.id)))
  return [...active.filter((item) => !release.has(item)), id]
}
