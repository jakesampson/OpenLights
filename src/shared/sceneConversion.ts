import { fixtureMode } from './fixtureProfiles'
import type { FixtureDef, PresetCategory, PresetDef, SceneDef } from './types'

/** Infer the palette category of a single attribute from the patch profiles. */
export function attributeCategory(attribute: string, fixtures: FixtureDef[]): PresetCategory {
  for (const fixture of fixtures) {
    const channel = fixtureMode(fixture)?.channels.find((c) => c.attribute === attribute)
    if (channel) return channel.propertyType as PresetCategory
  }
  // Fallbacks for attributes that no bundled profile declares.
  if (/^(intensity|dimmer)$/i.test(attribute)) return 'intensity'
  if (/^(red|green|blue|white|amber|uv|cmy|hue|sat|colortemp)/i.test(attribute)) return 'color'
  if (/^(pan|tilt)/i.test(attribute)) return 'position'
  return 'other'
}

/** Category of a scene, chosen by the most common attribute property type. */
export function inferSceneCategory(scene: SceneDef, fixtures: FixtureDef[]): PresetCategory {
  const counts: Record<PresetCategory, number> = { intensity: 0, color: 0, position: 0, other: 0 }
  for (const values of Object.values(scene.fixtureValues ?? {})) {
    for (const attribute of Object.keys(values)) counts[attributeCategory(attribute, fixtures)]++
  }
  // Stable tie-break: intensity, color, position, other.
  const order: PresetCategory[] = ['intensity', 'color', 'position', 'other']
  return order.reduce((best, category) => counts[category] > counts[best] ? category : best, 'intensity' as PresetCategory)
}

export interface SceneConversionOptions {
  /** Override the generated preset id. Defaults to a stable id derived from the scene. */
  makeId?: (scene: SceneDef) => string
}

/**
 * Convert one scene into a preset with identical fixture values (and therefore
 * identical DMX output). Originals are left untouched by the caller so this
 * stays one-way and non-destructive until the Scenes editor retires (8.9).
 */
export function sceneToPreset(scene: SceneDef, fixtures: FixtureDef[], options: SceneConversionOptions = {}): PresetDef {
  return {
    id: options.makeId?.(scene) ?? `preset-from-scene:${scene.id}`,
    name: scene.name,
    category: inferSceneCategory(scene, fixtures),
    fixtureValues: structuredClone(scene.fixtureValues ?? {}),
    ...(scene.fans?.length ? { fans: structuredClone(scene.fans) } : {})
  }
}

/** Convert every scene into an equivalent preset. */
export function scenesToPresets(
  scenes: SceneDef[],
  fixtures: FixtureDef[],
  options: SceneConversionOptions = {}
): PresetDef[] {
  return scenes.map((scene) => sceneToPreset(scene, fixtures, options))
}
