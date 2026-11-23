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
  /** Hide the virtual light beam in the Preview (LightKey Fixture Options,
   *  Guide p.62; wizard Build Your Preview step, video 04:45). The fixture
   *  still outputs DMX — only the drawn beam is hidden. */
  hideBeam?: boolean
  /** Ignore the Master Dimmer for this fixture (LightKey Fixture Options,
   *  Guide p.62; wizard Build Your Preview step, video 04:45). The master
   *  fader never scales this fixture's output. */
  ignoreMasterDimmer?: boolean
  /** Minimum/maximum dimmer (LightKey Fixture Options, Guide p.62): the
   *  dimmer values sent when the fixture's Dimmer is Off / Full. Applied
   *  at the DMX output only — the Preview beam is unaffected in LightKey,
   *  but OpenLights' Preview reads the sent frame, so the limit shows
   *  there too (see NOTES.md). Absent = 0 / 255. */
  minDimmer?: number
  maxDimmer?: number
  positionOptions?: { invertPan?: boolean; invertTilt?: boolean; swapPanTilt?: boolean }
  propertyOrder?: string[]
  hiddenProperties?: string[]
  defaultValues?: Record<string, number>
  profileId?: string
  modeId?: string
  profile?: FixtureProfile
  /** Beam-direction calibration (Piece 4, LightKey Guide pp.58–60) —
   *  home direction, rotation flip, pan/tilt limits and perspective.
   *  Absent = uncalibrated; every field optional, defaulted in
   *  lib/calibration.ts. */
  calibration?: FixtureCalibration
  id: string
  name: string
  /** Short name (≤4 chars) shown in the Preview; the full name stays for lists and panels (Guide p.30). */
  shortName?: string
  /** External reference, LightKey's "Ext. reference" field on the Patching tab of the patch dialog. */
  extReference?: string
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
  previewBeam?: { direction: number | 'auto' }
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
  /** When set, the fan distributes over these beams (cells) in listed
   *  order instead of over fixtures — LightKey Guide §8 p.119: the
   *  Fanning HUD "offers beams vs fixtures" for multi-beam fixtures.
   *  Unset (the default) fans across fixtures as before. */
  beams?: { fixtureId: string; beamId: string }[]
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

/** LightKey Guide ch.10, pp.146-175: the three kinds of effects. */
export type EffectKind = 'pattern' | 'curve' | 'movement'

export type PatternEffect = 'chase' | 'scanner' | 'yo-yo' | 'fill' | 'rain' | 'meteor' | 'sparkle' | 'fire' | 'jellyfish' | 'snakes'

/** One sample of a pattern effect (Guide p.153): an intensity value (0-100%) or a color. */
export interface EffectSample {
  id: string
  /** Intensity sample, 0-100. */
  value?: number
  /** Color sample, hex RGB (e.g. '#ff0000'). */
  color?: string
}

/** One control point of a drawable curve effect (Guide pp.161-164): x is time 0-1 across the
 *  effect duration, y is the property value 0-1. */
export interface CurveControlPoint {
  id: string
  x: number
  y: number
}

/** One component curve of a curve effect (Guide p.161): Color has one curve per color-model
 *  component, Position has pan and tilt curves, other properties have a single curve. */
export interface CurveComponent {
  component: string
  points: CurveControlPoint[]
  /** Segment i (between point i and point i+1) is curved when true, straight when false. */
  curvedSegments: boolean[]
}

/** A movement path (Guide pp.165-171): two or more control points in normalized pan/tilt
 *  coordinates (-1..1). Paths are stored independently of effects so they can be reused.
 *  Built-in paths are Circle, Figure Eight and Line; editing a built-in path duplicates it. */
export interface MovementPathDef {
  id: string
  name: string
  builtIn?: boolean
  type: 'smooth' | 'line' | 'points'
  points: { pan: number; tilt: number }[]
}

/** LightKey Guide ch.10, p.150: timing modes for effects. */
export type EffectTimingMode = 'fixed' | 'beat' | 'random'

