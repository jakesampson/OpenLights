/** Missing versions are legacy version 0. */
export const CURRENT_SCHEMA_VERSION = 3
import { BUILTIN_PROFILES } from './fixtureProfiles'
import { proposeShortName } from './shortNames'
import { frameConfigFor, LIVE_CUE_SIZE, LIVE_LABEL_SIZE, LIVE_LIST_SIZE, styleFor, validLiveSize } from './liveObjectDefaults'
import type { FixtureType, FrameConfig, LiveDefaultStyles, LiveObjectKind, LiveObjectStyle, ShowDef } from './types'

type Document = Record<string, unknown>
const record = (value: unknown): Document => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Document : {}

const steps: Record<number, (source: Document) => Document> = {
  0: (source) => ({ ...source, schemaVersion: 1 }),
  // 18 Nov 2026: LightKey has no "scene" concept (Guide ch.9/ch.11) — a
  // stored look is a cue. Rename the stored key and every reference to it.
  // Nothing is lost: cue ids, names, fixture values and fade timings are
  // unchanged, and cuelist steps / Live buttons keep pointing at the same
  // look under its new name.
  1: (source) => {
    const doc: Document = { ...source, schemaVersion: 2 }
    if (Array.isArray(doc.scenes)) { doc.cues = doc.scenes; delete doc.scenes }
    // Cuelist steps pointed at a look by sceneId.
    for (const rawList of Array.isArray(doc.cueLists) ? doc.cueLists : []) {
      const list = record(rawList)
      if (!Array.isArray(list.steps)) continue
      list.steps = list.steps.map((rawStep) => {
        const step = record(rawStep)
        if (typeof step.sceneId === 'string') { step.cueId = step.sceneId; delete step.sceneId }
        return step
      })
    }
    // Live buttons bound to a stored look.
    for (const rawPage of Array.isArray(doc.livePages) ? doc.livePages : []) {
      const page = record(rawPage)
      if (!Array.isArray(page.controls)) continue
      page.controls = page.controls.map((rawControl) => {
        const control = record(rawControl)
        if (typeof control.sceneId === 'string') { control.cueId = control.sceneId; delete control.sceneId }
        return control
      })
    }
    // MIDI bindings and startup restore pointed at a look.
    for (const rawMapping of Array.isArray(doc.midiMappings) ? doc.midiMappings : []) {
      const mapping = record(rawMapping)
      if (mapping.targetType === 'scene') mapping.targetType = 'cue'
    }
    if (typeof record(doc.startup).sceneId === 'string') {
      const startup = record(doc.startup)
      startup.cueId = startup.sceneId
      delete startup.sceneId
      doc.startup = startup
    }
    // Presets converted from a look carried a `preset-from-scene:<id>` id;
    // rename the id and every reference to it (preset id lists, owners).
    const renamed = new Map<string, string>()
    for (const rawPreset of Array.isArray(doc.presets) ? doc.presets : []) {
      const preset = record(rawPreset)
      if (typeof preset.id === 'string' && preset.id.startsWith('preset-from-scene:')) {
        const next = `preset-from-cue:${preset.id.slice('preset-from-scene:'.length)}`
        renamed.set(preset.id, next)
        preset.id = next
      }
    }
    if (renamed.size > 0) {
      const remapIds = (ids: unknown) => Array.isArray(ids) ? ids.map((id) => typeof id === 'string' ? renamed.get(id) ?? id : id) : ids
      if (record(doc.startup).presetIds) record(doc.startup).presetIds = remapIds(record(doc.startup).presetIds)
      for (const rawPage of Array.isArray(doc.livePages) ? doc.livePages : []) {
        const page = record(rawPage)
        for (const rawControl of Array.isArray(page.controls) ? page.controls : []) {
          const control = record(rawControl)
          if (control.presetIds) control.presetIds = remapIds(control.presetIds)
        }
      }
      for (const rawSequence of Array.isArray(doc.sequences) ? doc.sequences : []) {
        const sequence = record(rawSequence)
        for (const rawStep of Array.isArray(sequence.steps) ? sequence.steps : []) {
          const step = record(rawStep)
          if (step.presetIds) step.presetIds = remapIds(step.presetIds)
        }
      }
      for (const rawEffect of [...(Array.isArray(doc.effects) ? doc.effects : []), ...(Array.isArray(doc.effectTemplates) ? doc.effectTemplates : [])]) {
        const effect = record(rawEffect)
        const owner = record(effect.owner)
        if (owner.type === 'preset' && typeof owner.id === 'string') owner.id = renamed.get(owner.id) ?? owner.id
      }
    }
    return doc
  },
  // 19 Nov 2026: fixtures carry a short name (≤4 chars) for the Preview
  // (LightKey Guide p.30). The names themselves are filled in the additive
  // defaults below, so this step only bumps the version.
  2: (source) => ({ ...source, schemaVersion: 3 })
}

