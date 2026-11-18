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
  { id: 'par-rgb', name: 'Generic PAR (RGB)', type: 'par' as FixtureType },
  { id: 'wash-rgbaw', name: 'LED Wash (RGBAW+UV)', type: 'led-wash' as FixtureType },
  { id: 'head-8ch', name: 'Moving Head (8ch)', type: 'moving-head' as FixtureType },
  { id: 'dimmer-1ch', name: 'Single Dimmer', type: 'dimmer' as FixtureType },
  { id: 'led-simple', name: 'Generic LED (dim + RGB)', type: 'generic-led' as FixtureType },
  { id: 'pan-4x1x30-17ch', name: 'PAN 4x1x30 (17ch)', type: 'pixel-bar-17ch' as FixtureType },
  { id: 'simger-q12bt-rgba-4ch', name: 'Simger Q12BT (RGBA 4ch)', type: 'rgba-4ch' as FixtureType },
  { id: 'corepar-q120-rgbw-4ch', name: 'COREpar Q120 ILS (RGBW 4ch)', type: 'rgbw-4ch' as FixtureType },
].map((preset) => ({ id: preset.id, name: preset.name, manufacturer: 'Generic', legacyType: preset.type, modes: [{ id: 'default', name: 'Default mode', channels: Object.entries(LEGACY_CHANNELS[preset.type]).map(([attribute, number]) => ({ number, attribute, propertyType: attribute === 'intensity' ? 'intensity' as const : /^(red|green|blue|white|amber|uv)/.test(attribute) ? 'color' as const : attribute === 'pan' || attribute === 'tilt' ? 'position' as const : 'other' as const, min: 0, max: 255, defaultValue: attribute === 'pan' || attribute === 'tilt' ? 128 : 0, highlightValue: /^(intensity|red|green|blue|white|amber|uv)/.test(attribute) ? 255 : attribute === 'pan' || attribute === 'tilt' ? 128 : 0 })) }] }))

const pixel = BUILTIN_PROFILES.find((p) => p.legacyType === 'pixel-bar-17ch')!
pixel.modes[0].beams = Array.from({ length: 4 }, (_, index) => ({ id: `cell-${index + 1}`, name: `Cell ${index + 1}`, properties: Object.fromEntries(['red', 'green', 'blue'].map((attribute) => [attribute, `${attribute}${index === 0 ? '' : index + 1}`])) }))

export function fixtureProfile(fixture: FixtureDef): FixtureProfile | undefined { return fixture.profile ?? BUILTIN_PROFILES.find((p) => p.id === fixture.profileId) ?? BUILTIN_PROFILES.find((p) => p.legacyType === fixture.type) }
export function fixtureMode(fixture: FixtureDef) { const profile = fixtureProfile(fixture); return profile?.modes.find((m) => m.id === fixture.modeId) ?? profile?.modes[0] }
export function fixtureChannelMap(fixture: FixtureDef): Record<string, number> { return Object.fromEntries((fixtureMode(fixture)?.channels ?? []).filter((c) => c.number < fixture.channels).map((c) => [c.attribute, c.number])) }
