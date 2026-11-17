import { BUILTIN_PROFILES } from './fixtureProfiles'
export type FixtureType =
  | 'par'
  | 'led-wash'
  | 'moving-head'
  | 'dimmer'
  | 'generic-led'
  | 'pixel-bar-17ch'
  | 'rgba-4ch'
  | 'rgbw-4ch'

export interface FixtureDef {
  universe?: number
  notes?: string
  disabled?: boolean
  positionOptions?: { invertPan?: boolean; invertTilt?: boolean; swapPanTilt?: boolean }
  propertyOrder?: string[]
  hiddenProperties?: string[]
  defaultValues?: Record<string, number>
  profileId?: string
  modeId?: string
  profile?: FixtureProfile
  id: string
  name: string
  type: FixtureType
  channelStart: number // 1-based DMX channel
  channels: number
  group?: string
  previewPosition?: { x: number; y: number }
  inStorage?: boolean
  iconSize?: number
  namePosition?: 'above' | 'below' | 'hidden'
  previewBeam?: { direction: number | 'auto'; color?: string }
  rotation?: number
}

export interface SceneDef {
  fans?: FanDef[]
  id: string
  name: string
  fixtureValues: Record<string, Record<string, number>> // fixtureId -> attribute -> value (0-255)
  fadeMs: number
  blackout?: boolean
}

export type PresetCategory = 'intensity' | 'color' | 'position' | 'other'
export interface PresetDef {
  fans?: FanDef[]
  id: string
  name: string
  category: PresetCategory
  fixtureValues: Record<string, Record<string, number>>
}

export interface FanDef {
  id: string
  attribute: string
  fixtureIds: string[]
  mode: 'linear' | 'centre' | 'reverse'
  order: 'selection' | 'left-right' | 'top-bottom' | 'name' | 'address'
  start: number
  end: number
  considerSpacing?: boolean
  anchors?: { index: number; value: number }[]
}

export interface SequenceStep {
  beats?: number
  id: string
  name: string
  fixtureValues: Record<string, Record<string, number>>
  presetIds: string[]
  fans?: FanDef[]
  fadeMs: number
  holdMs: number
}
export interface SequenceDef {
  timeScale?: number
  repeatCount?: number
  freezeOnCompletion?: boolean
  id: string
  name: string
  steps: SequenceStep[]
  order: 'forward' | 'backward' | 'bounce' | 'random'
  loop: boolean
  timing: 'manual' | 'beat'
  stepsPerBeat: number
}

export interface AutomationPoint {
  t: number // seconds from song start
  v: number // 0-255
}

export type MidiTargetType = 'scene' | 'blackout' | 'cue-next' | 'master'

export interface MidiMapping {
  id: string
  targetType: MidiTargetType
  targetId: string | null // scene id / cue list id, null for blackout & master
  midiType: 'noteon' | 'cc'
  channel: number // 1-16
  number: number // note / CC number 0-127
  name?: string
}

export interface AutomationDef {
  id: string
  name: string
  fixtureId: string
  attribute: string // e.g. 'intensity', 'red', 'pan', 'tilt', 'strobe'
  points: AutomationPoint[]
}

export interface CueStepDef {
  id: string
  sceneId: string
  fadeMs: number
  holdMs: number // time to wait before auto-advancing
}

export interface CueListDef {
  id: string
  name: string
  steps: CueStepDef[]
  loop?: boolean
}

export type EffectWaveform = 'sine' | 'triangle' | 'square' | 'saw' | 'random'

export interface EffectDef {
  id: string
  name: string
  fixtureIds: string[] // empty = all fixtures
  attribute: string // e.g. 'intensity', 'pan', 'tilt', 'red'
  waveform: EffectWaveform
  speed: number // cycles per beat when synced, cycles per second otherwise
  syncToBpm: boolean
  size: number // depth, 0-255
  offset: number // centre value, 0-255
  phaseSpread: number // degrees of fan-out across targeted fixtures
  enabled: boolean
}

