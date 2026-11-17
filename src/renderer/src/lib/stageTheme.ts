import type { FixtureDef, SceneDef } from '@shared/types'

export type StageTheme = 'purple' | 'teal'

export function getStageTheme(
  scene: SceneDef | null | undefined,
  fixtures: FixtureDef[]
): StageTheme {
  if (!scene) return 'purple'

  let red = 0
  let green = 0
  let hasOutput = false
  for (const fixture of fixtures) {
    const values = scene.fixtureValues[fixture.id]
    if (!values) continue
    const intensity = (values.intensity ?? 0) / 255
    red += (values.red ?? 0) * intensity
    green += (values.green ?? 0) * intensity
    hasOutput ||= intensity > 0
  }

  if (!hasOutput) return 'purple'
  return green > red ? 'teal' : 'purple'
}
