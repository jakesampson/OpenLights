import type { CueDef, CueListDef, CueListGroupDef, CueStepDef } from '@shared/types'

/** The next auto-numbered cue name for a cuelist (Guide ch.11, p.189:
 *  "When you add a new cue or duplicate a cue, Lightkey automatically
 *  increments the new cue's number" — "001 New Cue", "002 New Cue",
 *  …). The number is the highest leading number among the list's step
 *  cues plus one, zero-padded to three digits; a fresh list starts at
 *  001. */
export function nextListCueName(list: CueListDef, cues: { id: string; name: string }[]): string {
  let max = 0
  for (const step of list.steps) {
    const cue = cues.find((item) => item.id === step.cueId)
    const match = cue ? /^(\d+)\b/.exec(cue.name) : null
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${String(max + 1).padStart(3, '0')} New Cue`
}

/** Split a cue name into its leading number (if any) and the rest of
 *  the name: "001 New Cue" → [1, "New Cue"]; "My cue" → [null, "My cue"]. */
export function splitCueNumber(name: string): [number | null, string] {
  const match = /^(\d+)\s+(.*)$/.exec(name.trim())
  if (!match) return [null, name]
  return [Number(match[1]), match[2]]
}

/** Renumber cues (Guide ch.11, p.195): rename the first cue to set
 *  where the numbers begin, select the cues to renumber, then Renumber
 *  adds increasing numbers before the names (or updates existing
 *  ones). Pure: returns the new cue names keyed by cue id for the
 *  given steps, in list order, starting from the first step's leading
 *  number (or 1 when it has none). */
export function renumberCueNames(
  steps: CueStepDef[],
  cues: { id: string; name: string }[]
): { cueId: string; name: string }[] {
  if (!steps.length) return []
  const firstCue = cues.find((item) => item.id === steps[0].cueId)
  const [start] = firstCue ? splitCueNumber(firstCue.name) : [null]
  let next = start ?? 1
  return steps.map((step) => {
    const cue = cues.find((item) => item.id === step.cueId)
    if (!cue) return { cueId: step.cueId, name: '' }
    const [, rest] = splitCueNumber(cue.name)
    const name = `${String(next).padStart(3, '0')} ${rest || 'New Cue'}`
    next += 1
    return { cueId: cue.id, name }
  })
}

/** Insert a new empty group below the given step (or at the end when
 *  no step is given), returning the new group and the updated groups
 *  array. The group's place in the widget is recorded by `afterStepId`
 *  (the step it was inserted below; null = the top of the list,
 *  undefined = the end) — an empty group has no member steps to anchor
 *  it, so the anchor is what puts its header in the right place. */
export function addCueListGroup(
  list: CueListDef,
  name: string,
  makeId: () => string,
  afterStepId?: string | null
): { groups: CueListGroupDef[]; group: CueListGroupDef } {
  const group: CueListGroupDef = { id: makeId(), name: name.trim() || 'New Group', afterStepId: afterStepId ?? undefined }
  return { groups: [...(list.groups ?? []), group], group }
}

export type CuelistDisplayItem =
  | { kind: 'group'; group: CueListGroupDef; depth: number }
  | { kind: 'step'; step: CueStepDef; depth: number }

/** The widget's display order: steps in list order, with each group's
 *  header emitted before its first member step (or at its `afterStepId`
 *  anchor when the group is empty). A group's depth is its nesting
 *  depth (parent groups first at the same anchor). Playback order is
 *  unaffected — groups are only an overview. */
export function orderedCuelistItems(list: CueListDef): CuelistDisplayItem[] {
  const groups = list.groups ?? []
  const depthOf = (group: CueListGroupDef): number => {
    let depth = 0
    let parentId = group.parentId
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = groups.find((g) => g.id === parentId)
      if (!parent) break
      depth += 1
      parentId = parent.parentId
    }
    return depth
  }
  const anchorOf = (group: CueListGroupDef): { at: number; kind: 0 | 1 } => {
    const firstMember = list.steps.findIndex((step) => step.groupId === group.id)
    if (firstMember >= 0) return { at: firstMember, kind: 1 }
    // A parent group with no member steps of its own anchors to its
    // first child — its header sits above the child's.
    const children = groups.filter((g) => g.parentId === group.id)
    if (children.length) {
      const childAnchors = children.map((child) => anchorOf(child))
      const first = childAnchors.reduce((min, item) => item.at < min.at ? item : min, childAnchors[0])
      return { at: first.at, kind: 1 }
    }
    if (group.afterStepId === null) return { at: 0, kind: 0 }
    if (group.afterStepId) {
      const at = list.steps.findIndex((step) => step.id === group.afterStepId)
      return { at: at >= 0 ? at + 1 : list.steps.length, kind: 0 }
    }
    return { at: list.steps.length, kind: 0 }
  }
  const headersAt = new Map<number, { group: CueListGroupDef; kind: 0 | 1 }[]>()
  for (const group of groups) {
    const anchor = anchorOf(group)
    const at = headersAt.get(anchor.at) ?? []
    at.push({ group, kind: anchor.kind })
    headersAt.set(anchor.at, at)
  }
  // At one anchor, parents come before children (depth), and an empty
  // group inserted below a step comes before the group that owns the
  // next step (an afterStepId anchor is "above" a member anchor).
  for (const at of headersAt.values()) at.sort((a, b) => depthOf(a.group) - depthOf(b.group) || a.kind - b.kind)
  const items: CuelistDisplayItem[] = []
  const stepDepth = (step: CueStepDef): number => {
    const group = groups.find((g) => g.id === step.groupId)
    return group ? depthOf(group) + 1 : 0
  }
  for (let i = 0; i <= list.steps.length; i += 1) {
    for (const { group } of headersAt.get(i) ?? []) items.push({ kind: 'group', group, depth: depthOf(group) })
    if (i < list.steps.length) items.push({ kind: 'step', step: list.steps[i], depth: stepDepth(list.steps[i]) })
  }
  return items
}

export type CueListCommand =
  | { type: 'add'; step: CueStepDef; index?: number }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; direction: -1 | 1 }
  | { type: 'rename-step'; id: string; cueId: string }
  | { type: 'paste'; steps: CueStepDef[]; index?: number; makeId: () => string }

export function editCueList(list: CueListDef, command: CueListCommand): CueListDef {
  if (command.type === 'add') { const steps = [...list.steps]; steps.splice(command.index ?? steps.length, 0, structuredClone(command.step)); return { ...list, steps } }
  if (command.type === 'remove') return { ...list, steps: list.steps.filter((step) => step.id !== command.id) }
  if (command.type === 'rename-step') return { ...list, steps: list.steps.map((step) => step.id === command.id ? { ...step, cueId: command.cueId } : step) }
  if (command.type === 'paste') { const steps = [...list.steps]; steps.splice(command.index ?? steps.length, 0, ...command.steps.map((step) => ({ ...structuredClone(step), id: command.makeId() }))); return { ...list, steps } }
  const index = list.steps.findIndex((step) => step.id === command.id), target = index + command.direction
  if (index < 0 || target < 0 || target >= list.steps.length) return list
  const steps = [...list.steps]; [steps[index], steps[target]] = [steps[target], steps[index]]
  return { ...list, steps }
}

export function filterCueSteps(list: CueListDef, cues: { id: string; name: string }[], query: string): CueStepDef[] {
  const needle = query.trim().toLowerCase()
  return needle ? list.steps.filter((step) => cues.find((cue) => cue.id === step.cueId)?.name.toLowerCase().includes(needle)) : list.steps
}

export function cueListStatus(list: CueListDef, index: number, elapsedMs: number) {
  const current = list.steps[index]
  const next = list.steps[index + 1] ?? (list.loop ? list.steps[0] : undefined)
  const total = current ? current.fadeMs + current.holdMs : 0
  return { current, next, remainingMs: Math.max(0, total - Math.max(0, elapsedMs)) }
}
