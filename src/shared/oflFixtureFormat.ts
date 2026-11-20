import type { FixtureChannel, FixtureProfile, FixtureType } from './types'

const OFL_SCHEMA = 'https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/master/schemas/fixture.json'

type JsonRecord = Record<string, unknown>
type OflDescriptor = { key: string; definition: JsonRecord; byte: number }

export interface OflImportOptions {
  manufacturer?: string
  manufacturerKey?: string
  fixtureKey?: string
  sourceName?: string
  preserveSource?: boolean
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fixture'
}

function displayKey(value: string): string {
  return value.split(/[-_]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')
}

function manufacturerFromSource(sourceName?: string): string | undefined {
  if (!sourceName) return undefined
  const file = sourceName.split(/[\\/]/).pop()?.replace(/\.json$/i, '') ?? ''
  const separator = file.indexOf('@')
  return separator > 0 ? displayKey(file.slice(0, separator)) : undefined
}

function dmxByte(value: unknown, resolution: unknown, byte = 0, fallback: number): number {
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const percent = Number(value.slice(0, -1))
    return Number.isFinite(percent) ? Math.round(Math.max(0, Math.min(100, percent)) * 2.55) : fallback
  }
  if (!Number.isFinite(value)) return fallback
  const bits = resolution === '24bit' ? 24 : resolution === '16bit' ? 16 : 8
  const bounded = Math.max(0, Math.min(2 ** bits - 1, Number(value)))
  return Math.round(bounded) >> Math.max(0, bits - (byte + 1) * 8) & 0xff
}

function capabilityTypes(channel: JsonRecord): string[] {
  const single = record(channel.capability).type
  const many = Array.isArray(channel.capabilities) ? channel.capabilities.map((item) => record(item).type) : []
  return [single, ...many].filter((item): item is string => typeof item === 'string')
}

function propertyType(channel: JsonRecord, key: string): FixtureChannel['propertyType'] {
  const types = capabilityTypes(channel)
  if (types.some((type) => type === 'Intensity')) return 'intensity'
  if (types.some((type) => type.startsWith('Color'))) return 'color'
  if (types.some((type) => ['Pan', 'Tilt', 'PanContinuous', 'TiltContinuous'].includes(type))) return 'position'
  if (/dimmer|intensity/i.test(key)) return 'intensity'
  if (/\b(red|green|blue|white|amber|uv|cyan|magenta|yellow)\b/i.test(key)) return 'color'
  if (/\b(pan|tilt)\b/i.test(key)) return 'position'
  return 'other'
}

function channelControl(channel: JsonRecord): FixtureChannel['control'] | undefined {
  const types = capabilityTypes(channel)
  if (types.some((type) => type.startsWith('Color'))) return 'color-wheel'
  if (types.some((type) => type.startsWith('Wheel'))) return 'gobo-wheel'
  if (Array.isArray(channel.capabilities)) return 'options'
  return 'slider'
}

function channelSlots(channel: JsonRecord): FixtureChannel['slots'] {
  if (!Array.isArray(channel.capabilities)) return undefined
  return channel.capabilities.map((raw, index) => {
    const capability = record(raw)
    const range = Array.isArray(capability.dmxRange) ? capability.dmxRange : [0, 255]
    const type = typeof capability.type === 'string' ? capability.type : 'Capability'
    const comment = typeof capability.comment === 'string' ? capability.comment : ''
    return {
      id: `ofl-slot-${index + 1}`,
      name: comment || type.replace(/([a-z])([A-Z])/g, '$1 $2'),
      from: dmxByte(range[0], channel.dmxValueResolution, 0, 0),
      to: dmxByte(range[1], channel.dmxValueResolution, 0, 255),
      // The OFL capability type is the range's meaning: 'ShutterStrobe'
      // ranges strobe, 'Effect' ranges are auto programs, 'NoFunction'
      // is the off/no-program range, 'EffectSpeed' is a program speed.
      // The name alone does not carry it (an EP4 "RGB colors switching"
      // range is an auto program; a Spectra "Open" range is ShutterStrobe
      // typed), so keep it on the slot for the Shutter/Strobe and Auto
      // Program panels to read.
      capabilityType: type,
      kind: /Rotation|Speed|Continuous/.test(type) ? 'spin' as const : 'slot' as const
    }
  })
}