/** LightKey Guide ch.10, pp.151-152: fixture (pixel) order for an effect. */
export type EffectFixtureOrder =
  | 'forward' | 'reverse' | 'random' | 'custom'
  | 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top'
  | 'short-name-asc' | 'short-name-desc' | 'address-asc' | 'address-desc'
  | 'random-fixed' | 'random-variable' | 'custom-direction'

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
  /** Guide ch.10: the kind of effect. Absent = 'curve' (the legacy waveform model). */
  kind?: EffectKind
  /** Pattern effects: which pattern (Guide pp.154-160). */
  pattern?: PatternEffect
  /** Pattern effects: the samples (Guide p.153). Samples[0] is the background. */
  samples?: EffectSample[]
  /** Pattern effects, Guide pp.154-160 — all optional, per-pattern. */
  stepsPerValue?: number
  /** Manual timing, percent of the effect duration (Guide pp.154-166). */
  phase?: number
  /** Time offset between consecutive pixels, percent of the sample duration (Guide pp.154-166). */
  timeOffset?: number
  /** Delay between consecutive pixels, percent of the sample duration (Guide pp.154-155). */
  delay?: number
  /** Chase smoothness, 0-100 (Guide p.155): blends between consecutive samples. */
  smoothness?: number
  /** Scanner/Rain/Meteor/Snakes length in pixels (Guide pp.156-160). */
  length?: number
  /** Scanner overshoot in pixels (Guide p.156). */
  overshoot?: number
  /** Scanner/Rain/Sparkle/Jellyfish/Snakes fringe, 0-100 (Guide pp.156-160). */
  fringe?: number
  /** Scanner/Rain/Sparkle/Snakes noise (Guide pp.156-160). */
  noise?: number
  /** Yo-yo center, 0-100 (Guide p.157): ratio between filling and clearing. */
  center?: number
  /** Yo-yo steepness, 0-100 (Guide p.157): pacing of the pattern. */
  steepness?: number
  /** Rain/Meteor/Snakes distance in pixels (Guide pp.157-160). */
  distance?: number
  /** Meteor trail (Guide p.158; Jake's LightKey screenshot, 9.34.46 pm, shows
   *  "Trail 60%"): the length of the meteor's trail, as a percent of the
   *  pixel count. The guide gives no unit — the percent's reference is an
   *  interpretation to confirm against LightKey. */
  trail?: number
  /** Meteor/Sparkle/Jellyfish: use samples (except background) as a palette (Guide pp.158-160). */
  usePalette?: boolean
  /** Sparkle interval in seconds (Guide p.159). */
  interval?: number
  /** Sparkle lifetime in seconds (Guide p.159). */
  lifetime?: number
  /** Fire speed (Guide p.160): a multiplier, 1 = normal speed. The
   *  editor shows it as LightKey's percentage (50% = 1). */
  fireSpeed?: number
  /** Fire sparking: how fast a flame cools down (Guide p.160). */
  sparking?: number
  /** Fire cooling: how often a new spark ignites (Guide p.160). */
  cooling?: number
  /** Jellyfish count: max jellyfish visible at a time (Guide p.160). */
  jellyfishCount?: number
  /** Jellyfish size (Guide p.160). */
  jellyfishSize?: number
  /** Jellyfish speed (Guide p.160): how fast the jellyfish move. A
   *  multiplier, 1 = normal speed (shown as 50% in the editor, as for
   *  fireSpeed). Stored separately from fireSpeed, which the runtime
   *  used to share for all three (fire/jellyfish/snakes) — older
   *  effects fall back to it. */
  jellyfishSpeed?: number
  /** Snakes length range (Guide p.160): [min, max] pixels. */
  lengthRange?: [number, number]
  /** Snakes distance range (Guide p.160): [min, max] pixels. */
  distanceRange?: [number, number]
  /** Snakes speed (Guide p.160): how fast the snakes creep. A
   *  multiplier, 1 = normal speed (shown as 50% in the editor, as for
   *  fireSpeed). Falls back to fireSpeed on effects stored before this
   *  field existed. */
  snakeSpeed?: number
  /** Fixed duration in milliseconds (Guide p.150). Absent = derived from speed. */
  durationMs?: number
  /** Timing mode (Guide p.150). Absent = legacy: beat when syncToBpm, fixed otherwise. */
  timingMode?: EffectTimingMode
  /** Beat-controlled timing (Guide p.150): beats per cycle (÷2 repeats twice per beat). */
  beatMultiplier?: number
  /** Drawable curve effects (Guide pp.161-164): one curve per component. Present = drawn
   *  curve; absent = the waveform oscillator. */
  curveComponents?: CurveComponent[]
  /** Curve effects on Color (Guide p.161): the color model of the component curves. */
  colorModel?: 'hsb' | 'rgb' | 'cmy'
  /** Movement effects (Guide pp.165-171): the path id in show.movementPaths, or a built-in
   *  path name ('Circle' | 'Figure Eight' | 'Line'). */
  movementPathId?: string
  /** Movement effects (Guide p.166): pan/tilt offset in degrees between consecutive fixtures. */
  panOffset?: number
  tiltOffset?: number
  /** Curve Position options / movement options (Guide pp.164-166). */
  mirrorPan?: boolean
  mirrorTilt?: boolean
  /** The effect's values are added to the values from lower-priority cues (Guide pp.164-166). */
  relative?: boolean
  /** Fixture order (Guide pp.151-152). Absent = 'forward' (patch order). */
  fixtureOrder?: EffectFixtureOrder
  customFixtureOrder?: string[]
  /** Fixture order origin (Guide p.152). */
  fixtureOrderOrigin?: 'start-end' | 'from-center' | 'to-center'
  /** Fixture order grouping: treat N adjacent pixels as one (Guide p.152). */
  fixtureGrouping?: number
  /** Fixture order repeat: repeat the effect after every Nth pixel (Guide p.152). */
  fixtureRepeat?: number
  /** Fixture order: consider pixel distances in the Preview (Guide pp.151-152). */
  considerSpacing?: boolean
  /** Fixture order: treat all beams of a fixture as a single pixel ('fixtures') or each
   *  individually controllable beam group as a pixel ('beams'). Default 'beams'. */
  pixelMode?: 'fixtures' | 'beams'
  /** Custom direction angle in degrees (Guide p.152): pixels are passed through along this
   *  direction as they appear in the Preview. */
  customDirectionAngle?: number
  owner?: { type: 'preset' | 'sequence' | 'cue'; id: string }
  phaseSpread: number // degrees of fan-out across targeted fixtures
  minValue?: number
  maxValue?: number
  /** Overlay effects (Guide p.173): multiple effects for one property add their values;
   *  colors use the 'screen' blend mode. */
  blendMode?: 'replace' | 'add' | 'max' | 'screen'
  enabled: boolean
}

