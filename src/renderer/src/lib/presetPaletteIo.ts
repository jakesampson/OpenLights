import type { FanDef, FixtureDef, PresetDef } from '@shared/types'

export const PRESET_PALETTE_FORMAT = 'openlights-preset-palette'
export const PRESET_PALETTE_VERSION = 1

/** Portable description of a fixture, used to re-map preset values on import. */
export interface PresetFixtureRef {
  id: string // the id used inside the exported preset fixtureValues
  name: string
  profileId?: string
  profileName?: string
  type?: string
}

export interface PresetPaletteExport {
  format: typeof PRESET_PALETTE_FORMAT
  version: number
  exportedAt?: string
  fixtures: PresetFixtureRef[]
  presets: PresetDef[]
}

export interface SkippedFixture {
  fixtureId: string
  fixtureName: string
  reason: string
}

export interface ImportResult {
  presets: PresetDef[]
  matched: { sourceId: string; targetId: string }[]
  skipped: SkippedFixture[]
}

export interface ImportOptions {
  /** Keep preset ids instead of generating fresh ones (useful for round trips). */
  preserveIds?: boolean
  makeId?: () => string
  onSkip?: (info: SkippedFixture) => void
}

const refFromFixture = (f: FixtureDef): PresetFixtureRef => ({
  id: f.id,
  name: f.name,
  profileId: f.profileId ?? f.profile?.id,
  profileName: f.profile?.name,
  type: f.type
})

/** Collect the fixture ids referenced by a set of presets (values and fans). */
function referencedFixtureIds(presets: PresetDef[]): Set<string> {
  const ids = new Set<string>()
  for (const preset of presets) {
    for (const id of Object.keys(preset.fixtureValues ?? {})) ids.add(id)
    for (const fan of preset.fans ?? []) for (const id of fan.fixtureIds) ids.add(id)
  }
  return ids
}

/** Build the portable export document for the given presets. */
export function exportPresetPalette(
  presets: PresetDef[],
  fixtures: FixtureDef[],
  exportedAt: string = new Date().toISOString()
): PresetPaletteExport {
  const ids = referencedFixtureIds(presets)
  const byId = new Map(fixtures.map((f) => [f.id, f]))
  const refs: PresetFixtureRef[] = []
  for (const id of ids) {
    const fixture = byId.get(id)
    if (fixture) {
      refs.push(refFromFixture(fixture))
    } else {
      // Referenced but absent from the patch: keep a descriptor so the import
      // can report it as skipped rather than silently losing the values.
      refs.push({ id, name: id })
    }
  }
  return {
    format: PRESET_PALETTE_FORMAT,
    version: PRESET_PALETTE_VERSION,
    exportedAt,
    fixtures: refs,
    presets: presets.map((preset) => structuredClone(preset))
  }
}

export function serializePresetPalette(data: PresetPaletteExport): string {
  return JSON.stringify(data, null, 2)
}

export function validatePresetPalette(data: unknown): string[] {
  const doc = data as Partial<PresetPaletteExport> | null
  if (!doc || typeof doc !== 'object') return ['A preset palette document is required']
  const errors: string[] = []
  if (doc.format !== PRESET_PALETTE_FORMAT) errors.push('Unsupported preset palette format')
  if (doc.version !== PRESET_PALETTE_VERSION) errors.push('Unsupported preset palette version')
  if (!Array.isArray(doc.presets)) errors.push('Presets must be an array')
  if (!Array.isArray(doc.fixtures)) errors.push('Fixtures must be an array')
  return errors
}

const normalizeName = (name: string) => name.trim().toLowerCase()

function profilesMatch(ref: PresetFixtureRef, target: FixtureDef): boolean {
  const targetProfileId = target.profileId ?? target.profile?.id
  if (ref.profileId && targetProfileId) return ref.profileId === targetProfileId
  const targetProfileName = target.profile?.name
  if (ref.profileName && targetProfileName) {
    return normalizeName(ref.profileName) === normalizeName(targetProfileName)
  }
  if (ref.type && target.type) return ref.type === target.type
  // No profile information on either side: name match alone is all we can check.
  return true
}

/**
 * Import a preset palette document, matching each exported fixture to a target
 * fixture by name and profile. Unmatched fixtures are dropped from the values
 * and reported (and passed to onSkip) so they can be logged by the caller.
 */
export function importPresetPalette(
  input: string | PresetPaletteExport,
  fixtures: FixtureDef[],
  options: ImportOptions = {}
): ImportResult {
  const data: PresetPaletteExport = typeof input === 'string' ? JSON.parse(input) : input
  const errors = validatePresetPalette(data)
  if (errors.length) throw new Error(errors.join('; '))

  const makeId = options.makeId ?? (() => crypto.randomUUID())
  const idMap = new Map<string, string>()
  const matched: ImportResult['matched'] = []
  const skipped: SkippedFixture[] = []
  const usedTargets = new Set<string>()

  for (const ref of data.fixtures) {
    const candidates = fixtures.filter(
      (f) => normalizeName(f.name) === normalizeName(ref.name) && profilesMatch(ref, f)
    )
    const target = candidates.find((f) => !usedTargets.has(f.id))
    if (!target) {
      const info: SkippedFixture = {
        fixtureId: ref.id,
        fixtureName: ref.name,
        reason: 'no fixture with a matching name and profile'
      }
      skipped.push(info)
      options.onSkip?.(info)
      continue
    }
    usedTargets.add(target.id)
    idMap.set(ref.id, target.id)
    matched.push({ sourceId: ref.id, targetId: target.id })
  }

  const presets: PresetDef[] = data.presets.map((preset) => {
    const fixtureValues: PresetDef['fixtureValues'] = {}
    for (const [sourceId, values] of Object.entries(preset.fixtureValues ?? {})) {
      const targetId = idMap.get(sourceId)
      if (targetId) fixtureValues[targetId] = { ...values }
    }
    const next: PresetDef = {
      ...structuredClone(preset),
      id: options.preserveIds ? preset.id : makeId(),
      fixtureValues
    }
    if (preset.fans) {
      const fans: FanDef[] = preset.fans
        .map((fan) => ({
          ...fan,
          fixtureIds: fan.fixtureIds
            .map((id) => idMap.get(id))
            .filter((id): id is string => Boolean(id))
        }))
        .filter((fan) => fan.fixtureIds.length > 0)
      next.fans = fans
    }
    return next
  })

  return { presets, matched, skipped }
}