function legacyType(categories: unknown, channels: FixtureChannel[]): FixtureType {
  const list = Array.isArray(categories) ? categories : []
  if (list.includes('Moving Head')) return 'moving-head'
  if (list.includes('Dimmer')) return 'dimmer'
  if (list.includes('Pixel Bar') || list.includes('Matrix')) return 'pixel-bar-17ch'
  if (channels.some((channel) => channel.propertyType === 'color')) return 'led-wash'
  return 'par'
}

function uniqueAttribute(label: string, used: Set<string>): string {
  const base = label.trim().replace(/\s+/g, ' ') || 'Channel'
  let result = base
  let suffix = 2
  while (used.has(result.toLowerCase())) result = `${base} ${suffix++}`
  used.add(result.toLowerCase())
  return result
}

function matrixPixels(matrixValue: unknown): { key: string; x: number; y: number; z: number }[] {
  const matrix = record(matrixValue)
  if (Array.isArray(matrix.pixelKeys)) {
    const pixels: { key: string; x: number; y: number; z: number }[] = []
    matrix.pixelKeys.forEach((plane, z) => Array.isArray(plane) && plane.forEach((row, y) => Array.isArray(row) && row.forEach((key, x) => {
      if (typeof key === 'string') pixels.push({ key, x: x + 1, y: y + 1, z: z + 1 })
    })))
    return pixels
  }
  if (Array.isArray(matrix.pixelCount) && matrix.pixelCount.length === 3) {
    const [width, height, depth] = matrix.pixelCount.map(Number)
    const pixels: { key: string; x: number; y: number; z: number }[] = []
    for (let z = 1; z <= depth; z++) for (let y = 1; y <= height; y++) for (let x = 1; x <= width; x++) pixels.push({ key: `(${x}, ${y}, ${z})`, x, y, z })
    return pixels
  }
  return []
}

function repeatKeys(fixture: JsonRecord, repeatFor: unknown): string[] {
  if (Array.isArray(repeatFor)) return repeatFor.filter((key): key is string => typeof key === 'string')
  const matrix = record(fixture.matrix)
  if (repeatFor === 'eachPixelGroup') return Object.keys(record(matrix.pixelGroups))
  const pixels = matrixPixels(matrix)
  if (repeatFor === 'eachPixelABC') return pixels.map((pixel) => pixel.key).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (typeof repeatFor === 'string' && /^eachPixel[XYZ]{3}$/.test(repeatFor)) {
    const axes = repeatFor.slice(-3).toLowerCase().split('') as ('x' | 'y' | 'z')[]
    return [...pixels].sort((a, b) => [...axes].reverse().reduce((difference, axis) => difference || a[axis] - b[axis], 0)).map((pixel) => pixel.key)
  }
  return []
}

function expandModeChannels(fixture: JsonRecord, channels: unknown[], descriptors: Map<string, OflDescriptor>): (string | null)[] {
  const templates = record(fixture.templateChannels)
  const templateDescriptors = new Map<string, OflDescriptor>()
  for (const [key, value] of Object.entries(templates)) {
    const definition = record(value)
    templateDescriptors.set(key, { key, definition, byte: 0 })
    if (Array.isArray(definition.fineChannelAliases)) definition.fineChannelAliases.forEach((alias, index) => {
      if (typeof alias === 'string') templateDescriptors.set(alias, { key, definition, byte: index + 1 })
    })
  }
  const result: (string | null)[] = []
  for (const channel of channels) {
    if (channel === null || typeof channel === 'string') { result.push(channel); continue }
    const insert = record(channel)
    if (insert.insert !== 'matrixChannels' || !Array.isArray(insert.templateChannels)) throw new Error('Unsupported OFL mode channel block')
    const pixels = repeatKeys(fixture, insert.repeatFor)
    if (!pixels.length) throw new Error('OFL matrix channel insert has no resolvable pixels')
    const instantiated = (template: unknown, pixel: string): string | null => {
      if (template === null) return null
      if (typeof template !== 'string') throw new Error('Unsupported OFL template channel')
      const descriptor = templateDescriptors.get(template)
      const key = template.replaceAll('$pixelKey', pixel)
      if (descriptor) descriptors.set(key, { ...descriptor, key: descriptor.key.replaceAll('$pixelKey', pixel) })
      return key
    }
    if (insert.channelOrder === 'perChannel') {
      for (const template of insert.templateChannels) for (const pixel of pixels) result.push(instantiated(template, pixel))
    } else {
      for (const pixel of pixels) for (const template of insert.templateChannels) result.push(instantiated(template, pixel))
    }
  }
  return result
}