/** Non-destructive version steps. Future documents retain their version and unknown fields. */
export function migrateShow(raw: unknown): ShowDef {
  let doc = { ...record(raw) }
  let version = typeof doc.schemaVersion === 'number' && Number.isInteger(doc.schemaVersion) && doc.schemaVersion >= 0 ? doc.schemaVersion : 0
  if (version > CURRENT_SCHEMA_VERSION) console.warn(`This show uses schema ${version}; OpenLights supports ${CURRENT_SCHEMA_VERSION}. Unknown fields will be preserved.`)
  while (version < CURRENT_SCHEMA_VERSION) { doc = steps[version](doc); version++ }
  const defaults: Document = { id: 'recovered-show', name: 'Recovered show', createdAt: 0, updatedAt: 0, masterIntensity: 255, bpm: 120 }
  for (const [key, fallback] of Object.entries(defaults)) if (typeof doc[key] !== typeof fallback || (typeof doc[key] === 'number' && !Number.isFinite(doc[key]))) doc[key] = fallback
  for (const key of ['fixtures', 'cues', 'automations', 'presets', 'cueLists', 'midiMappings', 'effects', 'livePages', 'favoriteProfileIds', 'fixtureProfiles', 'colorFavorites']) {
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
        ...(kind === 'cue' ? { sequenceIds: Array.isArray(object.sequenceIds) ? object.sequenceIds.filter((id): id is string => typeof id === 'string') : [], timing: { fadeInMs: 0, fadeOutMs: 0, delayMs: 0, curve: 'linear', ...record(object.timing) }, appearance: { color: '#47235a', releaseOthers: false, ...record(object.appearance) }, modifiers: { intensity: 100, speed: 100, size: 100, ...record(object.modifiers) }, priority: typeof object.priority === 'number' ? object.priority : 0 } : {})
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
  doc.preferences = { defaultFadeMs: 1000, pageFadeMs: 500, theme: 'dark', dmxProtocol: 'open-dmx-usb', ...record(doc.preferences) }
  if (!Array.isArray(doc.stageObjects)) doc.stageObjects = (Array.isArray(doc.previewTrusses) ? doc.previewTrusses : []).map((raw) => { const truss = record(raw); return { ...truss, kind: 'truss', trussShape: truss.shape, fill: 'none', opacity: 1 } })
  // Short names (LightKey Guide p.30): fixtures stored before schema v3
  // have none, so derive them from the fixture type (MH/P/…) with the
  // first free number per base, in fixture order. Stored names are kept
  // exactly as they are; this only fills blanks, so it is idempotent.
  const usedShortNames = new Set<string>()
  for (const raw of doc.fixtures as unknown[]) { const name = record(raw).shortName; if (typeof name === 'string' && name.trim()) usedShortNames.add(name.trim().toUpperCase()) }
  doc.fixtures = (doc.fixtures as unknown[]).map((raw) => { const fixture = record(raw); const profile = BUILTIN_PROFILES.find((p) => p.id === fixture.profileId) ?? BUILTIN_PROFILES.find((p) => p.legacyType === fixture.type); return { ...fixture, disabled: fixture.disabled === true, notes: typeof fixture.notes === 'string' ? fixture.notes : '', universe: typeof fixture.universe === 'number' ? fixture.universe : 1, profileId: fixture.profileId ?? profile?.id, modeId: fixture.modeId ?? 'default', profile: fixture.profile ?? profile, inStorage: fixture.inStorage === true, previewBeam: { direction: 'auto', ...record(fixture.previewBeam) }, namePosition: ['above', 'below', 'hidden'].includes(String(fixture.namePosition)) ? fixture.namePosition : 'above', iconSize: typeof fixture.iconSize === 'number' ? fixture.iconSize : 10, rotation: typeof fixture.rotation === 'number' ? fixture.rotation : 0, shortName: typeof fixture.shortName === 'string' && fixture.shortName.trim() ? fixture.shortName.trim().slice(0, 4) : (() => { const next = proposeShortName(usedShortNames, (typeof fixture.type === 'string' ? fixture.type : 'par') as FixtureType); usedShortNames.add(next.toUpperCase()); return next })() } })
  if (!Array.isArray(doc.fixtureGroups)) {
    const fixtures = doc.fixtures as Record<string, unknown>[]
    doc.fixtureGroups = [...new Set(fixtures.map((f) => typeof f.group === 'string' && f.group.trim() ? f.group.trim() : 'Ungrouped'))].map((name) => ({ id: `group:${encodeURIComponent(name)}`, name, parentId: null, fixtureIds: fixtures.filter((f) => (typeof f.group === 'string' && f.group.trim() ? f.group.trim() : 'Ungrouped') === name).map((f) => f.id) }))
  }
  for (const key of ['cues', 'presets']) doc[key] = (doc[key] as unknown[]).map((raw) => ({ ...record(raw), fans: Array.isArray(record(raw).fans) ? record(raw).fans : [] }))
  doc.midiMappings = (doc.midiMappings as unknown[]).map((raw) => {
    const mapping = record(raw)
    return { ...mapping, trigger: mapping.trigger ?? (mapping.targetType === 'master' && mapping.midiType === 'cc' ? 'value' : 'press') }
  })
  // No standard folders (LightKey palette, 18 Nov 2026): old shows had no
  // presetGroups at all, and earlier code seeded one group per preset
  // category (`presets:<category>`). Both cases now start with no groups —
  // presets are ungrouped (shown at the tree root) until the user creates
  // their own. Seeded groups stored in an existing show are stripped too;
  // their presets are not lost, only ungrouped. User-made groups (UUID ids)
  // are kept exactly as stored.
  if (!Array.isArray(doc.presetGroups)) {
    doc.presetGroups = []
  } else {
    doc.presetGroups = (doc.presetGroups as Record<string, unknown>[]).filter(
      (g) => typeof g.id !== 'string' || !g.id.startsWith('presets:')
    )
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
