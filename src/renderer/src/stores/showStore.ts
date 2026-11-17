import { create } from 'zustand'
import type {
  AutomationDef,
  CueListDef,
  CueStepDef,
  EffectDef,
  FixtureDef,
  FixturePreset,
  MidiMapping,
  SceneDef,
  ShowDef
} from '@shared/types'
import { computeSceneChannels, fixtureAttributes } from '../lib/automationRuntime'
import { allZeroPatch, getCurrentPatch, sendChannels, sendImmediate, setEffectBlackout } from '../lib/output'

interface ShowState {
  show: ShowDef | null
  scenes: SceneDef[]
  automations: AutomationDef[]
  effects: EffectDef[]
  cueLists: CueListDef[]
  midiMappings: MidiMapping[]
  master: number
  blackout: boolean
  bpm: number
  isPlaying: boolean
  activeSceneId: string | null
  selectedFixtureIds: string[]
  activeCueListId: string | null
  activeCueIndex: number
  cuePlaying: boolean

  setShow: (show: ShowDef | null) => void
  setBpm: (bpm: number) => void
  setAudioPath: (path: string | null) => void
  setIsPlaying: (playing: boolean) => void

  setMaster: (value: number) => void
  setBlackout: (active: boolean) => void
  toggleBlackout: () => void

  selectFixture: (id: string, additive?: boolean) => void
  updateSelectedFixtures: (values: Record<string, number>) => void
  goToScene: (id: string) => void
  flashScene: (id: string) => void
  endFlash: () => void
  addScene: () => void
  duplicateScene: (id: string) => void
  updateScene: (id: string, patch: Partial<SceneDef>) => void
  deleteScene: (id: string) => void

  addFixture: (preset: FixturePreset, name?: string, group?: string) => void
  updateFixture: (id: string, patch: Partial<FixtureDef>) => void
  removeFixture: (id: string) => void

  addAutomation: (automation: AutomationDef) => void
  updateAutomation: (id: string, patch: Partial<AutomationDef>) => void
  removeAutomation: (id: string) => void

  addEffect: (effect: EffectDef) => void
  updateEffect: (id: string, patch: Partial<EffectDef>) => void
  removeEffect: (id: string) => void

  addCueList: (name?: string) => void
  updateCueList: (id: string, patch: Partial<CueListDef>) => void
  renameCueList: (id: string, name: string) => void
  removeCueList: (id: string) => void
  addCueStep: (listId: string, sceneId?: string) => void
  updateCueStep: (listId: string, stepId: string, patch: Partial<CueStepDef>) => void
  removeCueStep: (listId: string, stepId: string) => void
  moveCueStep: (listId: string, stepId: string, direction: -1 | 1) => void
  setActiveCueList: (id: string | null) => void
  goToCue: (listId: string, index: number) => void
  cueNext: () => void
  cuePrev: () => void
  stopCue: () => void