export function isOflFixture(value: unknown): boolean {
  const raw = record(value)
  return typeof raw.$schema === 'string' && raw.$schema.includes('open-fixture-library') && Array.isArray(raw.modes)
}

/**
 * Merge a freshly seeded OFL library with the cached one: the fresh
 * profiles win for every id they carry (that is the refresh that heals
 * stale cached defaults), and cached profiles the fresh seed does not
 * know — a hand-imported definition, for example — are kept, never
 * dropped. Used when the bundled library changes underneath a cache
 * seeded from an older bundle (Q3, 20 Nov 2026).
 *
 * A custom-tagged cached record is never replaced, even when the fresh
 * library carries the same id — the user's own fixture wins over the
 * base record (Jake, 20 Nov 2026: an OFL zip upload never updates a
 * custom fixture).
 */
export function mergeOflLibraries(fresh: FixtureProfile[], cached: FixtureProfile[]): FixtureProfile[] {
  const customIds = new Set(cached.filter((p) => p.custom).map((p) => p.id))
  const keptFresh = fresh.filter((p) => !customIds.has(p.id))
  const keptFreshIds = new Set(keptFresh.map((p) => p.id))
  return [...keptFresh, ...cached.filter((p) => !keptFreshIds.has(p.id))]
}

/**
 * Mint a profile as the user's own fixture (Jake, 20 Nov 2026 — all
 * duplicates and Build Your Own fixtures are GLOBAL: they live in the
 * library database, not in one show): a fresh `custom:` id, tagged
 * custom, and the OFL identity stripped — it is no longer an OFL
 * record, so a zip upload never updates it and the heal never matches
 * it as a base profile. The name is UNCHANGED: this is for saving an
 * edited base record (or an imported JSON) under the name the user
 * already gave it, not for duplicating.
 */
export function asNewCustom(profile: FixtureProfile): FixtureProfile {
  const copy = structuredClone(profile)
  copy.id = `custom:${slug(profile.name)}-${crypto.randomUUID().slice(0, 8)}`
  copy.custom = true
  delete copy.ofl
  return copy
}

/**
 * Duplicate an OFL record into the user's own fixture (Jake, 20 Nov
 * 2026): a fresh `custom:` id, the name with " copy", tagged custom,
 * and the OFL identity stripped — it is no longer an OFL record, so a
 * zip upload never updates it and the heal never matches it as a base
 * profile. The modes and channels are a deep copy, so editing the
 * duplicate never touches the original.
 */
export function duplicateProfileAsCustom(profile: FixtureProfile): FixtureProfile {
  const copy = asNewCustom(profile)
  copy.name = `${profile.name} copy`
  return copy
}

/**
 * Store a custom fixture in the global library (Jake, 20 Nov 2026):
 * insert it, or replace the custom record with the same id when the
 * user edits it. A record with the same id that is NOT custom is a
 * base library record — it is never overwritten; the caller must mint
 * a fresh id (asNewCustom) instead. The saved copy is forced custom
 * with its OFL identity stripped, whatever the caller passed in.
 * Returns `{ profiles, profile }` on success, `{ error }` on refusal.
 */
