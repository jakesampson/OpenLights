import { transformPosition } from './position'
import { BUILTIN_PROFILES, fixtureChannelMap, fixtureMode } from '@shared/fixtureProfiles'
import type { AutomationDef, FixtureDef, CueDef, ShowDef } from '@shared/types'

export const FIXTURE_ATTRIBUTE_MAP: Record<string, Record<string, number>> = Object.fromEntries(BUILTIN_PROFILES.map((profile) => [profile.legacyType, Object.fromEntries(profile.modes[0].channels.map((c) => [c.attribute, c.number]))]))

/** Attributes that respond to the master intensity fader. */
const DIMMER_ATTRIBUTES = new Set([
  'intensity',
  'red',
  'green',
  'blue',
  'white',
  'amber',
  'uv',
  'red2',
  'green2',
  'blue2',
  'red3',
  'green3',
  'blue3',
  'red4',
  'green4',
  'blue4'
])

/** List valid attributes for a fixture type, in channel order. */
export function fixtureAttributes(fixture: FixtureDef | FixtureDef['type']): string[] {
  const map = typeof fixture === 'string' ? FIXTURE_ATTRIBUTE_MAP[fixture] ?? {} : fixtureChannelMap(fixture)
  return Object.entries(map)
    .sort((a, b) => a[1] - b[1])
    .map(([attr]) => attr)
}

function scaleAttribute(attr: string, value: number, master: number): number {
  if (!DIMMER_ATTRIBUTES.has(attr)) return clamp(value)
  return clamp((clamp(value) * clamp(master)) / 255)
}
export { scaleAttribute }

/**
 * Map a cue's fixture values onto a 1-based DMX channel patch.
 * fixture.channelStart is already 1-based, so the first attribute of a
 * fixture starting at channel 1 lands on channel 1.
 *
 * With zeroMissing, every channel owned by the patch is included and set to
 * 0 when the cue doesn't specify it — this makes cue transitions fade the
 * whole rig instead of leaving stale channels lit.
 */
export function computeCueChannels(
  fixtures: FixtureDef[],
  cue: CueDef,
  master = 255,
  zeroMissing = false
): Record<number, number> {
  const channels: Record<number, number> = {}

  for (const fixture of fixtures) {
    const attrs = transformPosition(cue.fixtureValues[fixture.id] ?? {}, fixture.positionOptions)
    const map = fixtureChannelMap(fixture)
    if (fixture.disabled) { for (const offset of Object.values(map)) channels[fixture.channelStart + offset] = 0; continue }

    if (zeroMissing) {
      for (const attr of Object.keys(map)) {
        const channel = fixtureMode(fixture)?.channels.find((c) => c.attribute === attr)
        channels[fixture.channelStart + map[attr]] = scaleAttribute(attr, fixture.defaultValues?.[attr] ?? channel?.defaultValue ?? 0, master)
      }
    }

    for (const [attr, value] of Object.entries(attrs)) {
      const offset = map[attr]
      if (offset === undefined || typeof value !== 'number' || Number.isNaN(value)) continue
      channels[fixture.channelStart + offset] = scaleAttribute(attr, value, master)
    }
  }

  return channels
}

/**
 * Evaluate a single automation's value at time t (seconds).
 * Linear interpolation between points; clamped to 0-255.
 */
export function evaluateAutomation(auto: AutomationDef, t: number): number {
  const pts = auto.points
  if (!pts || pts.length === 0) return 0
  if (pts.length === 1) return clamp(pts[0].v)
  if (t <= pts[0].t) return clamp(pts[0].v)
  if (t >= pts[pts.length - 1].t) return clamp(pts[pts.length - 1].v)

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t
      if (span <= 0) return clamp(b.v)
      const ratio = (t - a.t) / span
      return clamp(Math.round(a.v + (b.v - a.v) * ratio))
    }
  }
  return 0
}

/**
 * Compute the DMX channel patch (1-based channel -> value) for all
 * automations at the given playback time.
 */
export function computeAutomationChannels(
  show: ShowDef,
  automations: AutomationDef[],
  t: number,
  master = 255
): Record<number, number> {
  const channels: Record<number, number> = {}

  for (const auto of automations) {
    const fixture = show.fixtures.find((f) => f.id === auto.fixtureId)
    if (!fixture) continue
    if (fixture.disabled) { for (let offset = 0; offset < fixture.channels; offset++) channels[fixture.channelStart + offset] = 0; continue }
    const map = fixtureChannelMap(fixture)
    const offset = map[auto.attribute]
    if (offset === undefined) continue

    const channel = fixture.channelStart + offset
    const value = scaleAttribute(auto.attribute, evaluateAutomation(auto, t), master)
    // last automation wins on a given channel
    channels[channel] = value
  }

  return channels
}

export function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
