// New projects start cue-free (Jake, 26 Nov 2026 — "delete all cues by
// default"): a template is a starting point for fixtures, patch and Preview
// layout, not cues. A template saved from a cue-heavy show used to clone
// every cue into the new project — that is how a new project could load
// with hundreds of cues (PRBC Default's ~200 orphans, saved as a template
// via SaveTemplateDialog, which stores the whole show).
import { describe, expect, it } from 'vitest'
import { newShowFromTemplate, type ShowTemplate } from '../src/renderer/src/lib/templates'
import type { ShowDef } from '../src/shared/types'

function templateShow(): ShowDef {
  return {
    id: 'old-id',
    name: 'PRBC Default',
    createdAt: 1000,
    updatedAt: 2000,
    fixtures: [{ id: 'f1', name: 'F1', type: 'par', channelStart: 1, channels: 4 }],
    cues: [
      { id: 'cue-1', name: 'Cue 1', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 1000 },
      { id: 'cue-2', name: 'Cue 2', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 1000 },
    ],
    presets: [{ id: 'p1', name: 'Full On', category: 'intensity', fixtureValues: { f1: { intensity: 255 } } }],
    automations: [],
    cueLists: [
      { id: 'list-1', name: 'Sunday Set', steps: [{ id: 's1', cueId: 'cue-1', fadeMs: 1000, holdMs: 0 }], loop: false },
    ],
    livePages: [
      {
        id: 'page-1',
        name: 'Page 1',
        controls: [
          { id: 'btn-1', name: 'Cue Button', type: 'push', x: 10, y: 10, cueId: 'cue-1', presetIds: [] },
          { id: 'btn-2', name: 'Preset Button', type: 'push', x: 150, y: 10, presetIds: ['p1'] },
        ],
        cueListWidgets: [{ id: 'w1', cueListId: 'list-1', x: 10, y: 120 }],
      },
    ],
    startup: { mode: 'restore', presetIds: ['p1'], liveValues: {}, pageId: 'page-1', cueId: 'cue-1' },
    midiMappings: [
      { id: 'm1', targetType: 'cue', targetId: 'cue-1', midiType: 'noteon' },
      { id: 'm2', targetType: 'preset', targetId: 'p1', midiType: 'noteon' },
    ],
  } as unknown as ShowDef
}

describe('newShowFromTemplate', () => {
  it('starts the new project with zero cues', () => {
    const template: ShowTemplate = { id: 't1', name: 'PRBC Default', createdAt: 3000, show: templateShow() }
    const show = newShowFromTemplate(template, 'Show 2')
    expect(show.cues).toEqual([])
    expect(show.name).toBe('Show 2')
    expect(show.id).not.toBe('old-id')
  })

  it('drops cue lists, cuelist widgets, cue bindings and cue MIDI mappings', () => {
    const template: ShowTemplate = { id: 't1', name: 'PRBC Default', createdAt: 3000, show: templateShow() }
    const show = newShowFromTemplate(template, 'Show 2')
    expect(show.cueLists).toEqual([])
    expect(show.livePages![0].cueListWidgets).toEqual([])
    // The cue-bound button loses its cue; the preset button is untouched.
    expect(show.livePages![0].controls[0].cueId).toBeUndefined()
    expect(show.livePages![0].controls[1].presetIds).toEqual(['p1'])
    // The startup cue is cleared; the restored preset list survives.
    expect(show.startup!.cueId).toBeUndefined()
    expect(show.startup!.presetIds).toEqual(['p1'])
    expect(show.midiMappings!.map((m) => m.id)).toEqual(['m2'])
  })

  it('keeps fixtures and presets, and never mutates the template', () => {
    const source = templateShow()
    const template: ShowTemplate = { id: 't1', name: 'PRBC Default', createdAt: 3000, show: source }
    const show = newShowFromTemplate(template, 'Show 2')
    expect(show.fixtures).toHaveLength(1)
    expect(show.presets).toHaveLength(1)
    expect(show.presets![0].name).toBe('Full On')
    // The template's own cues are still there for the next project.
    expect(source.cues).toHaveLength(2)
    expect(source.cueLists).toHaveLength(1)
    expect(source.livePages![0].controls[0].cueId).toBe('cue-1')
  })
})