  setMidiMappings: (mappings: MidiMapping[]) => void
  addMidiMapping: (mapping: MidiMapping) => void
  removeMidiMapping: (id: string) => void
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

/** Momentary flash: remembers the look to return to on release. */
let flashState: { patch: Record<number, number>; activeSceneId: string | null } | null = null

export function nextFreeChannel(fixtures: FixtureDef[]): number {
  return fixtures.reduce((max, f) => Math.max(max, f.channelStart - 1 + f.channels), 0) + 1
}

export function defaultFixtureValues(fixture: FixtureDef): Record<string, number> {
  const values: Record<string, number> = {}
  for (const attr of fixtureAttributes(fixture.type)) {
    values[attr] = attr === 'pan' || attr === 'tilt' ? 128 : 0
  }
  return values
}

function scenePatch(
  state: Pick<ShowState, 'show' | 'master'>,
  scene: SceneDef
): Record<number, number> {
  return computeSceneChannels(state.show?.fixtures ?? [], scene, state.master, true)
}

/**
 * Output patch for a scene. Blackout scenes drive the whole rig to zero, and
 * they must send an explicit zero for every channel: an empty patch would
 * leave the last values latched on the DMX interface.
 */
function sceneOutput(
  state: Pick<ShowState, 'show' | 'master'>,
  scene: SceneDef
): Record<number, number> {
  return scene.blackout ? allZeroPatch() : scenePatch(state, scene)
}

/** Merge a patch into the persisted show, and optionally into top-level state. */
function persistState(
  state: ShowState,
  showPatch: Partial<ShowDef>,
  statePatch: Partial<ShowState> = {}
): Partial<ShowState> {
  return {
    ...statePatch,
    show: state.show ? { ...state.show, ...showPatch, updatedAt: Date.now() } : null
  }
}

const defaultShow: ShowDef = {
  id: 'demo-1',
  name: 'Demo Show',
  description: 'Starter worship set',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  fixtures: [
    { id: 'f1', name: 'Warm Wash Front', type: 'par', channelStart: 1, channels: 4, group: 'Front' },
    { id: 'f2', name: 'Blue Fill Back', type: 'led-wash', channelStart: 5, channels: 7, group: 'Back' },
    { id: 'f3', name: 'Center Moving Head', type: 'moving-head', channelStart: 12, channels: 8, group: 'Center' }
  ],
  scenes: [
    {
      id: 's1',
      name: 'Warm Welcome',
      fixtureValues: {
        f1: { intensity: 220, red: 255, green: 160, blue: 80 },
        f2: { intensity: 80, red: 30, green: 80, blue: 255, white: 0, amber: 0, uv: 0 },
        f3: { intensity: 0, pan: 128, tilt: 128, red: 0, green: 0, blue: 0, gobo: 0, strobe: 0 }
      },
      fadeMs: 1200
    },
    {
      id: 's2',
      name: 'Sermon Focus',
      fixtureValues: {
        f1: { intensity: 180, red: 255, green: 220, blue: 180 },
        f2: { intensity: 120, red: 80, green: 160, blue: 255, white: 0, amber: 0, uv: 0 },
        f3: {
          intensity: 200,
          pan: 128,
          tilt: 96,
          red: 255,
          green: 255,
          blue: 255,
          gobo: 0,
          strobe: 0
        }
      },
      fadeMs: 800
    },
    {
      id: 's3',
      name: 'Communion Glow',
      fixtureValues: {
        f1: { intensity: 140, red: 200, green: 80, blue: 40 },
        f2: { intensity: 160, red: 120, green: 40, blue: 90, white: 0, amber: 0, uv: 0 },
        f3: { intensity: 120, pan: 128, tilt: 160, red: 255, green: 120, blue: 60, gobo: 0, strobe: 0 }
      },
      fadeMs: 2000
    }
  ],
  automations: [],
  effects: [],
  cueLists: [
    {
      id: 'c1',
      name: 'Sunday Set',
      steps: [
        { id: 'cs1', sceneId: 's1', fadeMs: 1500, holdMs: 0 },
        { id: 'cs2', sceneId: 's2', fadeMs: 1000, holdMs: 0 },
        { id: 'cs3', sceneId: 's3', fadeMs: 2000, holdMs: 0 }
      ],
      loop: false
    }
  ],
  midiMappings: [],
  masterIntensity: 255
}

export const useShowStore = create<ShowState>((set, get) => ({
  show: defaultShow,
  scenes: defaultShow.scenes,
  automations: defaultShow.automations,
  effects: defaultShow.effects ?? [],
  cueLists: defaultShow.cueLists ?? [],
  midiMappings: defaultShow.midiMappings ?? [],
  master: defaultShow.masterIntensity ?? 255,
  blackout: false,
  bpm: 120,
  isPlaying: false,
  activeSceneId: null,
  selectedFixtureIds: [],
  activeCueListId: defaultShow.cueLists?.[0]?.id ?? null,
  activeCueIndex: -1,
  cuePlaying: false,

  setShow: (show) => {
    // Loading a different show must not leave the previous show's look
    // latched on the outputs.
    flashState = null
    setEffectBlackout(false)
    sendImmediate(allZeroPatch())
    set({
      show,
      scenes: show?.scenes ?? [],
      automations: show?.automations ?? [],
      effects: show?.effects ?? [],
      cueLists: show?.cueLists ?? [],
      midiMappings: show?.midiMappings ?? [],
      master: show?.masterIntensity ?? 255,
      blackout: false,
      bpm: show?.bpm ?? 120,
      activeSceneId: null,
      selectedFixtureIds: [],
      activeCueListId: show?.cueLists?.[0]?.id ?? null,
      activeCueIndex: -1,
      cuePlaying: false
    })
  },
  setBpm: (bpm) =>
    set((state) => {
      const next = Number.isFinite(bpm) ? Math.max(30, Math.min(240, Math.round(bpm))) : 120
      return persistState(state, { bpm: next }, { bpm: next })
    }),
  setAudioPath: (audioPath) =>
    set((state) => persistState(state, { audioPath: audioPath ?? undefined })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setMaster: (value) =>
    set((state) => {
      const master = clamp(value)
      if (!state.blackout) {
        const active = state.scenes.find((s) => s.id === state.activeSceneId)
        if (active) sendImmediate(sceneOutput({ ...state, master }, active))
        else if (get().isPlaying) {
          // Automation loop reads master from the store on its next frame.
        }
      }
      return persistState(state, { masterIntensity: master }, { master })
    }),

  setBlackout: (active) =>
    set((state) => {
      if (active) {
        flashState = null
        setEffectBlackout(true)
        sendImmediate(allZeroPatch())
      } else {
        setEffectBlackout(false)
        const activeScene = state.scenes.find((s) => s.id === state.activeSceneId)
        if (activeScene) sendImmediate(sceneOutput(state, activeScene))
      }
      return { blackout: active }
    }),

  toggleBlackout: () => get().setBlackout(!get().blackout),

  selectFixture: (id, additive = false) =>
    set((state) => {
      if (!state.show?.fixtures.some((fixture) => fixture.id === id)) return state
      const selectedFixtureIds = additive
        ? state.selectedFixtureIds.includes(id)
          ? state.selectedFixtureIds
          : [...state.selectedFixtureIds, id]
        : [id]
      return { selectedFixtureIds }
    }),

  goToScene: (id) =>
    set((state) => {
      const scene = state.scenes.find((s) => s.id === id)
      if (!scene) return state
      if (!state.blackout) sendChannels(sceneOutput(state, scene), scene.fadeMs)
      return {
        activeSceneId: id,
        cuePlaying: false
      }
    }),

  flashScene: (id) =>
    set((state) => {
      const scene = state.scenes.find((s) => s.id === id)
      if (!scene || state.blackout) return state
      // Nest only the first press; repeated presses shouldn't overwrite the look
      // we're flashing from.
      if (!flashState) {
        flashState = { patch: getCurrentPatch(), activeSceneId: state.activeSceneId }
      }
      sendImmediate(sceneOutput(state, scene))
      return { activeSceneId: id, cuePlaying: false }
    }),

  endFlash: () =>
    set((state) => {
      if (!flashState) return state
      const { patch, activeSceneId } = flashState
      flashState = null
      if (!state.blackout) sendImmediate(patch)
      return { activeSceneId }
    }),

  addScene: () =>
    set((state) => {
      const fixtures = state.show?.fixtures ?? []
      const fixtureValues: SceneDef['fixtureValues'] = {}
      for (const fixture of fixtures) fixtureValues[fixture.id] = defaultFixtureValues(fixture)
      const newScene: SceneDef = {
        id: crypto.randomUUID(),
        name: `Scene ${state.scenes.length + 1}`,
        fixtureValues,
        fadeMs: 1000
      }
      const scenes = [...state.scenes, newScene]
      return persistState(state, { scenes }, { scenes })
    }),

  duplicateScene: (id) =>
    set((state) => {
      const index = state.scenes.findIndex((s) => s.id === id)
      const source = state.scenes[index]
      if (!source) return state
      const copy: SceneDef = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} Copy`,
        fixtureValues: structuredClone(source.fixtureValues),
        fadeMs: source.fadeMs
      }
      const scenes = [...state.scenes]
      scenes.splice(index + 1, 0, copy)
      return persistState(state, { scenes }, { scenes })
    }),

  updateScene: (id, patch) =>
    set((state) => {
      const scenes = state.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s))
      const updated = scenes.find((s) => s.id === id)
      if (updated && state.activeSceneId === id && !state.blackout) {
        sendImmediate(sceneOutput(state, updated))
      }
      return persistState(state, { scenes }, { scenes })
    }),

  updateSelectedFixtures: (values) =>
    set((state) => {
      const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId)
      const selectedFixtureIds = state.selectedFixtureIds.filter((id) =>
        state.show?.fixtures.some((fixture) => fixture.id === id)
      )
      if (!activeScene || selectedFixtureIds.length === 0) return state

      const patch: Record<string, number> = {}
      for (const [attribute, value] of Object.entries(values)) {
        if (Number.isFinite(value)) patch[attribute] = clamp(value)
      }
      if (Object.keys(patch).length === 0) return state

      const selected = new Set(selectedFixtureIds)
      const scenes = state.scenes.map((scene) => {
        if (scene.id !== activeScene.id) return scene
        const fixtureValues = { ...scene.fixtureValues }
        for (const fixtureId of selected) {
          fixtureValues[fixtureId] = { ...(fixtureValues[fixtureId] ?? {}), ...patch }
        }
        return { ...scene, fixtureValues }
      })
      const updatedScene = scenes.find((scene) => scene.id === activeScene.id)
      if (updatedScene && !state.blackout) sendImmediate(sceneOutput(state, updatedScene))
      return persistState(state, { scenes }, { scenes })
    }),

  deleteScene: (id) =>
    set((state) => {
      const scenes = state.scenes.filter((s) => s.id !== id)
      const cueLists = state.cueLists.map((list) => ({
        ...list,
        steps: list.steps.filter((step) => step.sceneId !== id)
      }))
      if (state.activeSceneId === id) sendImmediate(allZeroPatch())
      return persistState(
        state,
        { scenes, cueLists },
        {
          scenes,
          cueLists,
          activeSceneId: state.activeSceneId === id ? null : state.activeSceneId
        }
      )
    }),

  addFixture: (preset, name, group) =>
    set((state) => {
      const fixtures = state.show?.fixtures ?? []
      const fixture: FixtureDef = {
        id: crypto.randomUUID(),
        name: name?.trim() || preset.name,
        type: preset.type,
        channelStart: nextFreeChannel(fixtures),
        channels: preset.channels,
        group: group?.trim() || 'Ungrouped'
      }
      const nextFixtures = [...fixtures, fixture]
      const scenes = state.scenes.map((scene) => ({
        ...scene,
        fixtureValues: { ...scene.fixtureValues, [fixture.id]: defaultFixtureValues(fixture) }
      }))
      return persistState(state, { fixtures: nextFixtures, scenes }, { scenes })
    }),

  updateFixture: (id, patch) =>
    set((state) => {
      const fixtures = (state.show?.fixtures ?? []).map((f) => {
        if (f.id !== id) return f
        const start = patch.channelStart ?? f.channelStart
        const count = patch.channels ?? f.channels
        return {
          ...f,
          ...patch,
          channelStart: Number.isFinite(start) ? Math.max(1, Math.round(start)) : f.channelStart,
          channels: Number.isFinite(count) ? Math.max(1, Math.round(count)) : f.channels
        }
      })
      const active = state.scenes.find((s) => s.id === state.activeSceneId)
      if (active && !state.blackout) {
        sendImmediate(sceneOutput({ ...state, show: state.show ? { ...state.show, fixtures } : null }, active))
      }
      return persistState(state, { fixtures })
    }),

  removeFixture: (id) =>
    set((state) => {
      const removed = (state.show?.fixtures ?? []).find((f) => f.id === id)
      const fixtures = (state.show?.fixtures ?? []).filter((f) => f.id !== id)
      const scenes = state.scenes.map((scene) => {
        const fixtureValues = { ...scene.fixtureValues }
        delete fixtureValues[id]
        return { ...scene, fixtureValues }
      })
      const automations = state.automations.filter((a) => a.fixtureId !== id)
      const effects = state.effects.map((effect) => ({
        ...effect,
        fixtureIds: effect.fixtureIds.filter((fixtureId) => fixtureId !== id)
      }))
      const active = scenes.find((s) => s.id === state.activeSceneId)
      if (!state.blackout) {
        const patch = active
          ? sceneOutput(
              { ...state, show: state.show ? { ...state.show, fixtures } : null },
              active
            )
          : {}
        // The removed fixture's channels are no longer part of the patch, so
        // they would stay latched at their last values. Zero them explicitly.
        if (removed) {
          for (let offset = 0; offset < removed.channels; offset++) {
            patch[removed.channelStart + offset] = 0
          }
        }
        sendImmediate(patch)
      }
      return persistState(
        state,
        { fixtures, scenes, automations, effects },
        {
          scenes,
          automations,
          effects,
          selectedFixtureIds: state.selectedFixtureIds.filter((fixtureId) => fixtureId !== id)
        }
      )
    }),

  addAutomation: (automation) =>
    set((state) =>
      persistState(
        state,
        { automations: [...state.automations, automation] },
        { automations: [...state.automations, automation] }
      )
    ),

  updateAutomation: (id, patch) =>
    set((state) => {
      const automations = state.automations.map((a) => (a.id === id ? { ...a, ...patch } : a))
      return persistState(state, { automations }, { automations })
    }),

  removeAutomation: (id) =>
    set((state) => {
      const automations = state.automations.filter((a) => a.id !== id)
      return persistState(state, { automations }, { automations })
    }),

  addEffect: (effect) =>
    set((state) => {
      const effects = [...state.effects, effect]
      return persistState(state, { effects }, { effects })
    }),

  updateEffect: (id, patch) =>
    set((state) => {
      const effects = state.effects.map((effect) =>
        effect.id === id ? { ...effect, ...patch } : effect
      )
      return persistState(state, { effects }, { effects })
    }),

  removeEffect: (id) =>
    set((state) => {
      const effects = state.effects.filter((effect) => effect.id !== id)
      return persistState(state, { effects }, { effects })
    }),

  addCueList: (name) =>
    set((state) => {
      const list: CueListDef = {
        id: crypto.randomUUID(),
        name: name?.trim() || `Cue List ${state.cueLists.length + 1}`,
        steps: [],
        loop: false
      }
      const cueLists = [...state.cueLists, list]
      return persistState(
        state,
        { cueLists },
        { cueLists, activeCueListId: list.id, activeCueIndex: -1, cuePlaying: false }
      )
    }),

  updateCueList: (id, patch) =>
    set((state) => {
      const cueLists = state.cueLists.map((l) => (l.id === id ? { ...l, ...patch } : l))
      return persistState(state, { cueLists }, { cueLists })
    }),

  renameCueList: (id, name) =>
    set((state) => {
      const cueLists = state.cueLists.map((l) => (l.id === id ? { ...l, name } : l))
      return persistState(state, { cueLists }, { cueLists })
    }),

  removeCueList: (id) =>
    set((state) => {
      const cueLists = state.cueLists.filter((l) => l.id !== id)
      return persistState(
        state,
        { cueLists },
        {
          cueLists,
          activeCueListId:
            state.activeCueListId === id ? (cueLists[0]?.id ?? null) : state.activeCueListId,
          activeCueIndex: state.activeCueListId === id ? -1 : state.activeCueIndex,
          cuePlaying: state.activeCueListId === id ? false : state.cuePlaying
        }
      )
    }),

  addCueStep: (listId, sceneId) =>
    set((state) => {
      const scene = sceneId ?? state.scenes[0]?.id
      if (!scene) return state
      const cueLists = state.cueLists.map((list) => {
        if (list.id !== listId) return list
        const step: CueStepDef = {
          id: crypto.randomUUID(),
          sceneId: scene,
          fadeMs: state.scenes.find((s) => s.id === scene)?.fadeMs ?? 1000,
          holdMs: 0
        }
        return { ...list, steps: [...list.steps, step] }
      })
      return persistState(state, { cueLists }, { cueLists })
    }),

  updateCueStep: (listId, stepId, patch) =>
    set((state) => {
      const cueLists = state.cueLists.map((list) =>
        list.id === listId
          ? {
              ...list,
              steps: list.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
            }
          : list
      )
      return persistState(state, { cueLists }, { cueLists })
    }),

  removeCueStep: (listId, stepId) =>
    set((state) => {
      const cueLists = state.cueLists.map((list) =>
        list.id === listId
          ? { ...list, steps: list.steps.filter((step) => step.id !== stepId) }
          : list
      )
      return persistState(state, { cueLists }, { cueLists })
    }),

  moveCueStep: (listId, stepId, direction) =>
    set((state) => {
      const cueLists = state.cueLists.map((list) => {
        if (list.id !== listId) return list
        const index = list.steps.findIndex((s) => s.id === stepId)
        const swap = index + direction
        if (index < 0 || swap < 0 || swap >= list.steps.length) return list
        const steps = [...list.steps]
        ;[steps[index], steps[swap]] = [steps[swap], steps[index]]
        return { ...list, steps }
      })
      return persistState(state, { cueLists }, { cueLists })
    }),

  setActiveCueList: (id) => set({ activeCueListId: id, activeCueIndex: -1, cuePlaying: false }),

  goToCue: (listId, index) =>
    set((state) => {
      const list = state.cueLists.find((l) => l.id === listId)
      if (!list) return state
      const step = list.steps[index]
      const scene = step ? state.scenes.find((s) => s.id === step.sceneId) : undefined
      if (!step || !scene) return state
      if (!state.blackout) sendChannels(sceneOutput(state, scene), step.fadeMs)
      return {
        activeCueListId: listId,
        activeCueIndex: index,
        activeSceneId: scene.id,
        cuePlaying: true
      }
    }),

  cueNext: () =>
    set((state) => {
      const list = state.cueLists.find((l) => l.id === state.activeCueListId)
      if (!list || list.steps.length === 0) return state
      let next = state.activeCueIndex + 1
      if (next >= list.steps.length) {
        if (list.loop) next = 0
        else return { ...state, cuePlaying: false }
      }
      const step = list.steps[next]
      const scene = state.scenes.find((s) => s.id === step.sceneId)
      if (!scene) return { ...state, cuePlaying: false }
      if (!state.blackout) sendChannels(sceneOutput(state, scene), step.fadeMs)
      return {
        activeCueIndex: next,
        activeSceneId: scene.id,
        cuePlaying: true
      }
    }),

  cuePrev: () =>
    set((state) => {
      const list = state.cueLists.find((l) => l.id === state.activeCueListId)
      if (!list || list.steps.length === 0) return state
      let prev = state.activeCueIndex - 1
      if (prev < 0) prev = list.loop ? list.steps.length - 1 : 0
      const step = list.steps[prev]
      const scene = state.scenes.find((s) => s.id === step.sceneId)
      if (!scene) return state
      if (!state.blackout) sendChannels(sceneOutput(state, scene), step.fadeMs)
      return {
        activeCueIndex: prev,
        activeSceneId: scene.id,
        cuePlaying: true
      }
    }),

  stopCue: () => set({ cuePlaying: false }),

  setMidiMappings: (mappings) =>
    set((state) => persistState(state, { midiMappings: mappings }, { midiMappings: mappings })),
  addMidiMapping: (mapping) =>
    set((state) => {
      const midiMappings = [...state.midiMappings, mapping]
      return persistState(state, { midiMappings }, { midiMappings })
    }),
  removeMidiMapping: (id) =>
    set((state) => {
      const midiMappings = state.midiMappings.filter((m) => m.id !== id)
      return persistState(state, { midiMappings }, { midiMappings })
    })
}))
