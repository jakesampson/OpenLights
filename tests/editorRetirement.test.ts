import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ShowDef } from '../src/shared/types'
import { migrateShow } from '../src/shared/migrations'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import { cuesToPresets } from '../src/shared/cueConversion'

function assertCuePresets(show: ShowDef) {
  show = { ...show, presets: [...(show.presets ?? []), ...cuesToPresets(show.cues, show.fixtures).filter((preset) => !show.presets?.some((item) => item.id === preset.id))] }
  for (const cue of show.cues) {
    const preset = show.presets?.find((item) => item.id === `preset-from-cue:${cue.id}`)
    expect(preset).toBeDefined()
    const presetCue = { id: preset!.id, name: preset!.name, fadeMs: 0, fixtureValues: preset!.fixtureValues }
    expect(computeCueChannels(show.fixtures, presetCue, 255)).toEqual(computeCueChannels(show.fixtures, cue, 255))
  }
  for (const list of show.cueLists ?? []) for (const step of list.steps) expect(show.cues.some((cue) => cue.id === step.cueId)).toBe(true)
}

describe('retiring the separate Cues & cues editor', () => {
  it('migrates the demo show without changing former cue/cue output', () => assertCuePresets(migrateShow(JSON.parse(readFileSync(join(process.cwd(), 'demo-projects', 'ShowBuddyActive-Demo.json'), 'utf8')))))
  it('migrates a version-0 show while preserving cues and cuelist steps', () => assertCuePresets(migrateShow({ id: 'old', name: 'Old', createdAt: 0, updatedAt: 0, fixtures: [], cues: [{ id: 's', name: 'Cue', fadeMs: 0, fixtureValues: {} }], cueLists: [{ id: 'l', name: 'List', steps: [{ id: 'c', cueId: 's', fadeMs: 0, holdMs: 0 }] }] })))
})
