import type { FixtureChannel } from '@shared/types'
import { wheelSlotValue } from './wheelProperties'
export const STANDARD_PROPERTIES = ['onOff', 'shutter', 'strobe', 'movementSpeed', 'prism', 'focus', 'zoom', 'iris', 'frost', 'fog', 'lamp', 'command'] as const
export function propertyValue(channel: FixtureChannel, input: number | boolean | string): number {
  if (typeof input === 'string') return wheelSlotValue(channel, input)
  const value = typeof input === 'boolean' ? input ? channel.max : channel.min : input
  return Math.round(Math.max(channel.min, Math.min(channel.max, Number.isFinite(value) ? value : channel.defaultValue)))
}