export function upsertCustomProfile(library: FixtureProfile[], profile: FixtureProfile): { profiles: FixtureProfile[]; profile: FixtureProfile } | { error: string } {
  const saved = structuredClone(profile)
  saved.custom = true
  delete saved.ofl
  const clash = library.find((p) => p.id === saved.id)
  if (clash && !clash.custom) return { error: `A library fixture already uses the id ${saved.id} — save it as a new custom fixture instead` }
  if (clash) return { profiles: library.map((p) => (p.id === saved.id ? saved : p)), profile: saved }
  return { profiles: [...library, saved], profile: saved }
}

/**
 * Remove a custom fixture from the global library. A base library
 * record is never deleted this way, and an unknown id is an error.
 */
export function deleteCustomProfile(library: FixtureProfile[], profileId: string): { profiles: FixtureProfile[] } | { error: string } {
  const existing = library.find((p) => p.id === profileId)
  if (!existing) return { error: 'Fixture not found in the library' }
  if (!existing.custom) return { error: 'Only a custom fixture can be deleted from the library' }
  return { profiles: library.filter((p) => p.id !== profileId) }
}

/**
 * Whether a library meta source means the cache is the user's own
 * library and must stand as-is: a zip they uploaded ('upload'), a
 * folder they imported ('import'), or a library holding fixtures they
 * created ('custom' — Jake, 20 Nov 2026, global customs). Anything
 * else ('bundled', 'none', or no meta) is shipped/stale data.
 */
export function preservesUserLibrary(source: string | undefined): boolean {
  return source === 'import' || source === 'upload' || source === 'custom'
}

/**
 * Whether a cached OFL library must be dropped now the bundled
 * fixtures/ folder no longer ships (Jake, 20 Nov 2026): a cache seeded
 * from the bundle — meta 'bundled' from before the unbundling, or a
 * cache from before the meta file existed — would keep serving stale
 * bundle defaults (blue 0) forever once the folder is gone. A library
 * the user uploaded themselves ('import' / 'upload') stands as-is: it
 * is their library, not shipped data. An empty cache needs no clearing.
 */
export function shouldClearBundledOflCache(meta: { source: string } | null, cached: FixtureProfile[] | null): boolean {
  if (!cached || !cached.length) return false
  if (!meta) return true
  return !preservesUserLibrary(meta.source)
}