export interface PreviewTruss {
  id: string
  name: string
  shape: 'u' | 'straight' | 'curved' | 'circular'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** Curved truss only: start / end angle of the arc in degrees, in the
   *  truss's local frame (0° = +x, increasing clockwise). The arc is the
   *  ellipse in the width × height box; defaults are a 90° arc, top
   *  (−90°) to right (0°). A circular truss ignores these (full 360°). */
  startAngle?: number
  endAngle?: number
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
  /** Activate this cue when the project opens (Guide ch.11, p.204).
   *  Ignored when the startup mode restores the last state, as the guide
   *  requires. Only cues on the visible page are activated. */
  activateAtStartup?: boolean
  /** NDI Ambience button (Jake, 23 Nov 2026): a toggle that turns the
   *  ambience output layer on/off. It carries no cue, presets or
   *  sequences — the Live layer contributes nothing for it, and App's
   *  ambience effect translates its level into the NDI session. */
  ndiAmbience?: boolean
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
  layout?: { preview: boolean; palette: boolean; inspector: boolean; shortcuts: boolean }
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
  /** Movement paths (Guide ch.10, pp.165-171): stored independently of effects so they
   *  can be reused. Built-in paths (Circle, Figure Eight, Line) are not stored here. */
  movementPaths?: MovementPathDef[]
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
  kind: 'rectangle' | 'ellipse' | 'line' | 'image' | 'text' | 'truss' | 'screen'
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
  /** Curved truss only — see PreviewTruss.startAngle / endAngle. */
  startAngle?: number
  endAngle?: number
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
  slots?: { id: string; name: string; from: number; to: number; kind: 'slot' | 'spin' | 'scroll'; /** OFL capability type of this range when the profile came from OFL (e.g. 'ShutterStrobe', 'Effect', 'NoFunction', 'EffectSpeed', 'SoundSensitivity') — the range's meaning, which the name alone does not always carry (an EP4 "RGB colors switching" range is an auto program). Hand-authored slots leave it unset and callers fall back to the name. */ capabilityType?: string }[]
  number: number // zero-based offset within the fixture mode
  attribute: string
  propertyType: 'intensity' | 'color' | 'position' | 'other'
  min: number
  max: number
  defaultValue: number
  highlightValue: number
}
/** One of the five orientations in LightKey's Perspective picker (Guide
 *  p.60): the direction the beam points in relation to the viewing
 *  direction — up, down, left, right, or parallel to the viewing
 *  direction (towards/away from the viewer, the centre option). Only
 *  ONE perspective per fixture — LightKey's limitation, replicated here
 *  rather than "fixed" by offering both. In the picker's cross layout
 *  the top tile is "down" (a ceiling-hung fixture, head pointing down)
 *  and the bottom tile is "up" (Guide p.60 example). */
