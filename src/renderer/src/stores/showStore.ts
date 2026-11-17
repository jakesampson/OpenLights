import type { FanDef, FrameConfig, LiveObjectStyle } from '@shared/types'
import { scenesToPresets } from '@shared/sceneConversion'
import { prunePageValues, switchLivePage, type PageActiveValues } from '../lib/pageSwitch'
import { exclusiveSiblings, liveOutputLevels, setFrameConfig } from '../lib/liveFrames'
import { applyLiveDrop, type LiveDropPayload, type LiveDropTarget } from '../lib/liveDrops'
import {
  copyObjects, deleteObjects, duplicateObjects, isClipboardEmpty, moveObjects,
  objectsInRect, pasteObjects, renameObject, resizeObject, setAttachment, setObjectStyle,
  type PageClipboard, type PageObjectRef, type Rect
} from '../lib/livePageObjects'
import { evaluateFan } from '../lib/fanning'
import { matchesPresetCategory } from '../lib/presetProperties'
import { sequenceOrder } from '../lib/sequenceClock'
import type { PresetGroup } from '@shared/types'
import type { SequenceDef } from '@shared/types'
import { syncPresetGroups, activateGroupedPreset } from '../lib/presetGroups'
import { create } from 'zustand'
import { CURRENT_SCHEMA_VERSION, migrateShow } from '@shared/migrations'
import { sanitizeStageObjectPatch } from '../lib/stageObjectGeometry'
import { locateFixturePatch } from '../lib/locateFixtures'
import { configureLocateOutput } from '../lib/output'
import type {
  AutomationDef,
  CueListDef,
  CueStepDef,
  EffectDef,
  FixtureDef,
  FixturePreset,
  MidiMapping,
  PresetDef,
  PresetCategory,
  PreviewTruss,
  SceneDef,
  ShowDef
} from '@shared/types'
import type { LivePage } from '@shared/types'
import type { StageObject } from '@shared/types'
import type { FixtureProfile } from '@shared/types'
import { allocateFixtures, type PatchOptions } from '../lib/patch'
import { validateProfile } from '@shared/profileValidation'
import { BUILTIN_PROFILES } from '@shared/fixtureProfiles'
import { fixtureMode } from '@shared/fixtureProfiles'
import { canParentGroup, syncFixtureGroups } from '../lib/fixtureGroups'
import { mixColor, type RgbColor } from '../lib/colorMix'
import { mapCopiedProperties } from '../lib/copyProperties'
import { releaseOverrides } from '../lib/propertyOverrides'
import { computeSceneChannels, fixtureAttributes } from '../lib/automationRuntime'
import { allZeroPatch, getCurrentPatch, sendChannels, sendImmediate, setEffectBlackout, configureSequences, configurePresetOutput, configureLiveOutput, configureOverrideOutput, suppressPresetsForScene } from '../lib/output'

interface ShowState {
  locked: boolean
  lockApp: (passcode?: string) => void
  unlockApp: (passcode?: string) => boolean
  undoStack: ShowDef[]
  redoStack: ShowDef[]
  historyGrouping: boolean
  historyGroupRecorded: boolean
  beginHistoryGroup: () => void
  endHistoryGroup: () => void
  undo: () => void
  redo: () => void
  show: ShowDef | null
  scenes: SceneDef[]
  presets: PresetDef[]
  activeSequenceIds: string[]
  toggleSequence: (id: string) => void
  stopSequences: () => void
  activePresetIds: string[]
  activeLiveValues: Record<string, number>
  activeLivePageId: string | null
  pageActiveValues: PageActiveValues
  selectedPageObjects: PageObjectRef[]
  pageClipboard: PageClipboard | null
  manualOverrides: Record<string, Record<string, number>>
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
  selectedBeams: { fixtureId: string; beamId: string }[]
  selectFixtureBeam: (fixtureId: string, beamId: string, additive?: boolean) => void
  updateSelectedBeamValues: (values: Record<string, number>, manual?: boolean) => void
  activeCueListId: string | null
  activeCueIndex: number
  cuePlaying: boolean
  cueRevision: number

  setShow: (show: ShowDef | null) => void
  updateProject: (patch: Partial<ShowDef>) => void
  setStartupMode: (mode: 'none' | 'restore') => void
  showForSave: () => ShowDef | null
  setLivePages: (pages: LivePage[]) => void
  dropOnLivePage: (payload: LiveDropPayload, target: LiveDropTarget, split?: boolean) => void
  setLiveValue: (id: string, value: number) => void
  getLiveOutputLevels: () => Record<string, number>
  clearLiveValues: () => void
  selectLivePage: (id: string | null) => void
  setPageSwitchMode: (deactivateOnSwitch: boolean) => void
  setPageObjectSelection: (refs: PageObjectRef[]) => void
  togglePageObjectSelection: (ref: PageObjectRef) => void
  selectPageObjectsInRect: (rect: Rect) => void
  clearPageObjectSelection: () => void
  moveSelectedPageObjects: (dx: number, dy: number) => void
  resizePageObject: (ref: PageObjectRef, width: number, height: number) => void
  renamePageObject: (ref: PageObjectRef, name: string) => void
  attachPageObject: (ref: PageObjectRef, targetId: string | null) => void
  setPageObjectStyle: (ref: PageObjectRef, patch: Partial<LiveObjectStyle>) => void
  configureFrame: (frameId: string, patch: Partial<FrameConfig>) => void
  deleteSelectedPageObjects: () => void
  duplicateSelectedPageObjects: () => void
  copySelectedPageObjects: () => void
  pastePageObjects: (dx?: number, dy?: number) => void
  setManualOverrides: (values: Record<string, number>) => void
  clearManualOverrides: () => void
  releaseManualOverrides: (fixtureIds?: string[], property?: string) => void
  locateFixtures: (ids: string[]) => void
  setBpm: (bpm: number) => void
  setAudioPath: (path: string | null) => void
  setIsPlaying: (playing: boolean) => void

  setMaster: (value: number) => void
  setBlackout: (active: boolean) => void
  toggleBlackout: () => void