export function importOflFixture(value: string | unknown, options: OflImportOptions = {}): FixtureProfile {
  const raw = typeof value === 'string' ? JSON.parse(value) : value
  if (!isOflFixture(raw)) throw new Error('This is not an Open Fixture Library fixture JSON file')
  const fixture = record(raw)
  const available = record(fixture.availableChannels)
  const templates = record(fixture.templateChannels)
  if (!Object.keys(available).length && !Object.keys(templates).length) throw new Error('The OFL fixture has no available or template channels')

  const descriptors = new Map<string, OflDescriptor>()
  for (const [key, definitionValue] of Object.entries(available)) {
    const definition = record(definitionValue)
    descriptors.set(key, { key, definition, byte: 0 })
    if (Array.isArray(definition.fineChannelAliases)) definition.fineChannelAliases.forEach((alias, index) => {
      if (typeof alias === 'string') descriptors.set(alias, { key, definition, byte: index + 1 })
    })
  }

  const modes = (fixture.modes as unknown[]).map((modeValue, modeIndex) => {
    const mode = record(modeValue)
    if (!Array.isArray(mode.channels) || !mode.channels.length) throw new Error('Every OFL mode must contain channels')
    const expandedChannels = expandModeChannels(fixture, mode.channels, descriptors)
    const used = new Set<string>()
    // Pan/tilt ranges from the profile (Guide p.60), captured while the
    // channels are built — a Pan/Tilt capability's angleStart/angleEnd.
    let panRange: number | undefined
    let tiltRange: number | undefined
    const channels: FixtureChannel[] = expandedChannels.map((channelKey, number) => {
      if (channelKey === null) return { number, attribute: uniqueAttribute(`Unused ${number + 1}`, used), propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0 }
      const descriptor = descriptors.get(String(channelKey))
      const definition = descriptor?.definition ?? {}
      const label = descriptor?.byte ? `${definition.name ?? descriptor.key} fine ${descriptor.byte}` : String(definition.name ?? descriptor?.key ?? channelKey)
      const type = propertyType(definition, descriptor?.key ?? String(channelKey))
      // Piece 2: the Design panel and the output model address properties
      // by their canonical lowercase names (intensity, red, green, blue,
      // pan, tilt…), while OFL channel names are display labels
      // ("Dimmer", "Red", "Pan"). Normalise a coarse channel's attribute
      // to the canonical name when it names a standard property, so an
      // OFL fixture gets the same wheel, faders and dimmer as a built-in
      // one. Fine channels keep their "X fine N" names — they are
      // distinct channels.
      const attribute = descriptor?.byte ? label : canonicalAttribute(label, type)
      if (!descriptor?.byte && attribute === 'pan' && panRange === undefined) panRange = capabilityAngleRange(definition)
      if (!descriptor?.byte && attribute === 'tilt' && tiltRange === undefined) tiltRange = capabilityAngleRange(definition)
      return {
        number,
        attribute: uniqueAttribute(attribute, used),
        propertyType: type,
        control: channelControl(definition),
        slots: channelSlots(definition),
        min: 0,
        max: 255,
        defaultValue: defaultChannelValue(definition, descriptor, type),
        // A channel with no highlight value in its definition falls
        // back to the built-in rule (fixtureProfiles.ts): intensity
        // and colour channels light at full, pan/tilt sit centred,
        // everything else off. The old fallback lit every channel at
        // 255, so a moving head highlighted with its pan hard over
        // instead of centred.
        highlightValue: dmxByte(definition.highlightValue, definition.dmxValueResolution, descriptor?.byte ?? 0, type === 'position' ? 128 : type === 'intensity' || type === 'color' ? 255 : 0)
      }
    })
    const name = typeof mode.name === 'string' ? mode.name : `Mode ${modeIndex + 1}`
    // Flexible LED strip/matrix (LightKey Guide p.29, FLEX): a mode whose
    // first channel block is a matrix insert (pixel-major order) has its
    // LED channels first and the remaining channels after them, so the
    // fixture can be patched with fewer LEDs and the footprint shrinks.
    // A per-channel insert or an insert that is not first has no such
    // layout, so the LED count stays fixed for those modes.
    const rawChannels = Array.isArray(mode.channels) ? mode.channels : []
    const inserts = rawChannels.map((channel, index) => ({ insert: record(channel), index })).filter(({ insert }) => insert.insert === 'matrixChannels' && Array.isArray(insert.templateChannels))
    const flexibleLeds = (() => {
      if (inserts.length !== 1 || inserts[0].index !== 0) return undefined
      const insert = inserts[0].insert
      if (insert.channelOrder === 'perChannel') return undefined
      const templateCount = (insert.templateChannels as unknown[]).length
      const pixels = repeatKeys(fixture, insert.repeatFor)
      if (templateCount < 1 || pixels.length < 2) return undefined
      if (expandedChannels.length - pixels.length * templateCount < 0) return undefined
      return { channelsPerLed: templateCount, maxLeds: pixels.length, defaultLeds: pixels.length, minLeds: 1 }
    })()
    // Beams (cells, Piece 7): a mode whose colour channels repeat across
    // pods — "Red 1…Red 4", "Quad LED 1 Red…Quad LED 5 Red" — is a
    // multi-cell fixture. The normalised attributes carry the pod in
    // their suffix ("red" = pod 1, "red 2" = pod 2), so grouping the
    // colour channels by that suffix gives one beam per pod, with the
    // beam's properties mapping the panel's colour names to the pod's
    // channel attributes. A single pod is just the fixture itself and
    // gets no beams. (Limitation: a mode with a global colour channel
    // AND per-pod colours cannot be told apart — the global channel
    // takes the pod-1 slot.)
    const beams = deriveBeams(channels)
    return { id: slug(typeof mode.shortName === 'string' ? mode.shortName : name), name, channels, ...(flexibleLeds ? { flexibleLeds } : {}), ...(beams ? { beams } : {}), ...(panRange !== undefined ? { panRange } : {}), ...(tiltRange !== undefined ? { tiltRange } : {}) }
  })

  const name = typeof fixture.name === 'string' && fixture.name.trim() ? fixture.name : 'OFL fixture'
  // The file names its own manufacturer and fixture — use them when the
  // caller does not supply keys. (Before this, a call without options
  // minted ofl:open-fixture-library:<fixture> for every definition, an
  // id no library profile ever carries, so a snapshot imported that way
  // could never be matched — and healed — later. Q3, 20 Nov 2026.)
  const fileManufacturerKey = typeof fixture.manufacturerKey === 'string' ? fixture.manufacturerKey : ''
  const manufacturerKey = options.manufacturerKey ?? fileManufacturerKey
  const manufacturer = options.manufacturer ?? manufacturerFromSource(options.sourceName) ?? (manufacturerKey ? displayKey(manufacturerKey) : 'Open Fixture Library')
  const fixtureKey = options.fixtureKey ?? (typeof fixture.fixtureKey === 'string' ? fixture.fixtureKey : slug(name))
  return {
    id: `ofl:${slug(manufacturerKey || manufacturer)}:${slug(fixtureKey)}`,
    name,
    manufacturer,
    legacyType: legacyType(fixture.categories, modes[0].channels),
    modes,
    ofl: { manufacturerKey: manufacturerKey || slug(manufacturer), fixtureKey, source: options.preserveSource === false ? undefined : structuredClone(raw) }
  }
}

