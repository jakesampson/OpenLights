import type { FixtureType } from './types'

// Short names (LightKey Guide p.30): up to four characters, shown in the
// Preview; typically one or two letters and a number. LightKey proposes a
// short name based on the fixture type — these bases are that proposal.
// Jake can correct the scheme; the proposal only ever fills a blank field,
// it never overwrites a short name the user typed.
export const SHORT_NAME_BASES: Record<FixtureType, string> = {
  'moving-head': 'MH',
  par: 'P',
  'led-wash': 'W',
  dimmer: 'D',
  'generic-led': 'L',
  'pixel-bar-17ch': 'PB',
  'rgba-4ch': 'R',
  'rgbw-4ch': 'Q'
}

export function shortNameBaseFor(type: FixtureType): string {
  return SHORT_NAME_BASES[type] ?? 'F'
}

/** A typed short name, trimmed to LightKey's four characters, or null. */
export function normalizeShortName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 4) : null
}

/** "MH6" → "MH7" (delta may be negative, floor 0); null when no trailing number. */
export function incrementShortName(name: string, delta = 1): string | null {
  const match = /^(.*?)(\d+)$/.exec(name)
  if (!match) return null
  return `${match[1]}${Math.max(0, Number(match[2]) + delta)}`
}

/**
 * The short name for the fixture at `index` in a batch starting at `start`.
 * A trailing number increments from there ("MH6" → MH6..MH9 for four);
 * without one, a batch appends 1-based numbers ("MH" → MH1..MH6), while a
 * single fixture keeps the name as typed. `index` is 0-based.
 */
export function shortNameAt(start: string, index: number, quantity: number): string {
  if (index <= 0 || quantity <= 1) return start
  const incremented = incrementShortName(start, index)
  if (incremented) return incremented
  return `${start}${index + 1}`
}

/** First free `<base><n>` (n ≥ 1) for a fixture type, case-insensitive. */
export function proposeShortName(existing: Iterable<string>, type: FixtureType): string {
  const used = new Set([...existing].map((name) => name.trim().toUpperCase()).filter(Boolean))
  const base = shortNameBaseFor(type)
  let n = 1
  while (used.has(`${base}${n}`.toUpperCase())) n++
  return `${base}${n}`
}
