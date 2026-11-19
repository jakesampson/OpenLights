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
    const channels: FixtureChannel[] = expandedChannels.map((channelKey, number) => {
      if (channelKey === null) return { number, attribute: uniqueAttribute(`Unused ${number + 1}`, used), propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0 }
      const descriptor = descriptors.get(String(channelKey))
      const definition = descriptor?.definition ?? {}
      const label = descriptor?.byte ? `${definition.name ?? descriptor.key} fine ${descriptor.byte}` : String(definition.name ?? descriptor?.key ?? channelKey)
      return {
        number,
        attribute: uniqueAttribute(label, used),
        propertyType: propertyType(definition, descriptor?.key ?? String(channelKey)),
        control: channelControl(definition),
        slots: channelSlots(definition),
        min: 0,
        max: 255,
        defaultValue: dmxByte(definition.defaultValue, definition.dmxValueResolution, descriptor?.byte ?? 0, 0),
        highlightValue: dmxByte(definition.highlightValue, definition.dmxValueResolution, descriptor?.byte ?? 0, 255)
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
    return { id: slug(typeof mode.shortName === 'string' ? mode.shortName : name), name, channels, ...(flexibleLeds ? { flexibleLeds } : {}) }
  })

  const name = typeof fixture.name === 'string' && fixture.name.trim() ? fixture.name : 'OFL fixture'
  const manufacturerKey = options.manufacturerKey ?? ''
  const manufacturer = options.manufacturer ?? manufacturerFromSource(options.sourceName) ?? (manufacturerKey ? displayKey(manufacturerKey) : 'Open Fixture Library')
  const fixtureKey = options.fixtureKey ?? slug(name)
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
