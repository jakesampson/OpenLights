import type { CueListDef, CueStepDef } from '@shared/types'

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
