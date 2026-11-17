import type { AutomationDef, FixtureDef, SceneDef, ShowDef } from '@shared/types'

export const FIXTURE_ATTRIBUTE_MAP: Record<string, Record<string, number>> = {
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
export function fixtureAttributes(type: FixtureDef['type']): string[] {
  const map = FIXTURE_ATTRIBUTE_MAP[type] ?? {}
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
 * Map a scene's fixture values onto a 1-based DMX channel patch.
 * fixture.channelStart is already 1-based, so the first attribute of a
 * fixture starting at channel 1 lands on channel 1.
 *
 * With zeroMissing, every channel owned by the patch is included and set to
 * 0 when the scene doesn't specify it — this makes scene transitions fade the
 * whole rig instead of leaving stale channels lit.
 */
export function computeSceneChannels(
  fixtures: FixtureDef[],
  scene: SceneDef,
  master = 255,
  zeroMissing = false
): Record<number, number> {
  const channels: Record<number, number> = {}

  for (const fixture of fixtures) {
    const attrs = scene.fixtureValues[fixture.id] ?? {}
    const map = FIXTURE_ATTRIBUTE_MAP[fixture.type] ?? {}

    if (zeroMissing) {
      for (const attr of Object.keys(map)) {
        channels[fixture.channelStart + map[attr]] = 0
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
    const map = FIXTURE_ATTRIBUTE_MAP[fixture.type] ?? {}
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
