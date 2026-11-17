import type { FixtureDef, FixtureProfile } from '@shared/types'
export interface PatchOptions { modeId?: string; quantity: number; start: number; name?: string; group?: string; universe?: number }
export interface PatchConflict { fixtureIds: string[]; type: 'overlap' | 'out-of-range'; channels: number[] }
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
  const quantity = options.quantity, width = Math.max(...mode.channels.map((c) => c.number)) + 1
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 512 || !Number.isInteger(options.start) || options.start < 1 || options.start > 512) throw new Error('Choose a valid quantity and DMX start address')
  const used = new Set(existing.flatMap((f) => Array.from({ length: f.channels }, (_, i) => f.channelStart + i)))
  const fixtures: FixtureDef[] = []
  let start = options.start
  for (let index = 0; index < quantity; index++) {
    while (start + width - 1 <= 512 && Array.from({ length: width }, (_, i) => start + i).some((c) => used.has(c))) start++
    if (start + width - 1 > 512) throw new Error('Not enough free DMX channels for this batch')
    fixtures.push({ id: crypto.randomUUID(), name: `${options.name?.trim() || profile.name}${quantity > 1 ? ` ${index + 1}` : ''}`, group: options.group?.trim() || 'Ungrouped', type: profile.legacyType, channelStart: start, channels: width, universe: 1, inStorage: true, profileId: profile.id, modeId: mode.id, profile: structuredClone(profile) })
    for (let i = 0; i < width; i++) used.add(start + i)
    start += width
  }
  return fixtures
}