export interface PreviewTruss {
  id: string
  name: string
  shape: 'u' | 'straight'
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

/** Text formatting for Live page objects (7.8). */
export interface LiveObjectStyle {
  fontSize?: number
  bold?: boolean
  italic?: boolean
  color?: string
  align?: 'left' | 'center' | 'right'
}

export type LiveObjectKind = 'cue' | 'list' | 'label' | 'frame'
export type LiveDefaultStyles = Partial<Record<LiveObjectKind, LiveObjectStyle>>

/** Configuration for a frame annotation (7.9). Percentages default to 100. */
export interface FrameConfig {
  /** When true, activating one cue in the frame releases the others. */
  exclusive?: boolean
  /** Intensity modifier applied to cues in the frame, as a percentage (0–200). */
  intensity?: number
  /** Speed modifier for effects on cues in the frame, as a percentage (0–200). */
  speed?: number
}

export interface LiveControl {
  id: string
  name: string
  type: 'toggle' | 'flash' | 'fader'
  sceneId?: string
  presetIds: string[]
  /** Sequences started while this cue is active (7.10). */
  sequenceIds?: string[]
  adHocValues?: Record<string, Record<string, number>>
  x?: number
  y?: number
  width?: number
  height?: number
  /** Id of another object on this page; this object moves with it (7.7). */
  attachedTo?: string
  style?: LiveObjectStyle
}

export interface LivePage {
  id: string
  name: string
  controls: LiveControl[]
  cueListWidgets?: { id: string; cueListId: string; x: number; y: number; width?: number; height?: number; attachedTo?: string; style?: LiveObjectStyle }[]
  annotations?: { id: string; type: 'label' | 'frame'; text: string; x: number; y: number; width: number; height: number; attachedTo?: string; style?: LiveObjectStyle; frame?: FrameConfig }[]
  fadeMs?: number
  /** Styles applied to newly created objects on this page (7.8). */
  defaultStyles?: LiveDefaultStyles
}

export interface ShowDef {
  sequences?: SequenceDef[]
  presetGroups?: PresetGroup[]
  colorFavorites?: string[]
  fixtureGroups?: FixtureGroup[]
  fixtureProfiles?: FixtureProfile[]
  favoriteProfileIds?: string[]
  stageObjects?: StageObject[]
  layout?: { preview: boolean; palette: boolean; inspector: boolean }
  /** When true, switching Live pages releases cues instead of restoring that page's active levels. */
  deactivateOnPageSwitch?: boolean
  startup?: { mode: 'none' | 'restore'; presetIds?: string[]; liveValues?: Record<string, number>; pageId?: string | null; sceneId?: string | null }
  schemaVersion?: number // Missing in legacy version-0 project inputs.
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
  fixtures: FixtureDef[]
  previewTrusses?: PreviewTruss[]
  livePages?: LivePage[]
  scenes: SceneDef[]
  presets?: PresetDef[]
  automations: AutomationDef[]
  cueLists?: CueListDef[]
  midiMappings?: MidiMapping[]
  effects?: EffectDef[]
  masterIntensity?: number // 0-255
  bpm?: number
  audioPath?: string
}

export interface FixtureGroup { id: string; name: string; parentId?: string | null; fixtureIds: string[] }
export interface PresetGroup { id: string; name: string; parentId?: string | null; exclusive: boolean; presetIds: string[]; sequenceIds?: string[] }

export interface StageObject {
  id: string
  kind: 'rectangle' | 'ellipse' | 'line' | 'image' | 'text' | 'truss'
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fill?: string
  stroke?: string
  opacity?: number
  text?: string
  imageSrc?: string
  fontSize?: number
  flipX?: boolean
  flipY?: boolean
  trussShape?: PreviewTruss['shape']
}

export interface DmxStatus {
  connected: boolean
  port: string | null
  baudRate: number
  lastFrameAt: number | null
  frameCount: number
  universe: number
  error: string | null
  mode: 'virtual' | 'serial' | 'artnet'
  serialProtocol?: SerialDmxProtocol
  artnet?: { host: string; universe: number }
}

export type SerialDmxProtocol = 'open-dmx-usb' | 'enttec-usb-pro'

export interface DmxPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  locationId?: string
  productId?: string
  vendorId?: string
}

export interface FixturePreset {
  id: string
  name: string
  type: FixtureType
  channels: number
}

export interface FixtureChannel {
  control?: 'slider' | 'color-wheel' | 'gobo-wheel' | 'options'
  slots?: { id: string; name: string; from: number; to: number; kind: 'slot' | 'spin' | 'scroll' }[]
  number: number // zero-based offset within the fixture mode
  attribute: string
  propertyType: 'intensity' | 'color' | 'position' | 'other'
  min: number
  max: number
  defaultValue: number
  highlightValue: number
}
export interface FixtureProfile {
  id: string
  name: string
  manufacturer: string
  legacyType: FixtureType
  modes: { id: string; name: string; channels: FixtureChannel[]; beams?: { id: string; name: string; properties: Record<string, string> }[] }[]
}

export const FIXTURE_PRESETS: FixturePreset[] = BUILTIN_PROFILES.map((profile) => ({ id: profile.id, name: profile.name, type: profile.legacyType, channels: Math.max(...profile.modes[0].channels.map((c) => c.number)) + 1 }))