function colorName(attribute: string): string | undefined {
  return ['Red', 'Green', 'Blue', 'White', 'Amber', 'UV', 'Cyan', 'Magenta', 'Yellow'].find((name) => attribute.toLowerCase().includes(name.toLowerCase()))
}

/**
 * Canonical attribute for an OFL channel label: the lowercase property
 * name the Design panel and the output model use (intensity, red, …),
 * when the channel is that property. Anything else keeps its label —
 * in particular a "Pan/Tilt Speed" channel is not the pan position, and
 * a colour-wheel preset is not a colour mixer.
 */
const BEAM_COLOURS = ['red', 'green', 'blue', 'white', 'amber', 'uv', 'cyan', 'magenta', 'yellow'] as const

/**
 * Derive a mode's beams (cells) from its normalised colour channels.
 * The first pod's colours are bare ("red") and later pods carry their
 * pod number ("red 2", or the built-in "red2" form) — grouping by that
 * number gives one beam per pod. Returns undefined for a single pod:
 * one addressable colour group is the fixture itself, not a cell.
 */
function deriveBeams(channels: FixtureChannel[]): FixtureProfile['modes'][number]['beams'] | undefined {
  const pods = new Map<number, Record<string, string>>()
  for (const channel of channels) {
    if (channel.propertyType !== 'color') continue
    const match = new RegExp(`^(${BEAM_COLOURS.join('|')})(?: ?(\\d+))?$`, 'i').exec(channel.attribute)
    if (!match) continue
    const pod = match[2] ? Number(match[2]) : 1
    const entry = pods.get(pod) ?? {}
    entry[match[1].toLowerCase()] = channel.attribute
    pods.set(pod, entry)
  }
  if (pods.size < 2) return undefined
  return [...pods.entries()].sort((a, b) => a[0] - b[0]).map(([pod, properties]) => ({ id: `cell-${pod}`, name: `Cell ${pod}`, properties }))
}

/** Angle in degrees from an OFL angle value ("540deg" or a number). */
function parseAngle(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') { const n = Number.parseFloat(value); return Number.isFinite(n) ? n : undefined }
  return undefined
}

/**
 * Total sweep of a Pan/Tilt capability ("angleStart": "0deg",
 * "angleEnd": "540deg") — the fixture profile's pan/tilt range (Guide
 * p.60: "Lightkey needs to know a moving light's pan and tilt ranges
 * to match its beam direction. This information is part of the fixture
 * profile"). A channel's capability may be a single object or an entry
 * in a capabilities array.
 */
