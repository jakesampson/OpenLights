import type { FixtureDef } from '@shared/types'
import { computeSceneChannels, fixtureAttributes } from './automationRuntime'
export function locateFixturePatch(fixtures: FixtureDef[], ids: string[], master = 255) {
  const fixtureValues: Record<string, Record<string, number>> = {}
  for (const fixture of fixtures.filter((f) => ids.includes(f.id))) fixtureValues[fixture.id] = Object.fromEntries(fixtureAttributes(fixture).map((attribute) => [attribute, /^(intensity|red\d*|green\d*|blue\d*|white|amber|uv)$/.test(attribute) ? 255 : attribute === 'pan' || attribute === 'tilt' ? 128 : 0]))
  return computeSceneChannels(fixtures, { id: 'locate', name: 'Locate', fadeMs: 0, fixtureValues }, master)
}
