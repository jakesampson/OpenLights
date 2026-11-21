import type { FixtureChannel, FixtureDef } from '@shared/types'

const COLOUR_COMPONENT_BASES = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber', 'uv', 'lime'] as const

function colourBase(attribute: string): string {
  return attribute.replace(/ ?\d+$/, '')
}

export interface EffectProperty {
  attribute: string
  label: string
}

/**
 * Effect targets for the selected fixtures (LightKey Guide ch.10, p.146):
 * Dimmer and Color are whole properties — patterns apply to them, not to
 * individual colour channels, which are Color's components (automated with
 * a curve on Color); Position is pan+tilt; anything else is its own
 * property (curve only). A colour fixture with no dimmer channel still
 * has a Dimmer — the virtual dimmer (Piece 12) — so it is offered
 * whenever every selected fixture supports a dimmer, physically or
 * virtually. Only properties every selected fixture supports are offered,
 * like availableProperties.
 */
export function effectableProperties(fixtures: FixtureDef[]): EffectProperty[] {
  if (fixtures.length === 0) return []
  const channels = availableProperties(fixtures)
  const attrs = new Set(channels.map((c) => c.attribute))
  const result: EffectProperty[] = []
  const dimmerSupported = fixtures.every((f) => {
    const modeAttrs = (fixtureMode(f)?.channels ?? []).map((c) => c.attribute)
    return (
      modeAttrs.includes('intensity') ||
      (!modeAttrs.includes('intensity') && modeAttrs.some((a) => (COLOUR_COMPONENT_BASES as readonly string[]).includes(colourBase(a))))
    )
  })
  if (dimmerSupported) result.push({ attribute: 'intensity', label: 'Dimmer' })
  const hasColour =
    ['red', 'green', 'blue'].every((a) => attrs.has(a)) || ['cyan', 'magenta', 'yellow'].every((a) => attrs.has(a))
  if (hasColour) result.push({ attribute: 'color', label: 'Color' })
  if (attrs.has('pan') && attrs.has('tilt')) result.push({ attribute: 'position', label: 'Position' })
  const componentBases = new Set<string>([...COLOUR_COMPONENT_BASES, 'intensity', 'pan', 'tilt'])
  for (const channel of channels) {
    if (componentBases.has(colourBase(channel.attribute))) continue
    result.push({
      attribute: channel.attribute,
      label: channel.attribute.charAt(0).toUpperCase() + channel.attribute.slice(1)
    })
  }
  return result
}
import { fixtureMode } from '@shared/fixtureProfiles'
export function availableProperties(fixtures: FixtureDef[]): FixtureChannel[] {
  if (!fixtures.length) return []
  const channels = fixtures.map((fixture) => (fixtureMode(fixture)?.channels ?? []).filter((c) => c.number < fixture.channels))
  const result = channels[0].filter((c) => !fixtures.some((f) => f.hiddenProperties?.includes(c.attribute)) && channels.every((list) => list.some((other) => other.attribute === c.attribute && other.propertyType === c.propertyType))).map((c) => {
    const matches = channels.map((list) => list.find((other) => other.attribute === c.attribute)!)
    return { ...c, min: Math.max(...matches.map((other) => other.min)), max: Math.min(...matches.map((other) => other.max)) }
  }).filter((c) => c.min <= c.max)
  const order = fixtures[0].propertyOrder ?? []
  return result.sort((a, b) => { const ai = order.indexOf(a.attribute), bi = order.indexOf(b.attribute); return (ai < 0 ? 1000 + a.number : ai) - (bi < 0 ? 1000 + b.number : bi) })
}
