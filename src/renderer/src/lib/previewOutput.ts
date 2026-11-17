import { fixtureChannelMap } from '@shared/fixtureProfiles'
import type { FixtureDef } from '@shared/types'
import { FIXTURE_ATTRIBUTE_MAP } from './automationRuntime'

/** Preview artwork settings never change transmitted channel values. */
export function previewBeamAppearance(fixture: FixtureDef, position: { x: number; y: number }, liveColor: string) {
  const direction = fixture.previewBeam?.direction
  const color = fixture.previewBeam?.color
  return { direction: typeof direction === 'number' && Number.isFinite(direction) ? direction : position.y > 200 ? 180 : 0, color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : liveColor }
}

/** Decode the actual 1-based universe values for preview, retaining dimmer gel colour. */
export function previewFixtureValues(fixture: FixtureDef, channels: number[], sceneValues?: Record<string, number>): Record<string, number> {
  const values: Record<string, number> = fixture.type === 'dimmer' ? { ...sceneValues } : {}
  for (const [attribute, offset] of Object.entries(fixtureChannelMap(fixture))) {
    if (offset < fixture.channels) values[attribute] = channels[fixture.channelStart + offset - 1] ?? 0
  }
  return values
}
