import type { FixtureChannel } from '@shared/types'
export function wheelSlotValue(channel: FixtureChannel, slotId: string, position = 0.5): number {
  const slot = channel.slots?.find((s) => s.id === slotId)
  if (!slot) throw new Error('Select a valid wheel slot or movement mode')
  return Math.round(Math.max(channel.min, Math.min(channel.max, slot.from + (slot.to - slot.from) * Math.max(0, Math.min(1, position)))))
}
