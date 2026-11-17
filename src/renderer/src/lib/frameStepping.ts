import type { LivePage } from '@shared/types'
import { frameMembers } from './liveFrames'

export function stepFrame(page: LivePage, frameId: string, active: Record<string, number>, direction: -1 | 1): Record<string, number> {
  const members = frameMembers(page, frameId).filter((id) => !page.controls.find((cue) => cue.id === id)?.frameStep)
  if (!members.length) return active
  const current = members.findIndex((id) => (active[id] ?? 0) > 0)
  const next = current < 0 ? (direction > 0 ? 0 : members.length - 1) : (current + direction + members.length) % members.length
  const result = { ...active }
  for (const id of members) delete result[id]
  result[members[next]] = 255
  return result
}
