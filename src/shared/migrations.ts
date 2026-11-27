/** Missing versions are legacy version 0. */
export const CURRENT_SCHEMA_VERSION = 5
import { BUILTIN_PROFILES } from './fixtureProfiles'
import { proposeShortName } from './shortNames'
import { frameConfigFor, LIVE_CUE_SIZE, LIVE_LABEL_SIZE, LIVE_LIST_SIZE, styleFor, validLiveSize } from './liveObjectDefaults'
import type { FixtureProfile, FixtureType, FrameConfig, LiveDefaultStyles, LiveObjectKind, LiveObjectStyle, ShowDef } from './types'
import { DEFAULT_CUE_PRIORITY } from './types'

type Document = Record<string, unknown>
const record = (value: unknown): Document => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Document : {}

/**
 * Does a library profile identify the same OFL definition as a stored
 * snapshot, by the snapshot's stored `ofl` field rather than its id?
 * The fixture key must match, and the manufacturer key must match unless
 * the snapshot's is the placeholder 'open-fixture-library' (or missing)
 * that the old no-options import wrote — that placeholder is the only
 * reason the id can be wrong, so it is the only case this forgives.
 */
const oflIdentityMatches = (profile: FixtureProfile, stored: Document): boolean => {
  const storedOfl = record(stored.ofl)
  const profileOfl = record(profile.ofl)
  if (typeof storedOfl.fixtureKey !== 'string' || !storedOfl.fixtureKey) return false
  if (storedOfl.fixtureKey !== profileOfl.fixtureKey) return false
  const manufacturerKey = storedOfl.manufacturerKey
  return manufacturerKey === profileOfl.manufacturerKey || manufacturerKey === 'open-fixture-library' || manufacturerKey === '' || manufacturerKey === undefined
}

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
  2: (source) => ({ ...source, schemaVersion: 3 }),
  // 19 Nov 2026 (Piece 8): cues store preset/sequence references like
  // LightKey (Guide ch.11, pp.199–202) instead of only raw fixture values.
  // The cue's existing raw values stay exactly where they are — they ARE
  // the cue's ad-hoc properties (LightKey's "Ad hoc properties" item,
  // p.201: a preset which does not appear in the Preset Palette), so an
  // old show loads with byte-identical output and no new presets appear
  // in the palette. The migration only establishes the reference model:
  // every cue gains presetIds/sequenceIds (empty until the operator adds
  // presets or sequences to the cue). Converting a cue's values into a
  // visible preset is a separate, user-invoked action ("Convert cues to
  // presets" in the palette) and is deliberately not done here.
  3: (source) => {
    const doc: Document = { ...source, schemaVersion: 4 }
    if (Array.isArray(doc.cues)) {
      doc.cues = doc.cues.map((raw) => {
        const cue = record(raw)
        return {
          ...cue,
          presetIds: Array.isArray(cue.presetIds) ? cue.presetIds.filter((id): id is string => typeof id === 'string') : [],
          sequenceIds: Array.isArray(cue.sequenceIds) ? cue.sequenceIds.filter((id): id is string => typeof id === 'string') : [],
          fixtureValues: record(cue.fixtureValues)
        }
      })
    }
    return doc
  },
  // 27 Nov 2026 (Jake): LightKey separates a button's Type from its
  // Behaviour (guide ch.11, p.204) — Type is Push Button / Fader
  // Horizontal / Fader Vertical, Behaviour is Toggle (latching, the
  // default) / Flash (momentary). The old model collapsed them into
  // one `type` field: 'toggle' was a Push Button with Toggle behaviour,
  // 'flash' a Push Button with Flash behaviour, 'fader' a horizontal
  // fader. Nothing is lost: every button keeps exactly the behaviour
  // it had, under the two-field model.
  4: (source) => {
    const doc: Document = { ...source, schemaVersion: 5 }
    for (const rawPage of Array.isArray(doc.livePages) ? doc.livePages : []) {
      const page = record(rawPage)
      if (!Array.isArray(page.controls)) continue
      page.controls = page.controls.map((rawControl) => {
        const control = record(rawControl)
        if (control.type === 'toggle') { control.type = 'push'; control.behavior = 'toggle' }
        else if (control.type === 'flash') { control.type = 'push'; control.behavior = 'flash' }
        else if (control.type === 'fader') { control.type = 'faderHorizontal'; delete control.behavior }
        return control
      })
    }
    return doc
  }
}

