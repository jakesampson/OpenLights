import { describe, expect, it, vi } from 'vitest'
import {
  WIZARD_STEPS,
  nextWizardStep,
  previousWizardStep,
  wizardStepTitle,
  type WizardStep
} from '../src/renderer/src/lib/setupWizard'
import { nextGroupName } from '../src/renderer/src/lib/fixtureGroups'
import { homeFixtureValues } from '../src/renderer/src/lib/calibration'
import { computeCueChannels } from '../src/renderer/src/lib/automationRuntime'
import {
  deleteUserTemplate,
  demoShowTemplate,
  listUserTemplates,
  newShowFromTemplate,
  saveUserTemplate,
  type ShowTemplate
} from '../src/renderer/src/lib/templates'
import { useShowStore, defaultShow, collectInlineCues, activeCueId } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { FixtureDef, ShowDef } from '../src/shared/types'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

// Built-in moving head: intensity 0, pan 1, tilt 2 (offsets); no profile
// range, so the 540°/270° defaults apply.
function head(id = 'mh1', channelStart = 1): FixtureDef {
  return { id, name: 'MH1', type: 'moving-head', channelStart, channels: 8 }
}
// Static light: no pan/tilt channels.
function par(id = 'par1', channelStart = 9, patch?: Partial<FixtureDef>): FixtureDef {
  return { id, name: 'PAR1', type: 'par', channelStart, channels: 4, ...patch }
}

describe('wizard step machine (Piece 5)', () => {
  it('walks DMX Output → Patching → Preview → Groups → Directions → That\'s It', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual(['dmx', 'patch', 'preview', 'groups', 'directions', 'done'])
    expect(WIZARD_STEPS.map((s) => s.title)).toEqual(['DMX Output', 'Fixture Patching', 'Build Your Preview', 'Fixture Groups', 'Light Beam Directions', "That's It"])
    let step: WizardStep = 'dmx'
    const forward: WizardStep[] = [step]
    while (nextWizardStep(step)) { step = nextWizardStep(step)!; forward.push(step) }
    expect(forward).toEqual(['dmx', 'patch', 'preview', 'groups', 'directions', 'done'])
    expect(nextWizardStep('done')).toBeNull()
    const backward: WizardStep[] = [step]
    while (previousWizardStep(step)) { step = previousWizardStep(step)!; backward.push(step) }
    expect(backward).toEqual(['done', 'directions', 'groups', 'preview', 'patch', 'dmx'])
    expect(previousWizardStep('dmx')).toBeNull()
    expect(wizardStepTitle('groups')).toBe('Fixture Groups')
  })
})

describe('group auto-naming (Piece 5)', () => {
  it('names the next free Group N', () => {
    expect(nextGroupName([])).toBe('Group 1')
    expect(nextGroupName(['Front', 'Back'])).toBe('Group 1')
    expect(nextGroupName(['Group 1'])).toBe('Group 2')
    expect(nextGroupName(['Group 1', 'Group 2', 'Group 4'])).toBe('Group 3')
  })
})

describe('home cue values (Piece 5)', () => {
  it('gives a moving head dimmer full with pan/tilt at home, a static light dimmer only', () => {
    expect(homeFixtureValues(head())).toEqual({ intensity: 255, pan: 128, tilt: 212 })
    expect(homeFixtureValues(par())).toEqual({ intensity: 255 })
  })
})

describe('Ignore Master Dimmer (Piece 5)', () => {
  it('bypasses the master fader for the flagged fixture only', () => {
    const cue = { id: 'c', name: 'C', fadeMs: 0, fixtureValues: { p1: { intensity: 200 }, p2: { intensity: 200 } } }
    const channels = computeCueChannels([par('p1', 1, { ignoreMasterDimmer: true }), par('p2', 5)], cue, 128)
    expect(channels[1]).toBe(200)
    expect(channels[5]).toBe(100)
  })
})

describe('wizard store actions (Piece 5)', () => {
  it('groups the selection under the next free name', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [par('p1', 1), par('p2', 5), par('p3', 9)], cues: [] } as unknown as ShowDef))
    state().selectFixtures(['p1', 'p2'])
    state().groupSelection()
    expect(state().show!.fixtures.find((f) => f.id === 'p1')!.group).toBe('Group 1')
    expect(state().show!.fixtures.find((f) => f.id === 'p2')!.group).toBe('Group 1')
    expect(state().show!.fixtures.find((f) => f.id === 'p3')!.group).toBeUndefined()
    state().selectFixtures(['p3'])
    state().groupSelection()
    expect(state().show!.fixtures.find((f) => f.id === 'p3')!.group).toBe('Group 2')
  })

  it('Create Groups for Me puts everything in one group', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [par('p1', 1), par('p2', 5), head('mh1', 9)], cues: [] } as unknown as ShowDef))
    state().createGroupsForMe()
    const groups = state().show!.fixtureGroups ?? []
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('All Fixtures')
    expect([...groups[0].fixtureIds].sort()).toEqual(['mh1', 'p1', 'p2'])
    expect(state().show!.fixtures.every((f) => f.group === 'All Fixtures')).toBe(true)
  })

  it('Go! creates a "Full" preset and starts it active — no Home cue', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [par('p1', 1), head('mh1', 5)], cues: [] } as unknown as ShowDef))
    state().startSetupWizard()
    expect(state().setupWizardStep).toBe('dmx')
    state().setSetupWizardStep('done')
    state().finishSetupWizard()
    expect(state().setupWizardStep).toBeNull()
    // New projects start with zero cues (Jake, 26 Nov 2026). Instead of
    // the old Home cue, the wizard creates a first preset holding the
    // Home cue's values, and starts it active in the palette.
    expect(collectInlineCues(state().show, state().cueLists)).toHaveLength(0)
    expect(activeCueId(state())).toBeNull()
    expect(state().presets).toHaveLength(1)
    const full = state().presets[0]
    expect(full.name).toBe('Full')
    expect(full.category).toBe('intensity')
    expect(full.fixtureValues.p1).toEqual({ intensity: 255 })
    expect(full.fixtureValues.mh1).toEqual({ intensity: 255, pan: 128, tilt: 212 })
    expect(state().activePresetIds).toEqual([full.id])
    // A second Go! does not stack another "Full" preset.
    state().startSetupWizard()
    state().setSetupWizardStep('done')
    state().finishSetupWizard()
    expect(state().presets).toHaveLength(1)
    expect(collectInlineCues(state().show, state().cueLists)).toHaveLength(0)
  })

  it('exiting the wizard leaves the show untouched', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [par('p1', 1)], cues: [] } as unknown as ShowDef))
    state().startSetupWizard()
    state().exitSetupWizard()
    expect(state().setupWizardStep).toBeNull()
    expect(state().show!.fixtures).toHaveLength(1)
    expect(collectInlineCues(state().show, state().cueLists)).toHaveLength(0)
  })
})