  selectFixture: (id: string, additive?: boolean) => void
  selectFixtures: (ids: string[]) => void
  groupSelectedFixtures: (name: string) => void
  createFixtureGroup: (name: string, parentId?: string | null) => string
  renameFixtureGroup: (id: string, name: string) => void
  parentFixtureGroup: (id: string, parentId: string | null) => void
  moveFixtureGroup: (id: string, direction: -1 | 1) => void
  removeFixtureGroup: (id: string) => void
  updateSelectedFixtures: (values: Record<string, number>) => void
  setSelectedColor: (color: RgbColor, manual?: boolean) => void
  propertyClipboard: { fixture: FixtureDef; values: Record<string, number> } | null
  copyFixtureProperties: () => void
  pasteFixtureProperties: (manual?: boolean) => void
  saveFan: (fan: FanDef) => void
  deleteFan: (id: string, keepValues: boolean) => void
  goToScene: (id: string) => void
  flashScene: (id: string) => void
  endFlash: () => void
  capturePreset: (name: string, category: PresetCategory) => void
  convertScenesToPresets: () => number
  togglePreset: (id: string) => void
  clearPresets: () => void
  renamePreset: (id: string, name: string) => void
  updatePresetContents: (id: string, values: PresetDef['fixtureValues']) => void
  updatePresetFromCurrent: (id: string) => void
  applyPresetsToOverrides: (ids: string[], selectedOnly?: boolean) => void
  addOverridesToPresets: (ids: string[], selectedOnly?: boolean) => void
  removePresetProperty: (id: string, fixtureId: string, attribute?: string) => void
  deletePreset: (id: string) => void
  createPresetGroup: (name: string, parentId?: string | null) => void
  updatePresetGroup: (id: string, patch: Partial<PresetGroup>) => void
  assignPresetGroup: (presetId: string, groupId: string) => void
  deletePresetGroup: (id: string) => void
  createSequence: (name: string) => void
  updateSequence: (id: string, patch: Partial<SequenceDef>) => void
  deleteSequence: (id: string) => void
  addSequenceStep: (id: string) => void
  removeSequenceStep: (id: string, stepId: string) => void
  duplicateSequenceStep: (id: string, stepId: string) => void
  moveSequenceStep: (id: string, stepId: string, toIndex: number) => void
  reorderSequenceSteps: (id: string, order: 'backward' | 'random', seed?: number) => void
  addScene: () => void
  duplicateScene: (id: string) => void
  updateScene: (id: string, patch: Partial<SceneDef>) => void
  deleteScene: (id: string) => void

  addFixture: (preset: FixturePreset, name?: string, group?: string) => void
  addProfileFixtures: (profile: FixtureProfile, options: PatchOptions) => void
  updateFixture: (id: string, patch: Partial<FixtureDef>) => void
  setFixturePosition: (id: string, position: { x: number; y: number }) => void
  setFixturePositions: (positions: Record<string, { x: number; y: number }>) => void
  setPreviewTrusses: (trusses: PreviewTruss[]) => void
  setStageObjects: (objects: StageObject[]) => void
  addStageObject: (object: StageObject) => void
  updateStageObject: (id: string, patch: Partial<StageObject>) => void
  removeStageObjects: (ids: string[]) => void
  stageClipboard: StageObject[]
  copyStageObjects: (ids: string[]) => void
  pasteStageObjects: () => string[]
  duplicateStageObjects: (ids: string[]) => string[]
  flipStageObjects: (ids: string[], axis: 'x' | 'y') => void
  orderStageObjects: (ids: string[], side: 'front' | 'back') => void
  removeFixture: (id: string) => void
  duplicateFixture: (id: string) => void
  reassignFixtureProfile: (id: string, profile: FixtureProfile, modeId?: string) => void
  saveFixtureProfile: (profile: FixtureProfile) => void
  deleteFixtureProfile: (id: string) => void

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
  for (const attr of fixtureAttributes(fixture)) {
    values[attr] = fixture.defaultValues?.[attr] ?? fixtureMode(fixture)?.channels.find((c) => c.attribute === attr)?.defaultValue ?? 0
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
  suppressPresetsForScene(Boolean(scene.blackout))
  return scene.blackout ? allZeroPatch() : scenePatch(state, scene)
}

/** Merge a patch into the persisted show, and optionally into top-level state. */
function persistState(
  state: ShowState,
  showPatch: Partial<ShowDef>,
  statePatch: Partial<ShowState> = {}
): Partial<ShowState> {
  if (showPatch.fixtures && !showPatch.fixtureGroups) showPatch = { ...showPatch, fixtureGroups: syncFixtureGroups(state.show?.fixtureGroups ?? [], showPatch.fixtures) }
  if (showPatch.presets && !showPatch.presetGroups) showPatch = { ...showPatch, presetGroups: syncPresetGroups(state.show?.presetGroups ?? [], showPatch.presets) }
  return {
    ...statePatch,
    ...(state.show && JSON.stringify({ ...state.show, ...showPatch }) !== JSON.stringify(state.show) ? {
      undoStack: state.historyGrouping && state.historyGroupRecorded ? state.undoStack : [...state.undoStack, structuredClone(state.show)].slice(-200),
      redoStack: [],
      historyGroupRecorded: state.historyGrouping
    } : {}),
    show: state.show ? { ...state.show, ...showPatch, updatedAt: Date.now() } : null
  }
}

function activeLivePage(state: ShowState): LivePage | undefined {
  return state.show?.livePages?.find((page) => page.id === state.activeLivePageId) ?? state.show?.livePages?.[0]
}

function saveLivePages(state: ShowState, livePages: LivePage[]): Partial<ShowState> {
  return {
    ...persistState(state, { livePages }),
    pageActiveValues: prunePageValues(state.pageActiveValues, livePages.map((page) => page.id))
  }
}

const productionDefaultShow: ShowDef = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
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

const showBuddyFixtures: FixtureDef[] = [
  {
    id: 'pan-4x1x30',
    name: 'PAN 4X1X30',
    type: 'pixel-bar-17ch',
    channelStart: 1,
    channels: 17,
    group: 'Stage'
  },
  { id: 'dimmer-1', name: 'Dimmer 1', type: 'dimmer', channelStart: 18, channels: 1 },
  { id: 'dimmer-2', name: 'Dimmer 2', type: 'dimmer', channelStart: 19, channels: 1 },
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `simger-q12bt-${index + 1}`,
    name: `Simger Q12BT Channel ${index + 1}`,
    type: 'rgba-4ch' as const,
    channelStart: 20 + index * 4,
    channels: 4,
    group: 'Front'
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `corepar-q120-${index + 1}`,
    name: `COREpar Q120 ILS ${index + 1}`,
    type: 'rgbw-4ch' as const,
    channelStart: 36 + index * 4,
    channels: 4,
    group: 'Back'
  }))
]

interface TemplateLook {
  red: number
  green: number
  blue: number
  white: number
  amber: number
  intensity: number
}

function showBuddySceneValues(look: TemplateLook): Record<string, Record<string, number>> {
  const values: Record<string, Record<string, number>> = {
    'pan-4x1x30': {
      red: look.red,
      green: look.green,
      blue: look.blue,
      red2: look.red,
      green2: look.green,
      blue2: look.blue,
      red3: look.red,
      green3: look.green,
      blue3: look.blue,
      red4: look.red,
      green4: look.green,
      blue4: look.blue,
      intensity: look.intensity,
      strobe: 0,
      function: 0,
      speed: 0,
      listType: 0
    },
    'dimmer-1': { intensity: look.intensity },
    'dimmer-2': { intensity: look.intensity }
  }

  for (let index = 1; index <= 4; index++) {
    values[`simger-q12bt-${index}`] = {
      red: look.red,
      green: look.green,
      blue: look.blue,
      amber: look.amber
    }
    values[`corepar-q120-${index}`] = {
      red: look.red,
      green: look.green,
      blue: look.blue,
      white: look.white
    }
  }

  return values
}

