import type { PresetDef, PresetGroup } from '@shared/types'
export function syncPresetGroups(groups: PresetGroup[], presets: PresetDef[]): PresetGroup[] {
  const valid = new Set(presets.map((p) => p.id)), result = groups.map((g) => ({ ...g, presetIds: g.presetIds.filter((id) => valid.has(id)) }))
  for (const preset of presets) {
    if (result.some((g) => g.presetIds.includes(preset.id))) continue
    let group = result.find((g) => g.id === `presets:${preset.category}`)
    if (!group) { group = { id: `presets:${preset.category}`, name: preset.category, exclusive: false, parentId: null, presetIds: [] }; result.push(group) }
    group.presetIds.push(preset.id)
  }
  return result
}
export function presetGroupMembers(groups: PresetGroup[], id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return []
  seen.add(id)
  return [...new Set([...(groups.find((g) => g.id === id)?.presetIds ?? []), ...groups.filter((g) => g.parentId === id).flatMap((g) => presetGroupMembers(groups, g.id, seen))])]
}
export function activateGroupedPreset(active: string[], id: string, groups: PresetGroup[]): string[] {
  if (active.includes(id)) return active.filter((item) => item !== id)
  const release = new Set(groups.filter((g) => g.exclusive && presetGroupMembers(groups, g.id).includes(id)).flatMap((g) => presetGroupMembers(groups, g.id)))
  return [...active.filter((item) => !release.has(item)), id]
}