export type CalibrationPerspective = 'up' | 'down' | 'left' | 'right' | 'parallel'

/** Beam-direction calibration for one fixture (Piece 4, LightKey Guide
 *  pp.58–60). Angles are in degrees from the centre of the physical
 *  pan/tilt range (the home angle is always 0°); homeDirection is in
 *  Preview compass degrees (0 = up/north on the canvas, clockwise). */
export interface FixtureCalibration {
  /** Direction the beam points at home, Preview compass degrees. */
  homeDirection?: number
  /** The yoke turns the opposite way to LightKey's expectation — pan is
   *  mirrored before output (Rotation step flip, Guide p.59). */
  rotationReversed?: boolean
  /** Allowed pan range in degrees from the home angle; unset ends mean
   *  the profile's full range. */
  panMin?: number
  panMax?: number
  /** Allowed tilt range in degrees from the centre of the tilt range. */
  tiltMin?: number
  tiltMax?: number
  /** The fixture's orientation in relation to the viewing direction. */
  perspective?: CalibrationPerspective
}

export interface FixtureProfile {
  id: string
  name: string
  manufacturer: string
  legacyType: FixtureType
  /** A fixture the user created (duplicated from an OFL record, or their
   *  own): an OFL zip upload never updates it, whatever id it carries. */
  custom?: boolean
  /** Original OFL document is retained so unsupported metadata is never lost. */
  ofl?: { manufacturerKey: string; fixtureKey: string; source?: unknown }
  modes: { id: string; name: string; channels: FixtureChannel[]; beams?: { id: string; name: string; properties: Record<string, string> }[]; flexibleLeds?: { channelsPerLed: number; maxLeds: number; defaultLeds: number; minLeds?: number }; /** Total pan range in degrees from the fixture profile (Guide p.60 — "Lightkey needs to know a moving light's pan and tilt ranges"); OFL pan capabilities carry angleStart/angleEnd. Unset = the 540°/270° defaults in lib/calibration.ts. */ panRange?: number; /** Total tilt range in degrees from the fixture profile. */ tiltRange?: number }[]
}

export const FIXTURE_PRESETS: FixturePreset[] = BUILTIN_PROFILES.map((profile) => ({ id: profile.id, name: profile.name, type: profile.legacyType, channels: Math.max(...profile.modes[0].channels.map((c) => c.number)) + 1 }))
