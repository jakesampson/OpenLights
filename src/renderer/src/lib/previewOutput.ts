import type { FixtureDef } from '@shared/types'
import { FIXTURE_ATTRIBUTE_MAP } from './automationRuntime'

/** Decode the actual 1-based universe values for preview, retaining dimmer gel colour. */
export function previewFixtureValues(fixture: FixtureDef, channels: number[], sceneValues?: Record<string, number>): Record<string, number> {
  const values: Record<string, number> = fixture.type === 'dimmer' ? { ...sceneValues } : {}
  for (const [attribute, offset] of Object.entries(FIXTURE_ATTRIBUTE_MAP[fixture.type] ?? {})) {
    if (offset < fixture.channels) values[attribute] = channels[fixture.channelStart + offset - 1] ?? 0
  }
  return values
}
