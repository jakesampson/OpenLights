import type { ShowDef } from '@shared/types'
export function hasUnsavedChanges(show: ShowDef | null, saved: string): boolean { return Boolean(show && JSON.stringify(show) !== saved) }
export function transitionDecision(dirty: boolean, choice?: 'save' | 'discard' | 'cancel', saveSucceeded = false): 'prompt' | 'proceed' | 'stay' {
  if (!dirty || choice === 'discard') return 'proceed'
  if (!choice) return 'prompt'
  return choice === 'save' && saveSucceeded ? 'proceed' : 'stay'
}

/** Fields migrateShow's fixture heal writes (src/shared/migrations.ts).
 *  A fixture that differs from the saved snapshot ONLY in these fields
 *  changed by the heal, never by the user — the heal backfills profile
 *  defaults and fills in missing bookkeeping (profileId, modeId, the
 *  inline profile snapshot, shortName, …). Anything else (name,
 *  channelStart, channels, group, preview positions, …) is a real edit. */
const HEAL_ONLY_FIXTURE_FIELDS = new Set([
  'disabled', 'notes', 'universe', 'profileId', 'modeId', 'profile',
  'inStorage', 'previewBeam', 'namePosition', 'iconSize', 'rotation', 'shortName'
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Re-base a saved snapshot onto the OFL heal's fixture changes, so the
 *  heal (load-time normalisation, not a user edit) does not mark the show
 *  Unsaved. Only the fixtures portion is re-based, and only when every
 *  fixture difference is heal-only: a fixture added, removed, or edited
 *  anywhere else — or any non-fixture difference — keeps the snapshot
 *  untouched, so a real unsaved edit still prompts. Returns the new
 *  snapshot JSON, or null when the snapshot must be left alone (also for
 *  an empty or unparseable snapshot, or no show). */
export function rebaseSnapshotAfterHeal(snapshotJson: string, currentShow: ShowDef | null): string | null {
  if (!currentShow) return null
  let snapshot: unknown
  try { snapshot = JSON.parse(snapshotJson) } catch { return null }
  if (!isRecord(snapshot) || !Array.isArray(snapshot.fixtures)) return null
  const currentFixtures = currentShow.fixtures ?? []
  if (snapshot.fixtures.length !== currentFixtures.length) return null
  const beforeById = new Map<string, Record<string, unknown>>()
  for (const raw of snapshot.fixtures) {
    if (!isRecord(raw) || typeof raw.id !== 'string') return null
    beforeById.set(raw.id, raw)
  }
  const merged: unknown[] = []
  for (const current of currentFixtures) {
    const before = beforeById.get(current.id)
    if (!before) return null
    if (JSON.stringify(before) === JSON.stringify(current)) { merged.push(before); continue }
    const keys = new Set([...Object.keys(before), ...Object.keys(current as unknown as Record<string, unknown>)])
    let healOnly = true
    for (const key of keys) {
      if (JSON.stringify(before[key]) === JSON.stringify((current as unknown as Record<string, unknown>)[key])) continue
      if (!HEAL_ONLY_FIXTURE_FIELDS.has(key)) { healOnly = false; break }
    }
    if (!healOnly) return null
    merged.push(current)
  }
  return JSON.stringify({ ...snapshot, fixtures: merged })
}
