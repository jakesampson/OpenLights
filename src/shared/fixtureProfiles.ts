import type { FixtureDef, FixtureProfile, FixtureType } from './types'

const LEGACY_CHANNELS: Record<string, Record<string, number>> = {
  par: { intensity: 0, red: 1, green: 2, blue: 3 },
  'led-wash': { intensity: 0, red: 1, green: 2, blue: 3, white: 4, amber: 5, uv: 6 },
  'moving-head': { intensity: 0, pan: 1, tilt: 2, red: 3, green: 4, blue: 5, gobo: 6, strobe: 7 },
  dimmer: { intensity: 0 },
  'generic-led': { intensity: 0, red: 1, green: 2, blue: 3 },
  'pixel-bar-17ch': {
    red: 0,
    green: 1,
    blue: 2,
    red2: 3,
    green2: 4,
    blue2: 5,
    red3: 6,
    green3: 7,
    blue3: 8,
    red4: 9,
    green4: 10,
    blue4: 11,
    intensity: 12,
    strobe: 13,
    function: 14,
    speed: 15,
    listType: 16
  },
  'rgba-4ch': { red: 0, green: 1, blue: 2, amber: 3 },
  'rgbw-4ch': { red: 0, green: 1, blue: 2, white: 3 }
}

export const BUILTIN_PROFILES: FixtureProfile[] = [
  // Channel defaults (LightKey Guide pp.85, 114 — Pieces 11, 13, reversed
  // 19 Nov 2026): pan/tilt sit centred (128); the colour default is blue
  // — the blue component full (blue, cyan, magenta at 255; red, green,
  // yellow, white, amber, UV at 0) — so a fixture with no colour defined
  // lights blue when its dimmer is open; but the dimmer itself now
  // defaults to 0 (dark), so a fixture added for the first time is dark
  // with blue underneath and raising the dimmer brings up blue. This
  // reverses Piece 13 (Jake's 19 Nov 2026 request that a dimmer start at
  // 100%) — Jake changed his mind the same day: dark by default, like
  // LightKey's fresh fixture. Everything else defaults to 0 (off).
  { id: 'par-rgb', name: 'Generic PAR (RGB)', type: 'par' as FixtureType },
  { id: 'wash-rgbaw', name: 'LED Wash (RGBAW+UV)', type: 'led-wash' as FixtureType },
  { id: 'head-8ch', name: 'Moving Head (8ch)', type: 'moving-head' as FixtureType },
  { id: 'dimmer-1ch', name: 'Single Dimmer', type: 'dimmer' as FixtureType },
  { id: 'led-simple', name: 'Generic LED (dim + RGB)', type: 'generic-led' as FixtureType },
  { id: 'pan-4x1x30-17ch', name: 'PAN 4x1x30 (17ch)', type: 'pixel-bar-17ch' as FixtureType },
  { id: 'simger-q12bt-rgba-4ch', name: 'Simger Q12BT (RGBA 4ch)', type: 'rgba-4ch' as FixtureType },
  { id: 'corepar-q120-rgbw-4ch', name: 'COREpar Q120 ILS (RGBW 4ch)', type: 'rgbw-4ch' as FixtureType },
].map((preset) => ({ id: preset.id, name: preset.name, manufacturer: 'Generic', legacyType: preset.type, modes: [{ id: 'default', name: 'Default mode', channels: Object.entries(LEGACY_CHANNELS[preset.type]).map(([attribute, number]) => ({ number, attribute, propertyType: attribute === 'intensity' ? 'intensity' as const : /^(red|green|blue|white|amber|uv)/.test(attribute) ? 'color' as const : attribute === 'pan' || attribute === 'tilt' ? 'position' as const : 'other' as const, min: 0, max: 255, defaultValue: attribute === 'pan' || attribute === 'tilt' ? 128 : /^(blue|cyan|magenta)\d*$/.test(attribute) ? 255 : 0, highlightValue: /^(intensity|red|green|blue|white|amber|uv)/.test(attribute) ? 255 : attribute === 'pan' || attribute === 'tilt' ? 128 : 0 })) }] }))

const pixel = BUILTIN_PROFILES.find((p) => p.legacyType === 'pixel-bar-17ch')!
pixel.modes[0].beams = Array.from({ length: 4 }, (_, index) => ({ id: `cell-${index + 1}`, name: `Cell ${index + 1}`, properties: Object.fromEntries(['red', 'green', 'blue'].map((attribute) => [attribute, `${attribute}${index === 0 ? '' : index + 1}`])) }))
// Flexible LED strip (LightKey Guide p.29, FLEX): the mode's first 12
// channels are the 4 cells' RGB (3 per LED) and the last 5 are globals
// (intensity, strobe, function, speed, list type). Choosing fewer LEDs
// shrinks the footprint; the globals slide down behind the LED block.
pixel.modes[0].flexibleLeds = { channelsPerLed: 3, maxLeds: 4, defaultLeds: 4, minLeds: 1 }

