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
  id: string
  name: string
  type: FixtureType
  channelStart: number // 1-based DMX channel
  channels: number
  group?: string
  previewPosition?: { x: number; y: number }
}

export interface SceneDef {
  id: string
  name: string
  fixtureValues: Record<string, Record<string, number>> // fixtureId -> attribute -> value (0-255)
  fadeMs: number
  blackout?: boolean
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

export interface ShowDef {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
  fixtures: FixtureDef[]
  scenes: SceneDef[]
  automations: AutomationDef[]
  cueLists?: CueListDef[]
  midiMappings?: MidiMapping[]
  effects?: EffectDef[]
  masterIntensity?: number // 0-255
  bpm?: number
  audioPath?: string
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

export const FIXTURE_PRESETS: FixturePreset[] = [
  { id: 'par-rgb', name: 'Generic PAR (RGB)', type: 'par', channels: 4 },
  { id: 'wash-rgbaw', name: 'LED Wash (RGBAW+UV)', type: 'led-wash', channels: 7 },
  { id: 'head-8ch', name: 'Moving Head (8ch)', type: 'moving-head', channels: 8 },
  { id: 'dimmer-1ch', name: 'Single Dimmer', type: 'dimmer', channels: 1 },
  { id: 'led-simple', name: 'Generic LED (dim + RGB)', type: 'generic-led', channels: 4 },
  { id: 'pan-4x1x30-17ch', name: 'PAN 4x1x30 (17ch)', type: 'pixel-bar-17ch', channels: 17 },
  { id: 'simger-q12bt-rgba-4ch', name: 'Simger Q12BT (RGBA 4ch)', type: 'rgba-4ch', channels: 4 },
  { id: 'corepar-q120-rgbw-4ch', name: 'COREpar Q120 ILS (RGBW 4ch)', type: 'rgbw-4ch', channels: 4 }
]
