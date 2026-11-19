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
  /** Short name (≤4 chars) shown in the Preview; the full name stays for lists and panels (Guide p.30). */
  shortName?: string
  /** Count > 1: that many Preview icons of this fixture, sharing one DMX address and properties (Guide p.30) — but each icon is its own placeable instance with its own position (see previewPositions). */
  count?: number
  /** Chosen LED count for a flexible strip/matrix mode (Guide p.29, FLEX); undefined means the mode default. */
  ledCount?: number
  type: FixtureType
  channelStart: number // 1-based DMX channel
  channels: number
  group?: string
  previewPosition?: { x: number; y: number }
  /** Per-instance Preview positions, index i = instance i of a Count
   * fixture; instance 0 falls back to previewPosition when absent. A
   * fixture patched before per-instance positions existed has neither
   * and falls back to the legacy fan-out (see previewLayout). */
  previewPositions?: { x: number; y: number }[]
  inStorage?: boolean
  iconSize?: number
  namePosition?: 'above' | 'below' | 'hidden'
  previewBeam?: { direction: number | 'auto'; color?: string }
  rotation?: number
}

export interface CueDef {
  fans?: FanDef[]
  id: string
  name: string
  /** Presets this cue is built from, in the order they apply — where two
   *  presets define the same fixture property, the later one wins
   *  (LightKey Guide ch.11, "Edit cue contents", p.199). Editing a preset
   *  updates every cue that references it: values are resolved by
   *  reference at read time (see shared/cueResolution.ts), never copied. */
  presetIds?: string[]
  /** Sequences that run while this cue is active. */
  sequenceIds?: string[]
  /** Ad-hoc properties — the cue's own values (LightKey's "Ad hoc
   *  properties" item, Guide ch.11 p.201): fixture properties with no
   *  preset, or properties the operator set on the cue itself. Applied
   *  last when the cue resolves, so they win over any preset. The Design
   *  panel, fanning and colour writes all target this layer. */
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
  order: 'selection' | 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top' | 'name' | 'address'
  start: number
  end: number
  // Colour fans (attribute 'color', LightKey Guide §8 + "How to Use
  // Fanning" video): the fanned value is a colour, not a number — the
  // endpoints and any intermediate anchors carry hex colours, and the
  // numeric start/end are unused. Anchor entries carry `color` instead
  // of a numeric value for colour fans.
  startColor?: string
  endColor?: string
  considerSpacing?: boolean
  anchors?: { index: number; value: number; color?: string }[]
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

export type MidiTargetType = 'cue' | 'preset' | 'sequence' | 'live-cue' | 'blackout' | 'blind' | 'freeze' | 'cue-next' | 'cue-prev' | 'tap-tempo' | 'master'

export interface MidiMapping {
  id: string
  targetType: MidiTargetType
  targetId: string | null // cue id / cue list id, null for blackout & master
  midiType: 'noteon' | 'noteoff' | 'cc'
  trigger?: 'press' | 'release' | 'value'
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
  cueId: string
  fadeMs: number
  holdMs: number // time to wait before auto-advancing
  groupId?: string
}

export interface CueListDef {
  id: string
  name: string
  steps: CueStepDef[]
  loop?: boolean
}

export type EffectWaveform = 'sine' | 'triangle' | 'square' | 'saw' | 'random' | 'cosine' | 'pulse' | 'smooth'

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
  owner?: { type: 'preset' | 'sequence' | 'cue'; id: string }
  phaseSpread: number // degrees of fan-out across targeted fixtures
  fixtureOrder?: 'forward' | 'reverse' | 'random' | 'custom'
  customFixtureOrder?: string[]
  minValue?: number
  maxValue?: number
  blendMode?: 'replace' | 'add' | 'max'
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
  cueId?: string
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
  timing?: { fadeInMs: number; fadeOutMs: number; delayMs: number; curve: FadeCurve }
  appearance?: { color: string; releaseOthers: boolean }
  modifiers?: { intensity: number; speed: number; size: number }
  priority?: number
  frameStep?: 'next' | 'previous'
}

export type FadeCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 's-curve'

export interface LivePage {
  id: string
  name: string
  /** 'page' is a plain button page; 'cuelist' is a page built around a cue list (Guide ch.11, p.176). */
  kind?: 'page' | 'cuelist'
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
  startup?: { mode: 'none' | 'restore'; presetIds?: string[]; liveValues?: Record<string, number>; pageId?: string | null; cueId?: string | null }
  schemaVersion?: number // Missing in legacy version-0 project inputs.
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
  fixtures: FixtureDef[]
  previewTrusses?: PreviewTruss[]
  livePages?: LivePage[]
  cues: CueDef[]
  presets?: PresetDef[]
  automations: AutomationDef[]
  cueLists?: CueListDef[]
  midiMappings?: MidiMapping[]
  effects?: EffectDef[]
  effectTemplates?: EffectDef[]
  masterIntensity?: number // 0-255
  bpm?: number
  audioPath?: string
  preferences?: {
    defaultFadeMs: number
    pageFadeMs: number
    theme: 'dark' | 'system'
    dmxProtocol: SerialDmxProtocol
  }
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
  /** Original OFL document is retained so unsupported metadata is never lost. */
  ofl?: { manufacturerKey: string; fixtureKey: string; source?: unknown }
  modes: { id: string; name: string; channels: FixtureChannel[]; beams?: { id: string; name: string; properties: Record<string, string> }[]; flexibleLeds?: { channelsPerLed: number; maxLeds: number; defaultLeds: number; minLeds?: number } }[]
}

export const FIXTURE_PRESETS: FixturePreset[] = BUILTIN_PROFILES.map((profile) => ({ id: profile.id, name: profile.name, type: profile.legacyType, channels: Math.max(...profile.modes[0].channels.map((c) => c.number)) + 1 }))