function capabilityAngleRange(definition: JsonRecord): number | undefined {
  const capabilities: unknown[] = []
  if (Object.keys(record(definition.capability)).length) capabilities.push(definition.capability)
  if (Array.isArray(definition.capabilities)) capabilities.push(...definition.capabilities)
  for (const capability of capabilities) {
    const cap = record(capability)
    if (cap.type !== 'Pan' && cap.type !== 'Tilt') continue
    const start = parseAngle(cap.angleStart)
    const end = parseAngle(cap.angleEnd)
    if (start !== undefined && end !== undefined && end > start) return end - start
  }
  return undefined
}

function canonicalAttribute(label: string, type: FixtureChannel['propertyType']): string {
  if (type === 'intensity') return 'intensity'
  if (type === 'color') {
    const color = colorName(label)
    if (color) return color.toLowerCase()
  }
  if (type === 'position') {
    const match = /^(pan|tilt)(?=[\s]|$)/i.exec(label.trim())
    if (match) return match[1].toLowerCase()
  }
  return label
}

/**
 * A channel's default value: the OFL definition's own default wins when
 * it sets one. When it sets none, LightKey's default colour is blue
 * (Guide p.85) — a blue-component colour channel (Blue, Cyan, Magenta)
 * defaults to full (255) on its coarse byte, the other colour components
 * to 0 — and the dimmer defaults to 0 (dark), so a fixture added for the
 * first time is dark with blue underneath (Jake, 19 Nov 2026 — reversing
 * Piece 13, which had the dimmer at full). Fine bytes default to 0.
 */
function defaultChannelValue(definition: JsonRecord, descriptor: { key: string; byte: number } | undefined, type: FixtureChannel['propertyType']): number {
  const byte = descriptor?.byte ?? 0
  const value = dmxByte(definition.defaultValue, definition.dmxValueResolution, byte, 0)
  if (definition.defaultValue != null || byte !== 0) return value
  if (type === 'intensity') return 0
  const color = colorName(descriptor?.key ?? '')
  return color === 'Blue' || color === 'Cyan' || color === 'Magenta' ? 255 : value
}

function oflCapability(channel: FixtureChannel): JsonRecord {
  if (channel.propertyType === 'intensity') return { type: 'Intensity' }
  if (channel.propertyType === 'color') {
    const color = colorName(channel.attribute)
    return color ? { type: 'ColorIntensity', color } : { type: 'Generic', comment: channel.attribute }
  }
  if (/pan/i.test(channel.attribute)) return { type: 'Pan' }
  if (/tilt/i.test(channel.attribute)) return { type: 'Tilt' }
  if (/strobe|shutter/i.test(channel.attribute)) return { type: 'ShutterStrobe', shutterEffect: 'Strobe' }
  return { type: 'Generic', comment: channel.attribute }
}

export function exportOflFixture(profile: FixtureProfile): string {
  if (profile.ofl?.source && isOflFixture(profile.ofl.source)) return JSON.stringify(profile.ofl.source, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const availableChannels: Record<string, unknown> = {}
  const modes = profile.modes.map((mode, modeIndex) => {
    const keys = [...mode.channels].sort((a, b) => a.number - b.number).map((channel) => {
      const key = channel.attribute || `Channel ${channel.number + 1}`
      if (!availableChannels[key]) availableChannels[key] = { defaultValue: channel.defaultValue, highlightValue: channel.highlightValue, capability: oflCapability(channel) }
      return key
    })
    return { name: mode.name.replace(/\s+mode$/i, '') || 'Default', shortName: `${keys.length}ch${modeIndex ? `-${modeIndex + 1}` : ''}`, channels: keys }
  })
  const categories = profile.legacyType === 'moving-head' ? ['Moving Head'] : profile.legacyType === 'dimmer' ? ['Dimmer'] : profile.legacyType === 'pixel-bar-17ch' ? ['Pixel Bar'] : ['Color Changer']
  return JSON.stringify({ $schema: OFL_SCHEMA, name: profile.name, categories, meta: { authors: ['OpenLights'], createDate: date, lastModifyDate: date }, availableChannels, modes }, null, 2)
}

export function oflFilename(profile: FixtureProfile): string {
  return `${slug(profile.ofl?.manufacturerKey ?? profile.manufacturer)}@${slug(profile.ofl?.fixtureKey ?? profile.name)}.json`
}
