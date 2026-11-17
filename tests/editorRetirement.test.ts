import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ShowDef } from '../src/shared/types'
import { migrateShow } from '../src/shared/migrations'
import { computeSceneChannels } from '../src/renderer/src/lib/automationRuntime'
import { scenesToPresets } from '../src/shared/sceneConversion'

function assertScenePresets(show: ShowDef) {
  show = { ...show, presets: [...(show.presets ?? []), ...scenesToPresets(show.scenes, show.fixtures).filter((preset) => !show.presets?.some((item) => item.id === preset.id))] }
  for (const scene of show.scenes) {
    const preset = show.presets?.find((item) => item.id === `preset-from-scene:${scene.id}`)
    expect(preset).toBeDefined()
    const presetScene = { id: preset!.id, name: preset!.name, fadeMs: 0, fixtureValues: preset!.fixtureValues }
    expect(computeSceneChannels(show.fixtures, presetScene, 255)).toEqual(computeSceneChannels(show.fixtures, scene, 255))
  }
  for (const list of show.cueLists ?? []) for (const step of list.steps) expect(show.scenes.some((scene) => scene.id === step.sceneId)).toBe(true)
}

describe('retiring the separate Scenes & cues editor', () => {
  it('migrates the demo show without changing former scene/cue output', () => assertScenePresets(migrateShow(JSON.parse(readFileSync(join(process.cwd(), 'demo-projects', 'ShowBuddyActive-Demo.json'), 'utf8')))))
  it('migrates a version-0 show while preserving scenes and cuelist steps', () => assertScenePresets(migrateShow({ id: 'old', name: 'Old', createdAt: 0, updatedAt: 0, fixtures: [], scenes: [{ id: 's', name: 'Scene', fadeMs: 0, fixtureValues: {} }], cueLists: [{ id: 'l', name: 'List', steps: [{ id: 'c', sceneId: 's', fadeMs: 0, holdMs: 0 }] }] })))
})
