/** Missing versions are legacy version 0. */
export const CURRENT_SCHEMA_VERSION = 1
import { BUILTIN_PROFILES } from './fixtureProfiles'
import { frameConfigFor, LIVE_CUE_SIZE, LIVE_LABEL_SIZE, LIVE_LIST_SIZE, styleFor, validLiveSize } from './liveObjectDefaults'
import type { FrameConfig, LiveDefaultStyles, LiveObjectKind, LiveObjectStyle, ShowDef } from './types'

type Document = Record<string, unknown>
const record = (value: unknown): Document => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Document : {}

const steps: Record<number, (source: Document) => Document> = {
  0: (source) => ({ ...source, schemaVersion: 1 })
}

/** Non-destructive version steps. Future documents retain their version and unknown fields. */
export function migrateShow(raw: unknown): ShowDef {
  let doc = { ...record(raw) }
  let version = typeof doc.schemaVersion === 'number' && Number.isInteger(doc.schemaVersion) && doc.schemaVersion >= 0 ? doc.schemaVersion : 0
  if (version > CURRENT_SCHEMA_VERSION) console.warn(`This show uses schema ${version}; OpenLights supports ${CURRENT_SCHEMA_VERSION}. Unknown fields will be preserved.`)
  while (version < CURRENT_SCHEMA_VERSION) { doc = steps[version](doc); version++ }
  const defaults: Document = { id: 'recovered-show', name: 'Recovered show', createdAt: 0, updatedAt: 0, masterIntensity: 255, bpm: 120 }
  for (const [key, fallback] of Object.entries(defaults)) if (typeof doc[key] !== typeof fallback || (typeof doc[key] === 'number' && !Number.isFinite(doc[key]))) doc[key] = fallback
  for (const key of ['fixtures', 'scenes', 'automations', 'presets', 'cueLists', 'midiMappings', 'effects', 'livePages', 'favoriteProfileIds', 'fixtureProfiles', 'colorFavorites']) {
    if (!Array.isArray(doc[key])) {
      if (doc[key] !== undefined) doc.migrationInvalidFields = { ...record(doc.migrationInvalidFields), [key]: doc[key] }
      doc[key] = []
    }
  }
  // Live page objects gained explicit width/height, text styles and frame
  // configuration; older show files only had positions. Fill additive defaults
  // without discarding values.
  doc.livePages = (doc.livePages as unknown[]).map((rawPage) => {
    const page = record(rawPage)
    const pageDefaults = record(page.defaultStyles) as LiveDefaultStyles
    const decorate = (raw: unknown, size: { width: number; height: number }, kind: LiveObjectKind) => {
      const object = record(raw)
      return {
        ...object,
        width: validLiveSize(object.width) ? object.width : size.width,
        height: validLiveSize(object.height) ? object.height : size.height,
        style: styleFor(kind, record(object.style) as LiveObjectStyle | undefined, pageDefaults),
        ...(kind === 'frame' ? { frame: frameConfigFor(record(object.frame) as FrameConfig | undefined) } : {}),
        ...(kind === 'cue' ? { sequenceIds: Array.isArray(object.sequenceIds) ? object.sequenceIds.filter((id): id is string => typeof id === 'string') : [] } : {})
      }
    }
    return {
      ...page,
      controls: (Array.isArray(page.controls) ? page.controls : []).map((c) => decorate(c, LIVE_CUE_SIZE, 'cue')),
      ...(Array.isArray(page.cueListWidgets) ? { cueListWidgets: page.cueListWidgets.map((w) => decorate(w, LIVE_LIST_SIZE, 'list')) } : {}),
      ...(Array.isArray(page.annotations) ? { annotations: page.annotations.map((a) => decorate(a, LIVE_LABEL_SIZE, record(a).type === 'frame' ? 'frame' as const : 'label' as const)) } : {})
    }
  })
  if (record(doc.startup).mode !== 'restore' && record(doc.startup).mode !== 'none') doc.startup = { ...record(doc.startup), mode: 'none' }
  doc.layout = { preview: true, palette: true, inspector: true, ...record(doc.layout) }
  if (!Array.isArray(doc.stageObjects)) doc.stageObjects = (Array.isArray(doc.previewTrusses) ? doc.previewTrusses : []).map((raw) => { const truss = record(raw); return { ...truss, kind: 'truss', trussShape: truss.shape, fill: 'none', opacity: 1 } })
  doc.fixtures = (doc.fixtures as unknown[]).map((raw) => { const fixture = record(raw); const profile = BUILTIN_PROFILES.find((p) => p.id === fixture.profileId) ?? BUILTIN_PROFILES.find((p) => p.legacyType === fixture.type); return { ...fixture, disabled: fixture.disabled === true, notes: typeof fixture.notes === 'string' ? fixture.notes : '', universe: typeof fixture.universe === 'number' ? fixture.universe : 1, profileId: fixture.profileId ?? profile?.id, modeId: fixture.modeId ?? 'default', profile: fixture.profile ?? profile, inStorage: fixture.inStorage === true, previewBeam: { direction: 'auto', ...record(fixture.previewBeam) }, namePosition: ['above', 'below', 'hidden'].includes(String(fixture.namePosition)) ? fixture.namePosition : 'above', iconSize: typeof fixture.iconSize === 'number' ? fixture.iconSize : 10, rotation: typeof fixture.rotation === 'number' ? fixture.rotation : 0 } })
  if (!Array.isArray(doc.fixtureGroups)) {
    const fixtures = doc.fixtures as Record<string, unknown>[]
    doc.fixtureGroups = [...new Set(fixtures.map((f) => typeof f.group === 'string' && f.group.trim() ? f.group.trim() : 'Ungrouped'))].map((name) => ({ id: `group:${encodeURIComponent(name)}`, name, parentId: null, fixtureIds: fixtures.filter((f) => (typeof f.group === 'string' && f.group.trim() ? f.group.trim() : 'Ungrouped') === name).map((f) => f.id) }))
  }
  for (const key of ['scenes', 'presets']) doc[key] = (doc[key] as unknown[]).map((raw) => ({ ...record(raw), fans: Array.isArray(record(raw).fans) ? record(raw).fans : [] }))
  if (!Array.isArray(doc.presetGroups)) {
    const presets = doc.presets as Record<string, unknown>[]
    doc.presetGroups = [...new Set(presets.map((p) => p.category ?? 'other'))].map((category) => ({ id: `presets:${category}`, name: category, parentId: null, exclusive: false, presetIds: presets.filter((p) => (p.category ?? 'other') === category).map((p) => p.id) }))
  }
  if (!Array.isArray(doc.sequences)) {
    if (doc.sequences !== undefined) doc.migrationInvalidFields = { ...record(doc.migrationInvalidFields), sequences: doc.sequences }
    doc.sequences = []
  }
  doc.sequences = (doc.sequences as unknown[]).map((raw, index) => {
    const sequence = record(raw)
    return { order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1, id: `recovered-sequence-${index}`, name: 'Sequence', ...sequence, steps: (Array.isArray(sequence.steps) ? sequence.steps : []).map((raw, index) => ({ id: `recovered-step-${index}`, name: `Step ${index + 1}`, fixtureValues: {}, presetIds: [], fadeMs: 1000, holdMs: 0, ...record(raw) })) }
  })
  return doc as unknown as ShowDef
}
