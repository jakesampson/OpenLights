import type { FixtureProfile } from './types'
export function validateProfile(raw: unknown): string[] {
  const p = raw as Partial<FixtureProfile> | null
  if (!p || typeof p !== 'object') return ['A profile object is required']
  const errors: string[] = []
  if (!p.id || typeof p.name !== 'string' || !p.name.trim() || typeof p.manufacturer !== 'string') errors.push('Profile id, name and manufacturer are required')
  if (!Array.isArray(p.modes) || !p.modes.length) return [...errors, 'At least one mode is required']
  const modes = new Set<string>()
  for (const mode of p.modes) {
    if (!mode.id || modes.has(mode.id)) errors.push('Mode ids must be unique'); modes.add(mode.id)
    if (!Array.isArray(mode.channels) || !mode.channels.length) { errors.push('A mode requires channels'); continue }
    const numbers = new Set<number>(), attributes = new Set<string>()
    for (const c of mode.channels) {
      if (!Number.isInteger(c.number) || c.number < 0 || c.number > 511 || numbers.has(c.number)) errors.push('Channel numbers must be unique and inside 1–512'); numbers.add(c.number)
      if (!c.attribute || attributes.has(c.attribute)) errors.push('Channel properties must be unique'); attributes.add(c.attribute)
      if (![c.min, c.max, c.defaultValue, c.highlightValue].every((v) => Number.isFinite(v) && v >= 0 && v <= 255) || c.min > c.max || c.defaultValue < c.min || c.defaultValue > c.max || c.highlightValue < c.min || c.highlightValue > c.max) errors.push('Channel ranges and values must be inside 0–255')
      if (!['intensity', 'color', 'position', 'other'].includes(c.propertyType)) errors.push('Choose a supported property type')
    }
  }
  return errors
}
export function importProfile(json: string): FixtureProfile { const raw = JSON.parse(json); const errors = validateProfile(raw); if (errors.length) throw new Error(errors.join('; ')); return raw }
export function exportProfile(profile: FixtureProfile): string { const errors = validateProfile(profile); if (errors.length) throw new Error(errors.join('; ')); return JSON.stringify(profile, null, 2) }