const developmentDefaultShow: ShowDef = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'showbuddyactive-demo',
  name: 'ShowBuddyActive Demo',
  description: 'Development patch based on the supplied image; inferred addresses 1–51',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  fixtures: showBuddyFixtures,
  scenes: [
    {
      id: 's1',
      name: 'Warm Welcome',
      fixtureValues: showBuddySceneValues({
        red: 220,
        green: 110,
        blue: 30,
        white: 24,
        amber: 36,
        intensity: 128
      }),
      fadeMs: 1200
    },
    {
      id: 's2',
      name: 'Sermon Focus',
      fixtureValues: showBuddySceneValues({
        red: 50,
        green: 110,
        blue: 220,
        white: 110,
        amber: 0,
        intensity: 150
      }),
      fadeMs: 800
    },
    {
      id: 's3',
      name: 'Communion Glow',
      fixtureValues: showBuddySceneValues({
        red: 180,
        green: 50,
        blue: 20,
        white: 12,
        amber: 160,
        intensity: 100
      }),
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

const defaultShow = import.meta.env.DEV ? developmentDefaultShow : productionDefaultShow

let sessionPasscode = ''
export const useShowStore = create<ShowState>((set, get) => {
const actions: ShowState = {
  locked: false,
  propertyClipboard: null,
  selectedBeams: [],
  stageClipboard: [],
  lockApp: (passcode = '') => { if (get().locked) return; sessionPasscode = passcode; set({ locked: true }) },
  unlockApp: (passcode = '') => { if (passcode !== sessionPasscode) return false; sessionPasscode = ''; set({ locked: false }); return true },
  undoStack: [], redoStack: [], historyGrouping: false, historyGroupRecorded: false,
  beginHistoryGroup: () => set({ historyGrouping: true, historyGroupRecorded: false }),
  endHistoryGroup: () => set({ historyGrouping: false, historyGroupRecorded: false }),
  undo: () => {
    const state = get(), previous = state.undoStack.at(-1)
    if (!previous || !state.show) return
    const next = structuredClone(previous)
    set({ show: next, scenes: next.scenes, presets: next.presets ?? [], effects: next.effects ?? [], automations: next.automations, cueLists: next.cueLists ?? [], midiMappings: next.midiMappings ?? [], master: next.masterIntensity ?? 255, bpm: next.bpm ?? 120, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, structuredClone(state.show)].slice(-200), historyGrouping: false, historyGroupRecorded: false, selectedPageObjects: [] })
    const scene = next.scenes.find((item) => item.id === state.activeSceneId)
    if (!state.blackout) sendImmediate(scene ? sceneOutput(get(), scene) : allZeroPatch())
  },
  redo: () => {
    const state = get(), following = state.redoStack.at(-1)
    if (!following || !state.show) return
    const next = structuredClone(following)
    set({ show: next, scenes: next.scenes, presets: next.presets ?? [], effects: next.effects ?? [], automations: next.automations, cueLists: next.cueLists ?? [], midiMappings: next.midiMappings ?? [], master: next.masterIntensity ?? 255, bpm: next.bpm ?? 120, undoStack: [...state.undoStack, structuredClone(state.show)].slice(-200), redoStack: state.redoStack.slice(0, -1), historyGrouping: false, historyGroupRecorded: false, selectedPageObjects: [] })
    const scene = next.scenes.find((item) => item.id === state.activeSceneId)
    if (!state.blackout) sendImmediate(scene ? sceneOutput(get(), scene) : allZeroPatch())
  },
  show: defaultShow,
  scenes: defaultShow.scenes,
  presets: defaultShow.presets ?? [],
  activeSequenceIds: [],
  activePresetIds: [],
  activeLiveValues: {},
  activeLivePageId: null,
  pageActiveValues: {},
  selectedPageObjects: [],
  pageClipboard: null,
  manualOverrides: {},
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
  cueRevision: 0,

  setShow: (show) => {
    if (show) show = migrateShow(show)
    // Loading a different show must not leave the previous show's look
    // latched on the outputs.
    flashState = null
    configureSequences([])
    configureLocateOutput({})
    suppressPresetsForScene(false)
    configurePresetOutput({})
    configureLiveOutput({})
    configureOverrideOutput({})
    setEffectBlackout(false)
    sendImmediate(allZeroPatch())
    set({
      undoStack: [], redoStack: [], historyGrouping: false, historyGroupRecorded: false,
      show,
      activeSequenceIds: [],
      scenes: show?.scenes ?? [],
      presets: show?.presets ?? [],
      activePresetIds: show?.startup?.mode === 'restore' ? (show.startup.presetIds ?? []).filter((id) => show.presets?.some((p) => p.id === id)) : [],
      activeLiveValues: show?.startup?.mode === 'restore' ? Object.fromEntries(Object.entries(show.startup.liveValues ?? {}).filter(([id, value]) => Number.isFinite(value) && show.livePages?.some((page) => page.controls.some((c) => c.id === id))).map(([id, value]) => [id, clamp(value)])) : {},
      activeLivePageId: show?.startup?.mode === 'restore' && show.livePages?.some((p) => p.id === show.startup?.pageId) ? show.startup.pageId ?? null : show?.livePages?.[0]?.id ?? null,
      pageActiveValues: {},
      selectedPageObjects: [],
      pageClipboard: null,
      manualOverrides: {},
      automations: show?.automations ?? [],
      effects: show?.effects ?? [],
      cueLists: show?.cueLists ?? [],
      midiMappings: show?.midiMappings ?? [],
      master: show?.masterIntensity ?? 255,
      blackout: false,
      bpm: show?.bpm ?? 120,
      activeSceneId: show?.startup?.mode === 'restore' && show.scenes.some((s) => s.id === show.startup?.sceneId) ? show.startup.sceneId ?? null : null,
      selectedFixtureIds: [],
      selectedBeams: [],
      activeCueListId: show?.cueLists?.[0]?.id ?? null,
      activeCueIndex: -1,
      cuePlaying: false,
      cueRevision: get().cueRevision + 1
    })
    const restored = get().scenes.find((scene) => scene.id === get().activeSceneId)
    if (restored) sendImmediate(sceneOutput(get(), restored))
  },
  setStartupMode: (mode) => set((state) => persistState(state, { startup: { ...state.show?.startup, mode } })),
  showForSave: () => {
    const state = get()
    if (!state.show || state.show.startup?.mode !== 'restore') return state.show
    return { ...state.show, startup: { mode: 'restore', presetIds: [...state.activePresetIds], liveValues: { ...state.activeLiveValues }, pageId: state.activeLivePageId, sceneId: state.activeSceneId } }
  },
  setLivePages: (livePages) => set((state) => saveLivePages(state, livePages)),
  dropOnLivePage: (payload, target, split) => set((state) => {
    const page = activeLivePage(state)
    if (!page || !state.show) return state
    let n = 0
    const { page: next, refs } = applyLiveDrop(page, payload, target, () => `page-object-${Date.now()}-${++n}`, page.defaultStyles, split)
    if (!refs.length) return state
    return {
      ...saveLivePages(state, state.show.livePages!.map((item) => item.id === page.id ? next : item)),
      selectedPageObjects: refs
    }
  }),
  updateProject: (patch) => set((state) => persistState(state, patch)),
  setLiveValue: (id, value) => set((state) => {
    const level = clamp(value)
    const activeLiveValues = { ...state.activeLiveValues, [id]: level }
    // Activating a cue in an exclusive frame releases the frame's other cues.
    if (level > 0) for (const page of state.show?.livePages ?? []) {
      if (!page.controls.some((cue) => cue.id === id)) continue
      for (const sibling of exclusiveSiblings(page, id)) delete activeLiveValues[sibling]
    }
    return { activeLiveValues }
  }),
  getLiveOutputLevels: () => {
    const state = get()
    return liveOutputLevels(state.show?.livePages, state.activeLiveValues)
  },
  clearLiveValues: () => set((state) => {
    const pageActiveValues = { ...state.pageActiveValues }
    if (state.activeLivePageId) delete pageActiveValues[state.activeLivePageId]
    return { activeLiveValues: {}, pageActiveValues }
  }),
  selectLivePage: (id) => set((state) => ({
    ...switchLivePage(
      { activeLivePageId: state.activeLivePageId, activeLiveValues: state.activeLiveValues, pageActiveValues: state.pageActiveValues },
      id,
      state.show?.deactivateOnPageSwitch === true
    ),
    selectedPageObjects: []
  })),
  setPageSwitchMode: (deactivateOnSwitch) => set((state) => persistState(state, { deactivateOnPageSwitch: deactivateOnSwitch })),

  setPageObjectSelection: (refs) => set({ selectedPageObjects: refs }),
  togglePageObjectSelection: (ref) => set((state) => {
    const exists = state.selectedPageObjects.some((item) => item.type === ref.type && item.id === ref.id)
    return {
      selectedPageObjects: exists
        ? state.selectedPageObjects.filter((item) => !(item.type === ref.type && item.id === ref.id))
        : [...state.selectedPageObjects, ref]
    }
  }),
  selectPageObjectsInRect: (rect) => set((state) => {
    const page = activeLivePage(state)
    return { selectedPageObjects: page ? objectsInRect(page, rect) : [] }
  }),
  clearPageObjectSelection: () => set({ selectedPageObjects: [] }),

  moveSelectedPageObjects: (dx, dy) => set((state) => {
    const page = activeLivePage(state)
    if (!page || !state.selectedPageObjects.length) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? moveObjects(page, state.selectedPageObjects, dx, dy) : item))
  }),
  resizePageObject: (ref, width, height) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? resizeObject(page, ref, width, height) : item))
  }),
  renamePageObject: (ref, name) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? renameObject(page, ref, name) : item))
  }),
  attachPageObject: (ref, targetId) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? setAttachment(page, ref, targetId) : item))
  }),
  setPageObjectStyle: (ref, patch) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? setObjectStyle(page, ref, patch) : item))
  }),
  configureFrame: (frameId, patch) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? setFrameConfig(page, frameId, patch) : item))
  }),
  deleteSelectedPageObjects: () => set((state) => {
    const page = activeLivePage(state)
    if (!page || !state.selectedPageObjects.length) return state
    const deletedIds = new Set(state.selectedPageObjects.filter((ref) => ref.type === 'cue').map((ref) => ref.id))
    const activeLiveValues = Object.fromEntries(Object.entries(state.activeLiveValues).filter(([id]) => !deletedIds.has(id)))
    const pageActiveValues = Object.fromEntries(Object.entries(state.pageActiveValues).map(([pageId, values]) =>
      [pageId, Object.fromEntries(Object.entries(values).filter(([id]) => !deletedIds.has(id)))]
    ))
    return {
      ...saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? deleteObjects(page, state.selectedPageObjects) : item)),
      activeLiveValues,
      pageActiveValues,
      selectedPageObjects: []
    }
  }),
  duplicateSelectedPageObjects: () => set((state) => {
    const page = activeLivePage(state)
    if (!page || !state.selectedPageObjects.length) return state
    let n = 0
    const { page: next, refs } = duplicateObjects(page, state.selectedPageObjects, () => `page-object-${Date.now()}-${++n}`)
    return {
      ...saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? next : item)),
      selectedPageObjects: refs
    }
  }),
  copySelectedPageObjects: () => set((state) => {
    const page = activeLivePage(state)
    return { pageClipboard: page ? copyObjects(page, state.selectedPageObjects) : null }
  }),
  pastePageObjects: (dx, dy) => set((state) => {
    const page = activeLivePage(state)
    if (!page || isClipboardEmpty(state.pageClipboard)) return state
    let n = 0
    const { page: next, refs } = pasteObjects(page, state.pageClipboard!, () => `page-object-${Date.now()}-${++n}`, dx, dy)
    return {
      ...saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? next : item)),
      selectedPageObjects: refs
    }
  }),

  setManualOverrides: (values) => set((state) => {
    const manualOverrides = { ...state.manualOverrides }
    for (const id of state.selectedFixtureIds) {
      const fixture = state.show?.fixtures.find((item) => item.id === id)
      if (!fixture) continue
      const valid = fixtureAttributes(fixture)
      const entries = Object.entries(values).filter(([key, value]) => valid.includes(key) && Number.isFinite(value)).map(([key, value]) => [key, clamp(value)])
      if (entries.length) manualOverrides[id] = { ...manualOverrides[id], ...Object.fromEntries(entries) }
    }
    return { manualOverrides }
  }),
  clearManualOverrides: () => set({ manualOverrides: {} }),
  releaseManualOverrides: (fixtureIds, property) => set((state) => ({ manualOverrides: releaseOverrides(state.manualOverrides, fixtureIds, property) })),
  copyFixtureProperties: () => {
    const state = get(), fixture = state.show?.fixtures.find((f) => f.id === state.selectedFixtureIds[0])
    if (!fixture) return
    const values = { ...state.scenes.find((s) => s.id === state.activeSceneId)?.fixtureValues[fixture.id] }
    for (const id of state.activePresetIds) Object.assign(values, state.presets.find((p) => p.id === id)?.fixtureValues[fixture.id])
    Object.assign(values, state.manualOverrides[fixture.id])
    set({ propertyClipboard: { fixture: structuredClone(fixture), values } })
  },
  pasteFixtureProperties: (manual = false) => {
    const state = get(), clipboard = state.propertyClipboard
    if (!clipboard) return
    const patch = Object.fromEntries((state.show?.fixtures ?? []).filter((f) => state.selectedFixtureIds.includes(f.id)).map((f) => [f.id, mapCopiedProperties(clipboard.fixture, clipboard.values, f)]))
    if (manual) { set({ manualOverrides: Object.fromEntries([...new Set([...Object.keys(state.manualOverrides), ...Object.keys(patch)])].map((id) => [id, { ...state.manualOverrides[id], ...patch[id] }])) }); return }
    if (!state.activeSceneId) get().addScene()
    const scene = get().scenes.find((s) => s.id === get().activeSceneId)
    if (!scene) return
    const fixtureValues = { ...scene.fixtureValues }
    for (const [id, values] of Object.entries(patch)) fixtureValues[id] = { ...fixtureValues[id], ...values }
    get().updateScene(scene.id, { fixtureValues })
  },
  saveFan: (fan) => {
    const state = get(), scene = state.scenes.find((s) => s.id === state.activeSceneId)
    if (!scene || !state.show) return
    const fixtureValues = structuredClone(scene.fixtureValues)
    for (const [id, values] of Object.entries(evaluateFan(state.show.fixtures, fan))) fixtureValues[id] = { ...fixtureValues[id], ...values }
    get().updateScene(scene.id, { fixtureValues, fans: [...(scene.fans ?? []).filter((f) => f.id !== fan.id), structuredClone(fan)] })
  },
  deleteFan: (id, keepValues) => {
    const state = get(), scene = state.scenes.find((s) => s.id === state.activeSceneId), fan = scene?.fans?.find((f) => f.id === id)
    if (!scene || !fan) return
    const fixtureValues = structuredClone(scene.fixtureValues)
    if (!keepValues) for (const fixtureId of fan.fixtureIds) if (fixtureValues[fixtureId]) delete fixtureValues[fixtureId][fan.attribute]
    get().updateScene(scene.id, { fans: scene.fans?.filter((f) => f.id !== id), fixtureValues })
  },
  setSelectedColor: (color, manual = false) => {
    const state = get(), patch: Record<string, Record<string, number>> = {}
    for (const id of state.selectedFixtureIds) { const f = state.show?.fixtures.find((f) => f.id === id); if (f) patch[id] = f.type === 'dimmer' ? { ...color } : mixColor(color, fixtureAttributes(f)) }
    if (manual) { set({ manualOverrides: Object.fromEntries([...new Set([...Object.keys(state.manualOverrides), ...Object.keys(patch)])].map((id) => [id, { ...state.manualOverrides[id], ...patch[id] }])) }); return }
    if (!state.activeSceneId) get().addScene()
    const scene = get().scenes.find((s) => s.id === get().activeSceneId)
    if (!scene) return
    const fixtureValues = { ...scene.fixtureValues }
    for (const [id, values] of Object.entries(patch)) fixtureValues[id] = { ...fixtureValues[id], ...values }
    get().updateScene(scene.id, { fixtureValues })
  },
  locateFixtures: (ids) => { const state = get(); if (!state.blackout) configureLocateOutput(locateFixturePatch(state.show?.fixtures ?? [], ids, state.master)) },
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
      return { selectedFixtureIds, selectedBeams: [] }
    }),

  selectFixtures: (ids) => set((state) => {
    const validIds = new Set(state.show?.fixtures.map((fixture) => fixture.id) ?? [])
    return { selectedFixtureIds: [...new Set(ids)].filter((id) => validIds.has(id)), selectedBeams: [] }
  }),
  selectFixtureBeam: (fixtureId, beamId, additive = false) => set((state) => {
    const fixture = state.show?.fixtures.find((f) => f.id === fixtureId)
    if (!fixture || !fixtureMode(fixture)?.beams?.some((b) => b.id === beamId)) return state
    const selectedBeams = additive ? [...state.selectedBeams.filter((b) => b.fixtureId !== fixtureId || b.beamId !== beamId), { fixtureId, beamId }] : [{ fixtureId, beamId }]
    return { selectedBeams, selectedFixtureIds: [...new Set(selectedBeams.map((b) => b.fixtureId))] }
  }),
  updateSelectedBeamValues: (values, manual = false) => {
    const state = get(), patch: Record<string, Record<string, number>> = {}
    for (const selected of state.selectedBeams) {
      const fixture = state.show?.fixtures.find((f) => f.id === selected.fixtureId), beam = fixture && fixtureMode(fixture)?.beams?.find((b) => b.id === selected.beamId)
      if (!beam) continue
      for (const [attribute, value] of Object.entries(values)) if (beam.properties[attribute] && Number.isFinite(value)) patch[selected.fixtureId] = { ...patch[selected.fixtureId], [beam.properties[attribute]]: clamp(value) }
    }
    if (manual) { set({ manualOverrides: Object.fromEntries([...new Set([...Object.keys(state.manualOverrides), ...Object.keys(patch)])].map((id) => [id, { ...state.manualOverrides[id], ...patch[id] }])) }); return }
    if (!state.activeSceneId) get().addScene()
    const scene = get().scenes.find((s) => s.id === get().activeSceneId)
    if (!scene) return
    const fixtureValues = { ...scene.fixtureValues }
    for (const [id, attributes] of Object.entries(patch)) fixtureValues[id] = { ...fixtureValues[id], ...attributes }
    get().updateScene(scene.id, { fixtureValues })
  },

  groupSelectedFixtures: (name) => set((state) => {
    if (!state.show || !name.trim() || state.selectedFixtureIds.length === 0) return state
    const selected = new Set(state.selectedFixtureIds)
    const fixtures = state.show.fixtures.map((fixture) => selected.has(fixture.id) ? { ...fixture, group: name.trim() } : fixture)
    return persistState(state, { fixtures })
  }),
  createFixtureGroup: (name, parentId = null) => {
    if (!name.trim()) return ''
    const id = crypto.randomUUID(), state = get()
    if (parentId && !state.show?.fixtureGroups?.some((g) => g.id === parentId)) return ''
    set(persistState(state, { fixtureGroups: [...(state.show?.fixtureGroups ?? []), { id, name: name.trim(), parentId, fixtureIds: [...state.selectedFixtureIds] }] }))
    return id
  },
  renameFixtureGroup: (id, name) => set((state) => !name.trim() ? state : persistState(state, { fixtureGroups: (state.show?.fixtureGroups ?? []).map((g) => g.id === id ? { ...g, name: name.trim() } : g) })),
  parentFixtureGroup: (id, parentId) => set((state) => canParentGroup(state.show?.fixtureGroups ?? [], id, parentId) ? persistState(state, { fixtureGroups: (state.show?.fixtureGroups ?? []).map((g) => g.id === id ? { ...g, parentId } : g) }) : state),
  moveFixtureGroup: (id, direction) => set((state) => {
    const groups = [...(state.show?.fixtureGroups ?? [])], index = groups.findIndex((g) => g.id === id)
    if (index < 0) return state
    const siblings = groups.map((g, i) => ({ g, i })).filter(({ g }) => g.parentId === groups[index].parentId), at = siblings.findIndex(({ g }) => g.id === id), swap = siblings[at + direction]?.i
    if (swap === undefined) return state
    ;[groups[index], groups[swap]] = [groups[swap], groups[index]]
    return persistState(state, { fixtureGroups: groups })
  }),
  removeFixtureGroup: (id) => set((state) => {
    const group = state.show?.fixtureGroups?.find((g) => g.id === id)
    const groups = (state.show?.fixtureGroups ?? []).filter((g) => g.id !== id).map((g) => g.parentId === id ? { ...g, parentId: group?.parentId } : g)
    const fixtures = (state.show?.fixtures ?? []).map((f) => group?.fixtureIds.includes(f.id) && !groups.some((g) => g.fixtureIds.includes(f.id)) ? { ...f, group: 'Ungrouped' } : f)
    return persistState(state, { fixtures, fixtureGroups: syncFixtureGroups(groups, fixtures) })
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
      suppressPresetsForScene(Boolean(state.scenes.find((scene) => scene.id === activeSceneId)?.blackout))
      if (!state.blackout) sendImmediate(patch)
      return { activeSceneId }
    }),

  capturePreset: (name, category) => set((state) => {
    const scene = state.scenes.find((item) => item.id === state.activeSceneId)
    if (!scene || !state.show || !name.trim() || state.selectedFixtureIds.length === 0) return state
    const color = /^(red|green|blue|white|amber|uv)([2-4])?$/
    const position = new Set(['pan', 'tilt'])
    const fixtureValues: PresetDef['fixtureValues'] = {}
    for (const fixture of state.show.fixtures) {
      if (!state.selectedFixtureIds.includes(fixture.id)) continue
      const supported = new Set(fixtureAttributes(fixture))
      const source = scene.fixtureValues[fixture.id] ?? {}
      const entries = Object.entries(source).filter(([attribute, value]) => supported.has(attribute) && Number.isFinite(value) &&
        (category === 'color' ? color.test(attribute) : category === 'position' ? position.has(attribute) : category === 'intensity' ? attribute === 'intensity' : !color.test(attribute) && !position.has(attribute) && attribute !== 'intensity'))
      if (entries.length) fixtureValues[fixture.id] = Object.fromEntries(entries)
    }
    if (!Object.keys(fixtureValues).length) return state
    const preset: PresetDef = { id: crypto.randomUUID(), name: name.trim(), category, fixtureValues }
    const presets = [...state.presets, preset]
    return persistState(state, { presets }, { presets })
  }),
  convertScenesToPresets: () => {
    const state = get()
    const existing = new Set(state.presets.map((p) => p.id))
    const converted = scenesToPresets(state.scenes, state.show?.fixtures ?? []).filter((p) => !existing.has(p.id))
    if (!converted.length) return 0
    set((current) => {
      const presets = [...current.presets, ...converted]
      return persistState(current, { presets }, { presets })
    })
    return converted.length
  },
  togglePreset: (id) => set((state) => {
    if (!state.presets.some((preset) => preset.id === id)) return state
    const activePresetIds = activateGroupedPreset(state.activePresetIds, id, state.show?.presetGroups ?? [])
    return { activePresetIds }
  }),
  toggleSequence: (id) => set((state) => state.show?.sequences?.some((s) => s.id === id) ? { activeSequenceIds: state.activeSequenceIds.includes(id) ? state.activeSequenceIds.filter((item) => item !== id) : [...state.activeSequenceIds, id] } : state),
  stopSequences: () => set({ activeSequenceIds: [] }),
  clearPresets: () => set({ activePresetIds: [] }),
  createSequence: (name) => set((state) => {
    if (!name.trim()) return state
    const values = structuredClone(state.scenes.find((s) => s.id === state.activeSceneId)?.fixtureValues ?? {})
    for (const [id, patch] of Object.entries(state.manualOverrides)) values[id] = { ...values[id], ...patch }
    const sequence: SequenceDef = { id: crypto.randomUUID(), name: name.trim(), order: 'forward', loop: false, timing: 'manual', stepsPerBeat: 1, steps: [{ id: crypto.randomUUID(), name: 'Step 1', fixtureValues: values, presetIds: [], fadeMs: 1000, holdMs: 0 }] }
    return persistState(state, { sequences: [...(state.show?.sequences ?? []), sequence] })
  }),
  updateSequence: (id, patch) => set((state) => persistState(state, { sequences: (state.show?.sequences ?? []).map((s) => s.id === id ? { ...s, ...structuredClone(patch), id } : s) })),
  addSequenceStep: (id) => {
    const state = get(), sequence = state.show?.sequences?.find((s) => s.id === id)
    if (!sequence) return
    const fixtureValues = structuredClone(state.scenes.find((s) => s.id === state.activeSceneId)?.fixtureValues ?? {})
    for (const [fixtureId, patch] of Object.entries(state.manualOverrides)) fixtureValues[fixtureId] = { ...fixtureValues[fixtureId], ...patch }
    get().updateSequence(id, { steps: [...sequence.steps, { id: crypto.randomUUID(), name: `Step ${sequence.steps.length + 1}`, fixtureValues, presetIds: [], fadeMs: 0, holdMs: 1000 }] })
  },
  removeSequenceStep: (id, stepId) => { const sequence = get().show?.sequences?.find((s) => s.id === id); if (sequence) get().updateSequence(id, { steps: sequence.steps.filter((s) => s.id !== stepId) }) },
  duplicateSequenceStep: (id, stepId) => {
    const sequence = get().show?.sequences?.find((s) => s.id === id), index = sequence?.steps.findIndex((s) => s.id === stepId) ?? -1
    if (!sequence || index < 0) return
    const steps = [...sequence.steps]; steps.splice(index + 1, 0, { ...structuredClone(steps[index]), id: crypto.randomUUID(), name: `${steps[index].name} copy` }); get().updateSequence(id, { steps })
  },
  moveSequenceStep: (id, stepId, toIndex) => {
    const sequence = get().show?.sequences?.find((s) => s.id === id), index = sequence?.steps.findIndex((s) => s.id === stepId) ?? -1
    if (!sequence || index < 0) return
    const steps = [...sequence.steps], [step] = steps.splice(index, 1); steps.splice(Math.max(0, Math.min(steps.length, toIndex)), 0, step); get().updateSequence(id, { steps })
  },
  reorderSequenceSteps: (id, order, seed = Date.now()) => { const sequence = get().show?.sequences?.find((s) => s.id === id); if (sequence) get().updateSequence(id, { steps: sequenceOrder(sequence.steps.length, order, seed).map((index) => sequence.steps[index]) }) },
  deleteSequence: (id) => set((state) => persistState(state, { sequences: state.show?.sequences?.filter((s) => s.id !== id), presetGroups: state.show?.presetGroups?.map((g) => ({ ...g, sequenceIds: g.sequenceIds?.filter((item) => item !== id) })) })),
  createPresetGroup: (name, parentId = null) => set((state) => {
    const groups = state.show?.presetGroups ?? []
    if (!name.trim() || (parentId && !groups.some((g) => g.id === parentId))) return state
    return persistState(state, { presetGroups: [...groups, { id: crypto.randomUUID(), name: name.trim(), parentId, exclusive: false, presetIds: [] }] })
  }),
  updatePresetGroup: (id, patch) => set((state) => {
    const groups = state.show?.presetGroups ?? []
    if (patch.parentId !== undefined && !canParentGroup(groups, id, patch.parentId)) return state
    return persistState(state, { presetGroups: groups.map((g) => g.id === id ? { ...g, ...patch, id, name: patch.name?.trim() || g.name } : g) })
  }),
  assignPresetGroup: (presetId, groupId) => set((state) => {
    if (!state.presets.some((p) => p.id === presetId) || !state.show?.presetGroups?.some((g) => g.id === groupId)) return state
    return persistState(state, { presetGroups: state.show.presetGroups.map((g) => ({ ...g, presetIds: [...g.presetIds.filter((id) => id !== presetId), ...(g.id === groupId ? [presetId] : [])] })) })
  }),
  deletePresetGroup: (id) => set((state) => {
    const groups = state.show?.presetGroups ?? [], removed = groups.find((g) => g.id === id)
    if (!removed) return state
    const remaining = groups.filter((g) => g.id !== id).map((g) => ({ ...g, parentId: g.parentId === id ? removed.parentId : g.parentId, presetIds: g.id === removed.parentId ? [...g.presetIds, ...removed.presetIds] : g.presetIds }))
    return persistState(state, { presetGroups: syncPresetGroups(remaining, state.presets) })
  }),
  applyPresetsToOverrides: (ids, selectedOnly = false) => set((state) => {
    const manualOverrides = structuredClone(state.manualOverrides)
    for (const id of ids) for (const [fixtureId, values] of Object.entries(state.presets.find((p) => p.id === id)?.fixtureValues ?? {})) {
      if (selectedOnly && !state.selectedFixtureIds.includes(fixtureId)) continue
      manualOverrides[fixtureId] = { ...manualOverrides[fixtureId], ...values }
    }
    return { manualOverrides }
  }),
  addOverridesToPresets: (ids, selectedOnly = false) => set((state) => {
    const presets = state.presets.map((preset) => {
      if (!ids.includes(preset.id)) return preset
      const fixtureValues = structuredClone(preset.fixtureValues)
      for (const [fixtureId, values] of Object.entries(state.manualOverrides)) {
        if (selectedOnly && !state.selectedFixtureIds.includes(fixtureId)) continue
        fixtureValues[fixtureId] = { ...fixtureValues[fixtureId], ...values }
      }
      return { ...preset, fixtureValues }
    })
    return persistState(state, { presets }, { presets })
  }),
  updatePresetContents: (id, values) => set((state) => {
    const presets = state.presets.map((preset) => preset.id === id ? { ...preset, fixtureValues: structuredClone(values) } : preset)
    return persistState(state, { presets }, { presets })
  }),
  updatePresetFromCurrent: (id) => {
    const state = get(), preset = state.presets.find((p) => p.id === id)
    if (!preset || !state.show) return
    const fixtureValues = structuredClone(preset.fixtureValues)
    for (const fixture of state.show.fixtures.filter((f) => state.selectedFixtureIds.includes(f.id))) {
      const values = { ...state.scenes.find((s) => s.id === state.activeSceneId)?.fixtureValues[fixture.id] }
      for (const activeId of state.activePresetIds) Object.assign(values, state.presets.find((p) => p.id === activeId)?.fixtureValues[fixture.id])
      Object.assign(values, state.manualOverrides[fixture.id])
      const allowed = fixtureAttributes(fixture)
      const patch = Object.fromEntries(Object.entries(values).filter(([attribute]) => allowed.includes(attribute) && matchesPresetCategory(attribute, preset.category)))
      if (Object.keys(patch).length) fixtureValues[fixture.id] = { ...fixtureValues[fixture.id], ...patch }
    }
    get().updatePresetContents(id, fixtureValues)
  },
  removePresetProperty: (id, fixtureId, attribute) => {
    const preset = get().presets.find((p) => p.id === id)
    if (!preset) return
    const values = structuredClone(preset.fixtureValues)
    if (attribute && values[fixtureId]) { delete values[fixtureId][attribute]; if (!Object.keys(values[fixtureId]).length) delete values[fixtureId] }
    else delete values[fixtureId]
    get().updatePresetContents(id, values)
  },
  renamePreset: (id, name) => set((state) => {
    if (!name.trim()) return state
    const presets = state.presets.map((preset) => preset.id === id ? { ...preset, name: name.trim() } : preset)
    return persistState(state, { presets }, { presets })
  }),
  deletePreset: (id) => set((state) => {
    const presets = state.presets.filter((preset) => preset.id !== id)
    return persistState(state, { presets }, { presets, activePresetIds: state.activePresetIds.filter((item) => item !== id) })
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
      const existingScene = state.scenes.find((scene) => scene.id === state.activeSceneId)
      const selectedFixtureIds = state.selectedFixtureIds.filter((id) =>
        state.show?.fixtures.some((fixture) => fixture.id === id)
      )
      if (!state.show || selectedFixtureIds.length === 0) return state

      const patch: Record<string, number> = {}
      for (const [attribute, value] of Object.entries(values)) {
        if (Number.isFinite(value)) patch[attribute] = clamp(value)
      }
      if (Object.keys(patch).length === 0) return state

      const activeScene: SceneDef = existingScene ?? {
        id: crypto.randomUUID(), name: `Scene ${state.scenes.length + 1}`, fadeMs: 1000,
        fixtureValues: Object.fromEntries(state.show.fixtures.map((fixture) => [fixture.id, defaultFixtureValues(fixture)]))
      }
      const selected = new Set(selectedFixtureIds)
      const sourceScenes = existingScene ? state.scenes : [...state.scenes, activeScene]
      const scenes = sourceScenes.map((scene) => {
        if (scene.id !== activeScene.id) return scene
        const fixtureValues = { ...scene.fixtureValues }
        for (const fixtureId of selected) {
          fixtureValues[fixtureId] = { ...(fixtureValues[fixtureId] ?? {}), ...patch }
        }
        return { ...scene, fixtureValues }
      })
      const updatedScene = scenes.find((scene) => scene.id === activeScene.id)
      if (updatedScene && !state.blackout) sendImmediate(sceneOutput(state, updatedScene))
      return persistState(state, { scenes }, { scenes, activeSceneId: activeScene.id, cuePlaying: false })
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
        inStorage: true,
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

  addProfileFixtures: (profile, options) => set((state) => {
    const fixtures = allocateFixtures(state.show?.fixtures ?? [], profile, options)
    const scenes = state.scenes.map((scene) => ({ ...scene, fixtureValues: { ...scene.fixtureValues, ...Object.fromEntries(fixtures.map((fixture) => [fixture.id, defaultFixtureValues(fixture)])) } }))
    return persistState(state, { fixtures: [...(state.show?.fixtures ?? []), ...fixtures], scenes }, { scenes })
  }),
  saveFixtureProfile: (profile) => set((state) => {
    const errors = validateProfile(profile)
    if (errors.length) throw new Error(errors.join('; '))
    if (BUILTIN_PROFILES.some((p) => p.id === profile.id)) throw new Error('Duplicate built-in profiles before editing')
    const fixtureProfiles = [...(state.show?.fixtureProfiles ?? []).filter((p) => p.id !== profile.id), structuredClone(profile)]
    return persistState(state, { fixtureProfiles })
  }),
  deleteFixtureProfile: (id) => set((state) => persistState(state, { fixtureProfiles: (state.show?.fixtureProfiles ?? []).filter((p) => p.id !== id) })),
  duplicateFixture: (id) => set((state) => {
    const original = state.show?.fixtures.find((f) => f.id === id)
    if (!original) return state
    const copy: FixtureDef = { ...structuredClone(original), id: crypto.randomUUID(), name: `${original.name} copy`, channelStart: nextFreeChannel(state.show!.fixtures), inStorage: true }
    if (copy.channelStart + copy.channels - 1 > 512) throw new Error('No free channels for the duplicate')
    const scenes = state.scenes.map((s) => ({ ...s, fixtureValues: { ...s.fixtureValues, ...(s.fixtureValues[id] ? { [copy.id]: { ...s.fixtureValues[id] } } : {}) } }))
    const presets = state.presets.map((p) => ({ ...p, fixtureValues: { ...p.fixtureValues, ...(p.fixtureValues[id] ? { [copy.id]: { ...p.fixtureValues[id] } } : {}) } }))
    return persistState(state, { fixtures: [...state.show!.fixtures, copy], scenes, presets }, { scenes, presets })
  }),
  reassignFixtureProfile: (id, profile, modeId) => {
    const mode = profile.modes.find((m) => m.id === modeId) ?? profile.modes[0]
    const fixture = get().show?.fixtures.find((f) => f.id === id)
    if (!mode || !fixture || !mode.channels.length) return
    const channels = Math.max(...mode.channels.map((c) => c.number)) + 1
    if (fixture.channelStart + channels - 1 > 512) throw new Error('The selected mode exceeds the universe')
    get().updateFixture(id, { profile: structuredClone(profile), profileId: profile.id, modeId: mode.id, type: profile.legacyType, channels })
  },

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

  setFixturePosition: (id, position) =>
    set((state) => {
      if (!state.show || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return state
      const fixtures = state.show.fixtures.map((fixture) => fixture.id === id
        ? { ...fixture, inStorage: false, previewPosition: { x: Math.max(0, Math.min(800, position.x)), y: Math.max(0, Math.min(340, position.y)) } }
        : fixture)
      return persistState(state, { fixtures })
    }),

  setFixturePositions: (positions) => set((state) => {
    if (!state.show) return state
    const fixtures = state.show.fixtures.map((fixture) => {
      const p = positions[fixture.id]
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { ...fixture, inStorage: false, previewPosition: { x: Math.max(0, Math.min(800, p.x)), y: Math.max(0, Math.min(340, p.y)) } } : fixture
    })
    return persistState(state, { fixtures })
  }),
  setPreviewTrusses: (previewTrusses) => set((state) => {
    const original = state.show?.stageObjects ?? []
    const byId = new Map(previewTrusses.map((truss) => [truss.id, truss]))
    const stageObjects: StageObject[] = original.filter((object) => object.kind !== 'truss' || byId.has(object.id)).map((object) => object.kind === 'truss' ? { ...object, ...byId.get(object.id)!, trussShape: byId.get(object.id)!.shape } : object)
    for (const truss of previewTrusses) if (!stageObjects.some((o) => o.id === truss.id)) stageObjects.push({ ...truss, kind: 'truss', trussShape: truss.shape })
    return persistState(state, { previewTrusses, stageObjects })
  }),
  setStageObjects: (stageObjects) => set((state) => persistState(state, { stageObjects, previewTrusses: stageObjects.filter((o) => o.kind === 'truss').map((o) => ({ ...o, shape: o.trussShape ?? 'straight' })) })),
  addStageObject: (object) => get().setStageObjects([...(get().show?.stageObjects ?? []), object]),
  updateStageObject: (id, patch) => get().setStageObjects((get().show?.stageObjects ?? []).map((o) => o.id === id ? { ...o, ...sanitizeStageObjectPatch(patch), id: o.id } : o)),
  removeStageObjects: (ids) => get().setStageObjects((get().show?.stageObjects ?? []).filter((o) => !ids.includes(o.id))),
  copyStageObjects: (ids) => set({ stageClipboard: structuredClone((get().show?.stageObjects ?? []).filter((o) => ids.includes(o.id))) }),
  pasteStageObjects: () => {
    const objects = get().stageClipboard.map((o) => ({ ...structuredClone(o), id: crypto.randomUUID(), x: o.x + 20, y: o.y + 20 }))
    get().setStageObjects([...(get().show?.stageObjects ?? []), ...objects]); set({ stageClipboard: structuredClone(objects) }); return objects.map((o) => o.id)
  },
  duplicateStageObjects: (ids) => {
    const objects = (get().show?.stageObjects ?? []).filter((o) => ids.includes(o.id)).map((o) => ({ ...structuredClone(o), id: crypto.randomUUID(), x: o.x + 20, y: o.y + 20 }))
    get().setStageObjects([...(get().show?.stageObjects ?? []), ...objects]); return objects.map((o) => o.id)
  },
  flipStageObjects: (ids, axis) => get().setStageObjects((get().show?.stageObjects ?? []).map((o) => ids.includes(o.id) ? { ...o, [axis === 'x' ? 'flipX' : 'flipY']: !(axis === 'x' ? o.flipX : o.flipY) } : o)),
  orderStageObjects: (ids, side) => {
    const objects = get().show?.stageObjects ?? [], selected = objects.filter((o) => ids.includes(o.id)), others = objects.filter((o) => !ids.includes(o.id))
    get().setStageObjects(side === 'front' ? [...others, ...selected] : [...selected, ...others])
  },

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
      const presets = state.presets.map((preset) => { const fixtureValues = { ...preset.fixtureValues }; delete fixtureValues[id]; return { ...preset, fixtureValues } })
      const livePages = state.show?.livePages?.map((page) => ({ ...page, controls: page.controls.map((control) => { const adHocValues = { ...control.adHocValues }; delete adHocValues[id]; return { ...control, adHocValues } }) }))
      return persistState(
        state,
        { fixtures, scenes, automations, effects, presets, livePages },
        {
          scenes,
          presets,
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
        cuePlaying: true,
        cueRevision: state.cueRevision + 1
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
        cuePlaying: true,
        cueRevision: state.cueRevision + 1
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
        cuePlaying: true,
        cueRevision: state.cueRevision + 1
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
 }
  const editingCommands = ['addSequenceStep', 'removeSequenceStep', 'duplicateSequenceStep', 'moveSequenceStep', 'reorderSequenceSteps', 'createSequence', 'updateSequence', 'deleteSequence', 'createPresetGroup', 'updatePresetGroup', 'assignPresetGroup', 'deletePresetGroup', 'applyPresetsToOverrides', 'addOverridesToPresets', 'updatePresetContents', 'updatePresetFromCurrent', 'removePresetProperty', 'saveFan', 'deleteFan', 'pasteFixtureProperties', 'setSelectedColor', 'updateSelectedBeamValues', 'createFixtureGroup', 'renameFixtureGroup', 'parentFixtureGroup', 'moveFixtureGroup', 'removeFixtureGroup', 'saveFixtureProfile', 'deleteFixtureProfile', 'reassignFixtureProfile', 'duplicateFixture', 'addProfileFixtures', 'locateFixtures', 'pasteStageObjects', 'duplicateStageObjects', 'flipStageObjects', 'orderStageObjects', 'setStageObjects', 'addStageObject', 'updateStageObject', 'removeStageObjects', 'setShow', 'setLivePages', 'dropOnLivePage', 'moveSelectedPageObjects', 'resizePageObject', 'renamePageObject', 'attachPageObject', 'setPageObjectStyle', 'configureFrame', 'deleteSelectedPageObjects', 'duplicateSelectedPageObjects', 'pastePageObjects', 'updateProject', 'setStartupMode', 'setAudioPath', 'setIsPlaying', 'groupSelectedFixtures', 'updateSelectedFixtures', 'setManualOverrides', 'capturePreset', 'convertScenesToPresets', 'renamePreset', 'deletePreset', 'addScene', 'duplicateScene', 'updateScene', 'deleteScene', 'addFixture', 'updateFixture', 'setFixturePosition', 'setFixturePositions', 'setPreviewTrusses', 'removeFixture', 'addAutomation', 'updateAutomation', 'removeAutomation', 'addEffect', 'updateEffect', 'removeEffect', 'addCueList', 'updateCueList', 'renameCueList', 'removeCueList', 'addCueStep', 'updateCueStep', 'removeCueStep', 'moveCueStep', 'setMidiMappings', 'addMidiMapping', 'removeMidiMapping', 'undo', 'redo'] as const
  const mutable = actions as unknown as Record<string, unknown>
  for (const command of editingCommands) {
    const action = mutable[command] as (...args: unknown[]) => unknown
    mutable[command] = (...args: unknown[]) => { if (!get().locked) return action(...args) }
  }
  return actions
})