/** Non-destructive version steps. Future documents retain their version and unknown fields. */
export function migrateShow(raw: unknown, extraLibraryProfiles: FixtureProfile[] = []): ShowDef {
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
        ...(kind === 'cue' ? { sequenceIds: Array.isArray(object.sequenceIds) ? object.sequenceIds.filter((id): id is string => typeof id === 'string') : [], effectIds: Array.isArray(object.effectIds) ? object.effectIds.filter((id): id is string => typeof id === 'string') : [], timing: { fadeInMs: 0, fadeOutMs: 0, delayMs: 0, curve: 'linear', ...record(object.timing) }, appearance: { color: '#47235a', releaseOthers: false, ...record(object.appearance) }, modifiers: { intensity: 100, speed: 100, size: 100, ...record(object.modifiers) }, priority: typeof object.priority === 'number' ? object.priority : DEFAULT_CUE_PRIORITY } : {})
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
  doc.layout = { preview: true, palette: true, inspector: true, shortcuts: true, ...record(doc.layout) }
  doc.preferences = { defaultFadeMs: 1000, pageFadeMs: 500, theme: 'dark', dmxProtocol: 'open-dmx-usb', ...record(doc.preferences) }
  if (!Array.isArray(doc.stageObjects)) doc.stageObjects = (Array.isArray(doc.previewTrusses) ? doc.previewTrusses : []).map((raw) => { const truss = record(raw); return { ...truss, kind: 'truss', trussShape: truss.shape, fill: 'none', opacity: 1 } })
  // Short names (LightKey Guide p.30): fixtures stored before schema v3
  // have none, so derive them from the fixture type (MH/P/…) with the
  // first free number per base, in fixture order. Stored names are kept
  // exactly as they are; this only fills blanks, so it is idempotent.
  const usedShortNames = new Set<string>()
  for (const raw of doc.fixtures as unknown[]) { const name = record(raw).shortName; if (typeof name === 'string' && name.trim()) usedShortNames.add(name.trim().toUpperCase()) }
  // Inline profile snapshots go stale (Jake, 20 Nov 2026): patching
  // stores a structuredClone of the profile on the fixture, and Piece 11
  // (19 Nov 2026) changed the colour defaults (blue 0 → 255) — so a
  // fixture patched before then keeps blue at 0 forever: no colour on the
  // wheel and the Dimmer brings up black until the wheel is touched,
  // while a fixture patched after auto-goes blue. The wheel still shows
  // blue on the stale fixture because it displays the preserved hue /
  // saturation / brightness for a black fixture, not a real colour value
  // — the output side is the wrong one, and healing the snapshot fixes
  // it. Library profiles are immutable (built-ins refuse a same-id edit,
  // OFL profiles are re-imported from their definitions, and the show's
  // own stored profiles are the library copies the fixtures were patched
  // from), so an inline deviation from the library is staleness, never a
  // user edit: backfill the channel defaults from the current library
  // profile, matched by mode and attribute. Channel layout is never
  // touched for a base record — except for a CUSTOM profile, which is
  // the user's own editable fixture (Jake, 20 Nov 2026, global customs):
  // its inline snapshot is refreshed wholesale from the library copy,
  // so an edit to the definition reaches fixtures already patched from
  // it. A profile whose id is in no library is left exactly as
  // stored — a custom profile's defaults are the user's, so the heal
  // only ever matches by id (the fixture's profileId, or the snapshot's
  // own id when the profileId was lost) — or by the snapshot's stored OFL
  // identity, which is the same definition named a different way — never
  // by legacy type. The
  // library is the built-ins, the show's own stored profiles, and any
  // extra profiles the caller supplies — the OFL library lives in the
  // main process, so the renderer passes its cached copy (a fixture
  // whose profileId is 'ofl:…' was skipped entirely before this, which
  // is why the Rogue R3 Spots in Jake's "PRBC Default" stayed dark).
  // Same composition as PatchPanel's library.
  const library: FixtureProfile[] = [...BUILTIN_PROFILES, ...((doc.fixtureProfiles as FixtureProfile[] | undefined) ?? []), ...extraLibraryProfiles]
  const healStoredProfileDefaults = (rawProfile: unknown, profileId: unknown): unknown => {
    const stored = record(rawProfile)
    // A snapshot imported without manufacturer/fixture keys carries the
    // placeholder id ofl:open-fixture-library:<fixture>, which no library
    // profile has — its stored `ofl` field still names the definition it
    // came from, so match on the fixture key, allowing the placeholder
    // manufacturer key (the buggy import wrote 'open-fixture-library'
    // there) or a missing one. A genuinely custom profile carries no
    // `ofl` field, so it can never match this way.
    const libraryProfile = library.find((p) => p.id === profileId) ?? library.find((p) => p.id === stored.id)
      ?? library.find((p) => oflIdentityMatches(p, stored))
    if (!libraryProfile || !Array.isArray(stored.modes)) return rawProfile
    // A custom profile is the user's own fixture and it is editable
    // (Jake, 20 Nov 2026 — customs are global, edited in the profile
    // editor): the library copy is the definition, so an inline
    // snapshot that differs from it is stale from an edit, not user
    // data — refresh the whole snapshot. A custom in no library is
    // left exactly as stored (it is the only copy). Base records keep
    // the defaults-only backfill below: their layout is immutable
    // library data, and only a stale default is ever healed.
    if (libraryProfile.custom === true) return structuredClone(libraryProfile)
    return {
      ...stored,
      modes: stored.modes.map((rawMode) => {
        const mode = record(rawMode)
        const libraryMode = libraryProfile.modes.find((m) => m.id === mode.id)
        if (!libraryMode || !Array.isArray(mode.channels)) return mode
        const byAttribute = new Map(libraryMode.channels.map((c) => [c.attribute, c]))
        return {
          ...mode,
          channels: mode.channels.map((rawChannel) => {
            const channel = record(rawChannel)
            const match = typeof channel.attribute === 'string' ? byAttribute.get(channel.attribute) : undefined
            return match && typeof match.defaultValue === 'number' ? { ...channel, defaultValue: match.defaultValue } : channel
          })
        }
      })
    }
  }
  doc.fixtures = (doc.fixtures as unknown[]).map((raw) => { const fixture = record(raw); const profile = library.find((p) => p.id === fixture.profileId) ?? library.find((p) => p.legacyType === fixture.type); return { ...fixture, disabled: fixture.disabled === true, notes: typeof fixture.notes === 'string' ? fixture.notes : '', universe: typeof fixture.universe === 'number' ? fixture.universe : 1, profileId: fixture.profileId ?? profile?.id, modeId: fixture.modeId ?? 'default', profile: fixture.profile ? healStoredProfileDefaults(fixture.profile, fixture.profileId) : profile, inStorage: fixture.inStorage === true, previewBeam: { direction: (() => { const d = record(fixture.previewBeam).direction; return d === 'auto' || typeof d === 'number' ? d : 'auto' })() }, namePosition: ['above', 'below', 'hidden'].includes(String(fixture.namePosition)) ? fixture.namePosition : 'above', iconSize: typeof fixture.iconSize === 'number' ? fixture.iconSize : 10, rotation: typeof fixture.rotation === 'number' ? fixture.rotation : 0, shortName: typeof fixture.shortName === 'string' && fixture.shortName.trim() ? fixture.shortName.trim().slice(0, 4) : (() => { const next = proposeShortName(usedShortNames, (typeof fixture.type === 'string' ? fixture.type : 'par') as FixtureType); usedShortNames.add(next.toUpperCase()); return next })() } })
  if (!Array.isArray(doc.fixtureGroups)) {
    const fixtures = doc.fixtures as Record<string, unknown>[]
    doc.fixtureGroups = [...new Set(fixtures.map((f) => typeof f.group === 'string' && f.group.trim() ? f.group.trim() : 'Ungrouped'))].map((name) => ({ id: `group:${encodeURIComponent(name)}`, name, parentId: null, fixtureIds: fixtures.filter((f) => (typeof f.group === 'string' && f.group.trim() ? f.group.trim() : 'Ungrouped') === name).map((f) => f.id) }))
  }
  // Effect fixture membership (Jake, 27 Nov 2026): an empty fixtureIds
  // used to mean "all fixtures"; it now means "no fixtures" — an
  // effect with no fixtures runs on nothing — so an old effect (or
  // saved template) with no list is expanded to every fixture in the
  // show. Its behaviour is preserved exactly, and the members are now
  // visible in the editor, where they can be added and removed.
  {
    const allFixtureIds = (doc.fixtures as Record<string, unknown>[]).map((f) => f.id as string)
    for (const key of ['effects', 'effectTemplates'] as const) {
      doc[key] = ((doc[key] as unknown[] | undefined) ?? []).map((raw) => {
        const effect = record(raw)
        return Array.isArray(effect.fixtureIds) && effect.fixtureIds.length === 0
          ? { ...effect, fixtureIds: [...allFixtureIds] }
          : effect
      })
    }
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
