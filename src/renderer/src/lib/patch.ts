import type { FixtureDef, FixtureProfile } from '@shared/types'
import { modeFootprint } from '@shared/fixtureProfiles'
import { incrementShortName, normalizeShortName, proposeShortName, shortNameAt } from '@shared/shortNames'
export interface PatchOptions { modeId?: string; quantity: number; start: number; name?: string; group?: string; universe?: number; shortName?: string; count?: number; ledCount?: number; notes?: string; extReference?: string }

/** DMX DIP switch values, switches 1–9 (LightKey's DIP switch guide on
 * the Patching tab): the address is the sum of the values of the switches
 * set to ON — switch 1 is 1, switch 2 is 2, switch 3 is 4, and so on.
 * Address 1 is switch 1 ON; address 512 is outside the 9-switch range. */
export const DIP_SWITCH_VALUES = [1, 2, 4, 8, 16, 32, 64, 128, 256]

/** Which of the nine DIP switches are ON for a DMX address, in switch
 * order (index 0 = switch 1). Addresses above 511 return all OFF — the
 * caller shows the out-of-range note instead. */
export function dipSwitchesForAddress(address: number): boolean[] {
  if (!Number.isInteger(address) || address < 1 || address > 511) return DIP_SWITCH_VALUES.map(() => false)
  return DIP_SWITCH_VALUES.map((value) => (address & value) !== 0)
}
export interface PatchConflict { fixtureIds: string[]; type: 'overlap' | 'out-of-range'; channels: number[] }
export function fixtureWidth(profile: FixtureProfile, modeId?: string, ledCount?: number): number {
  const mode = profile.modes.find((item) => item.id === modeId) ?? profile.modes[0]
  return mode ? modeFootprint(mode, ledCount) : 0
}
export function placementError(fixtures: FixtureDef[], start: number, width: number, ignoreFixtureId?: string): string | null {
  if (!Number.isInteger(start) || !Number.isInteger(width) || start < 1 || width < 1 || start + width - 1 > 512) return 'The fixture does not fit within channels 1–512'
  const end = start + width - 1
  const overlap = fixtures.find((fixture) => fixture.id !== ignoreFixtureId && (fixture.universe ?? 1) === 1 && start <= fixture.channelStart + fixture.channels - 1 && end >= fixture.channelStart)
  return overlap ? `Channels ${Math.max(start, overlap.channelStart)}–${Math.min(end, overlap.channelStart + overlap.channels - 1)} are occupied by ${overlap.name}` : null
}
export function findConflicts(fixtures: FixtureDef[]): PatchConflict[] {
  const conflicts: PatchConflict[] = []
  for (const fixture of fixtures) if (!Number.isInteger(fixture.channelStart) || !Number.isInteger(fixture.channels) || fixture.channelStart < 1 || fixture.channels < 1 || fixture.channelStart + fixture.channels - 1 > 512) conflicts.push({ fixtureIds: [fixture.id], type: 'out-of-range', channels: [] })
  for (let a = 0; a < fixtures.length; a++) for (let b = a + 1; b < fixtures.length; b++) {
    const first = fixtures[a], second = fixtures[b]
    if ((first.universe ?? 1) !== (second.universe ?? 1)) continue
    const start = Math.max(first.channelStart, second.channelStart), end = Math.min(first.channelStart + first.channels - 1, second.channelStart + second.channels - 1)
    if (start <= end) conflicts.push({ fixtureIds: [first.id, second.id], type: 'overlap', channels: Array.from({ length: end - start + 1 }, (_, i) => start + i) })
  }
  return conflicts
}
export function allocateFixtures(existing: FixtureDef[], profile: FixtureProfile, options: PatchOptions): FixtureDef[] {
  const mode = profile.modes.find((m) => m.id === options.modeId) ?? profile.modes[0]
  if (!mode || !mode.channels.length) throw new Error('Choose a fixture mode')
  if (options.universe && options.universe !== 1) throw new Error('USB output supports universe 1')
  const quantity = options.quantity, width = fixtureWidth(profile, mode.id, options.ledCount)
  const count = Math.max(1, Math.floor(options.count ?? 1))
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 512 || !Number.isInteger(options.start) || options.start < 1 || options.start > 512) throw new Error('Choose a valid quantity and DMX start address')
  if (options.ledCount !== undefined && mode.flexibleLeds) {
    const { minLeds = 1, maxLeds } = mode.flexibleLeds
    if (!Number.isInteger(options.ledCount) || options.ledCount < minLeds || options.ledCount > maxLeds) throw new Error(`Choose ${minLeds}–${maxLeds} LEDs`)
  }
  const used = new Set(existing.flatMap((f) => Array.from({ length: f.channels }, (_, i) => f.channelStart + i)))
  const fixtures: FixtureDef[] = []
  // Short names (Guide p.30): the first fixture takes the given name (or
  // the type-based proposal when none is given); a batch increments it
  // from there (MH6 → MH6..MH9). A name already in use is skipped so two
  // fixtures never share a short name in one show.
  const usedShortNames = new Set(existing.map((f) => f.shortName).filter((s): s is string => Boolean(s)).map((s) => s.trim().toUpperCase()))
  const firstShort = normalizeShortName(options.shortName) ?? proposeShortName(usedShortNames, profile.legacyType)
  const shortFor = (index: number): string => {
    let candidate = shortNameAt(firstShort, index, quantity)
    let guard = 0
    while (usedShortNames.has(candidate.toUpperCase()) && guard < 100) {
      candidate = incrementShortName(candidate) ?? `${candidate}${index + 1}`
      guard++
    }
    usedShortNames.add(candidate.toUpperCase())
    return candidate
  }
  let start = options.start
  for (let index = 0; index < quantity; index++) {
    while (start + width - 1 <= 512 && Array.from({ length: width }, (_, i) => start + i).some((c) => used.has(c))) start++
    if (start + width - 1 > 512) throw new Error('Not enough free DMX channels for this batch')
    fixtures.push({ id: crypto.randomUUID(), name: `${options.name?.trim() || profile.name}${quantity > 1 ? ` ${index + 1}` : ''}`, shortName: shortFor(index), ...(count > 1 ? { count } : {}), ...(mode.flexibleLeds && options.ledCount !== undefined && options.ledCount !== mode.flexibleLeds.defaultLeds ? { ledCount: options.ledCount } : {}), ...(options.notes?.trim() ? { notes: options.notes.trim() } : {}), ...(options.extReference?.trim() ? { extReference: options.extReference.trim() } : {}), group: options.group?.trim() || 'Ungrouped', type: profile.legacyType, channelStart: start, channels: width, universe: 1, inStorage: true, profileId: profile.id, modeId: mode.id, profile: structuredClone(profile) })
    for (let i = 0; i < width; i++) used.add(start + i)
    start += width
  }
  return fixtures
}