export function fixtureProfile(fixture: FixtureDef): FixtureProfile | undefined { return fixture.profile ?? BUILTIN_PROFILES.find((p) => p.id === fixture.profileId) ?? BUILTIN_PROFILES.find((p) => p.legacyType === fixture.type) }
export function fixtureMode(fixture: FixtureDef) { const profile = fixtureProfile(fixture); return profile?.modes.find((m) => m.id === fixture.modeId) ?? profile?.modes[0] }

/** Clamp an LED count to a flexible mode's range; non-flexible modes ignore it. */
function ledCountFor(mode: FixtureProfile['modes'][number], ledCount?: number): number {
  const flexible = mode.flexibleLeds
  if (!flexible) return 0
  return Math.max(flexible.minLeds ?? 1, Math.min(flexible.maxLeds, ledCount ?? flexible.defaultLeds))
}

/** DMX footprint of a mode: globals plus the chosen number of LED groups. */
export function modeFootprint(mode: FixtureProfile['modes'][number], ledCount?: number): number {
  const total = mode.channels.length ? Math.max(...mode.channels.map((c) => c.number)) + 1 : 0
  const flexible = mode.flexibleLeds
  if (!flexible) return total
  return ledCountFor(mode, ledCount) * flexible.channelsPerLed + Math.max(0, total - flexible.maxLeds * flexible.channelsPerLed)
}

/**
 * DMX offset of a mode channel inside a fixture, or null when the channel
 * does not exist at this LED count (an LED past the chosen count). LED
 * channels keep their number — the LED block starts at 0 — while the
 * globals slide down behind the chosen LED block.
 */
export function modeChannelOffset(mode: FixtureProfile['modes'][number], channelNumber: number, ledCount?: number): number | null {
  const flexible = mode.flexibleLeds
  if (!flexible) return channelNumber
  const ledSpan = flexible.maxLeds * flexible.channelsPerLed
  if (channelNumber < ledSpan) {
    const pixel = Math.floor(channelNumber / flexible.channelsPerLed)
    return pixel < ledCountFor(mode, ledCount) ? channelNumber : null
  }
  return ledCountFor(mode, ledCount) * flexible.channelsPerLed + (channelNumber - ledSpan)
}

/** A fixture's beams (cells), limited to its chosen LED count when flexible. */
export function fixtureBeams(fixture: FixtureDef): NonNullable<FixtureProfile['modes'][number]['beams']> {
  const mode = fixtureMode(fixture)
  const beams = mode?.beams ?? []
  const flexible = mode?.flexibleLeds
  if (!flexible) return beams
  return beams.slice(0, ledCountFor(mode, fixture.ledCount))
}

/** Colour attributes a whole-fixture colour write covers (LightKey
 *  Guide p.85: the base colour plus the separate White / Amber / UV /
 *  Lime LEDs). */
const COLOUR_ATTRIBUTES = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber', 'uv', 'lime'] as const

/**
 * Fan a bare colour patch out to every beam of a multipart fixture —
 * the linked-wheel rule (Jake, 19 Nov 2026) applied to any colour
 * write: a whole-fixture colour is the fixture's colour, so `red`
 * lands on every cell's red channel ("red 2" in OFL profiles, "red2"
 * in built-ins), and likewise White / Amber / UV / Lime and CMY.
 * Only keys the patch does not already carry are filled, so an
 * explicit per-beam value still wins, and a patch that already
 * names a beam's channel is left alone. A single-cell fixture, or a
 * patch with no colour keys, comes back unchanged.
 */
export function fanColourToBeams(fixture: FixtureDef, values: Record<string, number>): Record<string, number> {
  const beams = fixtureBeams(fixture)
  if (beams.length < 2) return { ...values }
  const result = { ...values }
  for (const beam of beams) {
    for (const name of COLOUR_ATTRIBUTES) {
      const channel = beam.properties[name]
      if (!channel || channel in result) continue
      const base = values[name]
      if (typeof base === 'number' && Number.isFinite(base)) result[channel] = Math.max(0, Math.min(255, Math.round(base)))
    }
  }
  return result
}

export function fixtureChannelMap(fixture: FixtureDef): Record<string, number> {
  const mode = fixtureMode(fixture)
  if (!mode) return {}
  const result: Record<string, number> = {}
  for (const channel of mode.channels) {
    const offset = modeChannelOffset(mode, channel.number, fixture.ledCount)
    if (offset === null || offset >= fixture.channels) continue
    result[channel.attribute] = offset
  }
  return result
}
