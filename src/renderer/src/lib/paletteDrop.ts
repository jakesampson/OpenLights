import { canParentGroup } from './fixtureGroups'
import type { PresetGroup } from '@shared/types'

// Palette drag-and-drop, pure so the store and the tests share the same
// rules (18 Nov 2026 fix batch — Jake could not drag a preset into a
// folder). The palette tree calls this through the store's applyPaletteDrop
// action; it never touches the store itself.
//
// A preset/sequence belongs to at most one group, so dropping it into a
// folder removes it from every other group first. Dropping onto the tree
// root (targetGroupId null) moves it out of its folder. Dropping a group
// onto another group nests it (parentId), guarded by canParentGroup so a
// group can never be dropped into itself or one of its descendants —
// LightKey allows nested groups (Outer Arc > Colours), and the model
// supports them via parentId.
//
// Dropping an item onto another item of the same kind in the same group
// reorders it before that item; dropping it onto an item in a different
// group just moves it into that item's group (appended at the end).
//
// Returns the new groups array, or null when the drop changes nothing
// (same group, already at the root, self-drop, cycle) so the caller can
// skip the store write entirely.
export type PaletteDragItem = { kind: 'preset' | 'sequence' | 'group'; id: string }

export function resolvePaletteDrop(
  drag: PaletteDragItem,
  targetGroupId: string | null,
  groups: PresetGroup[],
  before?: { kind: 'preset' | 'sequence'; id: string } | null
): PresetGroup[] | null {
  const idsOf = (listGroup: PresetGroup, key: 'presetIds' | 'sequenceIds'): string[] => key === 'presetIds' ? listGroup.presetIds : listGroup.sequenceIds ?? []
  const removeFrom = (list: PresetGroup[], id: string, key: 'presetIds' | 'sequenceIds'): PresetGroup[] =>
    list.map((listGroup) => (idsOf(listGroup, key).includes(id) ? { ...listGroup, [key]: idsOf(listGroup, key).filter((item) => item !== id) } : listGroup))

  if (drag.kind === 'group') {
    const group = groups.find((item) => item.id === drag.id)
    if (!group || group.parentId === targetGroupId) return null
    if (targetGroupId !== null && !groups.some((item) => item.id === targetGroupId)) return null
    if (!canParentGroup(groups, drag.id, targetGroupId)) return null
    return groups.map((item) => (item.id === drag.id ? { ...item, parentId: targetGroupId } : item))
  }

  const key = drag.kind === 'preset' ? 'presetIds' : 'sequenceIds'
  const target = targetGroupId === null ? null : groups.find((item) => item.id === targetGroupId)
  if (targetGroupId !== null && !target) return null
  const currentGroup = groups.find((listGroup) => idsOf(listGroup, key).includes(drag.id))
  const reorderTarget = before && before.kind === drag.kind && before.id !== drag.id
    ? groups.find((listGroup) => idsOf(listGroup, key).includes(before.id))
    : undefined
  // Same group, no reorder target: nothing changes.
  if (currentGroup && currentGroup.id === targetGroupId && !reorderTarget) return null
  // Already at the root with no reorder target: nothing changes.
  if (!currentGroup && targetGroupId === null) return null
  const removed = removeFrom(groups, drag.id, key)
  if (targetGroupId === null) return removed
  return removed.map((listGroup) => {
    if (listGroup.id !== targetGroupId) return listGroup
    const ids = idsOf(listGroup, key)
    if (reorderTarget && reorderTarget.id === targetGroupId) {
      const at = ids.indexOf(before!.id)
      if (at === -1) return { ...listGroup, [key]: [...ids, drag.id] }
      return { ...listGroup, [key]: [...ids.slice(0, at), drag.id, ...ids.slice(at)] }
    }
    return { ...listGroup, [key]: [...ids, drag.id] }
  })
}