describe('templates (Piece 5 groundwork)', () => {
  function stubStorage() {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) },
      clear: () => data.clear()
    })
    return data
  }

  it('saves and lists user templates, newest first', () => {
    stubStorage()
    const show = migrateShow({ fixtures: [par('p1', 1)], cues: [] } as unknown as ShowDef)
    const a: ShowTemplate = { id: 't1', name: 'My Rig', createdAt: 100, show }
    const b: ShowTemplate = { id: 't2', name: 'Rig 2', createdAt: 200, show }
    saveUserTemplate(a)
    saveUserTemplate(b)
    expect(listUserTemplates().map((t) => t.id)).toEqual(['t2', 't1'])
    deleteUserTemplate('t2')
    expect(listUserTemplates().map((t) => t.id)).toEqual(['t1'])
  })

  it('tolerates corrupt stored templates', () => {
    const data = stubStorage()
    data.set('openlights.templates', 'not json')
    expect(listUserTemplates()).toEqual([])
    data.set('openlights.templates', JSON.stringify([{ id: 'x' }]))
    expect(listUserTemplates()).toEqual([])
  })

  it('starting from a template copies the show with a fresh id and name', () => {
    stubStorage()
    const template = demoShowTemplate(defaultShow)
    const started = newShowFromTemplate(template, 'Gig Rig')
    expect(started.name).toBe('Gig Rig')
    expect(started.id).not.toBe(defaultShow.id)
    expect(started.fixtures).toEqual(defaultShow.fixtures)
    // Editing the copy never mutates the template.
    started.fixtures[0].name = 'Changed'
    expect(defaultShow.fixtures[0].name).not.toBe('Changed')
  })

  it('round-trips a whole rig show as a template (Piece 6)', () => {
    stubStorage()
    const rig = migrateShow({
      name: 'My Rig',
      fixtures: [
        { ...head('mh1', 1), previewPosition: { x: 120, y: 80 }, group: 'Movers', calibration: { homeDirection: 90, rotationReversed: false, panMin: -90, panMax: 90, tiltMin: -45, tiltMax: 45, perspective: 'down' as const } },
        { ...par('p1', 9), previewPosition: { x: 300, y: 200 }, group: 'Wash' }
      ],
      previewTrusses: [{ id: 't1', name: 'Truss', shape: 'straight' as const, x: 100, y: 60, width: 400, height: 100, rotation: 0 }],
      cues: [{ id: 'c1', name: 'Home', presetIds: [], sequenceIds: [], fixtureValues: { mh1: { intensity: 255 } }, fadeMs: 1000 }],
      livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Home', type: 'push', cueId: 'c1', presetIds: [] }] }]
    } as unknown as ShowDef)
    const template: ShowTemplate = { id: 'rig', name: 'My Rig', createdAt: 100, show: rig }
    saveUserTemplate(template)
    const [listed] = listUserTemplates()
    expect(listed.name).toBe('My Rig')
    expect(listed.show.fixtures).toHaveLength(2)
    expect(listed.show.fixtures[0].calibration?.homeDirection).toBe(90)
    expect(listed.show.previewTrusses).toHaveLength(1)
    // Starting a project from it reproduces the rig exactly, under a new
    // id — but NOT its cues (Jake, 26 Nov 2026: new projects start
    // cue-free; a template is a starting point for the rig, not the cue
    // list). The template itself still holds its cue for the next copy.
    const started = newShowFromTemplate(listed, 'Friday Gig')
    expect(started.id).not.toBe(rig.id)
    expect(started.name).toBe('Friday Gig')
    expect(started.fixtures).toEqual(rig.fixtures)
    expect(started.previewTrusses).toEqual(rig.previewTrusses)
    expect(started.fixtureGroups?.map((g) => g.name).sort()).toEqual(['Movers', 'Wash'])
    expect(collectInlineCues(started, started.cueLists ?? [])).toHaveLength(0)
    expect(collectInlineCues(listed.show, listed.show.cueLists ?? [])).toHaveLength(1)
    // The template itself is untouched by the copy.
    expect(template.show.fixtures[0].name).toBe('MH1')
  })
})
