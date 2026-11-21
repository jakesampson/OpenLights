import type {
  CurveComponent,
  CurveControlPoint,
  EffectDef,
  EffectWaveform,
  EffectSample,
  PatternEffect
} from '@shared/types'
import { colorModelComponents, waveformPoints } from './curveEffects'
import { defaultSamples, isColorAttribute } from './patternRuntime'

/**
 * LightKey's built-in effect templates (Guide ch.10, p.148: "over 70" —
 * the effects chooser shows them grouped by fixture property).
 *
 * The names, kinds and beat flags come from Jake's LightKey screenshots
 * (21 Nov 2026, 9.15.56 / 9.16.05 / 9.16.22 pm): the tile's icon tells the
 * kind — overlapping circles are a pattern, a line is a curve, a path
 * shape is a movement — and beat-controlled templates carry the pulse
 * icon. The sample colours come from the tile icons.
 *
 * What the screenshots do NOT establish is which pattern sits behind each
 * named pattern template (LightKey doesn't say, and the guide doesn't
 * enumerate the templates). The pattern assigned to each name below is
 * the closest reading of the name and icon, and is flagged for Jake to
 * correct — see the per-template comments. The same applies to the
 * movement-path geometry (lib/movementRuntime.ts) and to the curve
 * templates' component shapes. Nothing else here is invented: a template
 * whose kind or samples could not be read from a screenshot is not in
 * this list (Focus, Iris and Frost have no established templates, and
 * the Zoom section shows only the four tiles visible at the foot of the
 * 9.16.22 pm screenshot).
 */

export type TemplateProperty = 'intensity' | 'color' | 'position' | 'zoom'

export interface LightKeyTemplate {
  id: string
  name: string
  property: TemplateProperty
  kind: 'pattern' | 'curve' | 'movement'
  pattern?: PatternEffect
  waveform?: EffectWaveform
  movementPathId?: string
  /** Beat-controlled (Guide p.150): the tile carries the pulse icon. */
  beat?: boolean
  /** Beat multiplier for beat templates (Beat Flash ×4 runs ×4). */
  beatMultiplier?: number
  /** Pattern samples. Absent = the neutral defaults (background off,
   *  foreground full — LightKey's Dimmer Meteor strip is black, white). */
  samples?: EffectSample[]
  /** Curve components. Absent = the default curves for the property. */
  curveComponents?: CurveComponent[]
  fixtureOrder?: EffectDef['fixtureOrder']
  mirrorPan?: boolean
}

export const TEMPLATE_PROPERTY_LABELS: Record<TemplateProperty, string> = {
  intensity: 'Dimmer',
  color: 'Color',
  position: 'Position',
  zoom: 'Zoom'
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function colorSamples(...colors: string[]): EffectSample[] {
  return [{ id: 'sample-bg', color: '#000000' }, ...colors.map((color, i) => ({ id: `sample-${i + 1}`, color }))]
}

function flatPoints(y: number): CurveControlPoint[] {
  return [
    { id: 'point-0', x: 0, y },
    { id: 'point-1', x: 1, y }
  ]
}

function rampPoints(up: boolean): CurveControlPoint[] {
  return up
    ? [
        { id: 'point-0', x: 0, y: 0 },
        { id: 'point-1', x: 1, y: 1 }
      ]
    : [
        { id: 'point-0', x: 0, y: 1 },
        { id: 'point-1', x: 1, y: 0 }
      ]
}

function waveformComponent(component: string, waveform: EffectWaveform): CurveComponent {
  return {
    component,
    points: waveformPoints(waveform),
    curvedSegments: Array.from({ length: 8 }, () => true)
  }
}

function flatComponent(component: string, y: number): CurveComponent {
  return { component, points: flatPoints(y), curvedSegments: [false] }
}

function rampComponent(component: string, up: boolean): CurveComponent {
  return { component, points: rampPoints(up), curvedSegments: [false] }
}

/** Default curves for a fresh curve effect on a property (Guide p.161):
 *  one curve per component — HSB sine curves for Color, pan sine /
 *  tilt cosine for Position, a single sine for anything else. */
export function defaultCurveComponents(attribute: string): CurveComponent[] {
  if (attribute === 'color') {
    return colorModelComponents('hsb').map((component) => waveformComponent(component, 'sine'))
  }
  if (attribute === 'position') {
    return [waveformComponent('pan', 'sine'), waveformComponent('tilt', 'cosine')]
  }
  return [waveformComponent(attribute, 'sine')]
}

/** A Color curve template: hue sweeps while saturation/brightness hold
 *  (or sweep, for the "wave" variants). Which components sweep is a
 *  reading of the tile's two-line icon — flag for Jake to confirm. */
function colorCurve(name: string, hue: EffectWaveform, sat: number | 'sine', bright: number | 'sine'): LightKeyTemplate {
  return {
    id: `builtin-color-${slug(name)}`,
    name,
    property: 'color',
    kind: 'curve',
    curveComponents: [
      waveformComponent('hue', hue),
      sat === 'sine' ? waveformComponent('saturation', 'sine') : flatComponent('saturation', sat),
      bright === 'sine' ? waveformComponent('brightness', 'sine') : flatComponent('brightness', bright)
    ]
  }
}

function dimmerCurve(name: string, waveform: EffectWaveform, extra?: Partial<LightKeyTemplate>): LightKeyTemplate {
  return {
    id: `builtin-dimmer-${slug(name)}`,
    name,
    property: 'intensity',
    kind: 'curve',
    waveform,
    curveComponents: [waveformComponent('intensity', waveform)],
    ...extra
  }
}

function dimmerPattern(name: string, pattern: PatternEffect, extra?: Partial<LightKeyTemplate>): LightKeyTemplate {
  return {
    id: `builtin-dimmer-${slug(name)}`,
    name,
    property: 'intensity',
    kind: 'pattern',
    pattern,
    ...extra
  }
}

function colorPattern(name: string, pattern: PatternEffect, samples: EffectSample[], extra?: Partial<LightKeyTemplate>): LightKeyTemplate {
  return {
    id: `builtin-color-${slug(name)}`,
    name,
    property: 'color',
    kind: 'pattern',
    pattern,
    samples,
    ...extra
  }
}

function movementTemplate(name: string, movementPathId: string): LightKeyTemplate {
  return {
    id: `builtin-position-${slug(name)}`,
    name,
    property: 'position',
    kind: 'movement',
    movementPathId
  }
}

const DIMMER_TEMPLATES: LightKeyTemplate[] = [
  // Pattern tiles (circle icons). The pattern behind each name is a
  // reading of the name — flag for Jake to correct.
  dimmerPattern('Barn Doors', 'yo-yo'), // doors fill then clear, like a yo-yo
  dimmerPattern('Beat Meteor', 'meteor', { beat: true }),
  dimmerPattern('Beat Strike', 'scanner', { beat: true }), // a strike sweeps like a scanner eye
  dimmerPattern('Can-Can', 'chase'), // alternating legs, like a chase
  dimmerPattern('Droplets', 'rain'),
  dimmerPattern('Marching Ants', 'chase'),
  dimmerPattern('Rain', 'rain'),
  dimmerPattern('Searchlight', 'scanner'),
  dimmerPattern('Shades', 'fill'), // shades fill in one after another
  // Curve tiles (line icons).
  dimmerCurve('Beat Flash', 'square', { beat: true }),
  dimmerCurve('Beat Flash ×4', 'square', { beat: true, beatMultiplier: 4 }),
  dimmerCurve('Light Wave', 'sine'),
  dimmerCurve('Lightning', 'random'),
  dimmerCurve('Pulse Alternating', 'sine'),
  {
    id: 'builtin-dimmer-pulse-decreasing', name: 'Pulse Decreasing', property: 'intensity', kind: 'curve',
    curveComponents: [rampComponent('intensity', false)]
  },
  {
    id: 'builtin-dimmer-pulse-increasing', name: 'Pulse Increasing', property: 'intensity', kind: 'curve',
    curveComponents: [rampComponent('intensity', true)]
  },
  dimmerCurve('Random Fade', 'random'),
  dimmerCurve('Venetian Blinds', 'square') // alternating slats, like a square wave
]

const COLOR_TEMPLATES: LightKeyTemplate[] = [
  // Pattern tiles (circle icons in the template's colours).
  colorPattern('Beat Comet', 'meteor', colorSamples('#00e676'), { beat: true }),
  colorPattern('Butterflies', 'jellyfish', colorSamples('#ff6fa5', '#ffb3d1')),
  colorPattern('Confetti', 'sparkle', colorSamples('#ffb300', '#00e5ff', '#7c4dff')),
  colorPattern('Cop Light', 'chase', colorSamples('#ff0000', '#0066ff')), // red/blue alternation — the name, not the single-blue icon
  colorPattern('Elevator', 'yo-yo', colorSamples('#ff0000', '#0066ff', '#00cc44')),
  colorPattern('Fill', 'fill', colorSamples('#ff5fa2', '#ffee58', '#69f0ae')),
  colorPattern('Fire', 'fire', colorSamples('#ff2200', '#ff8800', '#ffdd00', '#ffffff')),
  colorPattern('Glittering Snow', 'sparkle', colorSamples('#ffffff', '#e0e0e0')),
  colorPattern('Green Boas', 'snakes', colorSamples('#00c853', '#69f0ae', '#1b5e20')),
  colorPattern('High Striker', 'meteor', colorSamples('#2962ff', '#ffea00')),
  colorPattern('Jellyfish', 'jellyfish', colorSamples('#e1bee7', '#7e57c2', '#b39ddb')),
  colorPattern('K.I.T.T.', 'scanner', colorSamples('#ff0000')), // the Knight Rider scanner eye
  colorPattern('Meteor Shower', 'meteor', colorSamples('#b3e5fc', '#ffffff')),
  colorPattern('Paper Streamers', 'rain', colorSamples('#ffee58', '#69f0ae', '#40c4ff')),
  colorPattern('Purple Rain', 'rain', colorSamples('#7c4dff')),
  colorPattern('Ripple', 'fill', colorSamples('#0d47a1', '#80d8ff')),
  colorPattern('Scroll', 'chase', colorSamples('#ff5252', '#ffd740', '#40c4ff')),
  colorPattern('Signals', 'chase', colorSamples('#1a237e', '#90caf9')),
  colorPattern('Sparkle', 'sparkle', colorSamples('#ff9100', '#ffea00', '#ffffff')),
  colorPattern('Sweep', 'scanner', colorSamples('#ff4081', '#ffee58', '#00e5ff')),
  colorPattern('Waterfall', 'rain', colorSamples('#4fc3f7', '#b3e5fc', '#e1f5fe')),
  // Curve tiles (two-line icons).
  colorCurve('Birthday Party', 'sine', 1, 'sine'),
  colorCurve('Pastel Rainbow', 'sine', 0.5, 1),
  colorCurve('Rainbow', 'sine', 1, 1),
  colorCurve('Rainbow Wave', 'sine', 1, 'sine'),
  colorCurve('Treasure Flower', 'sine', 'sine', 1)
]

const POSITION_TEMPLATES: LightKeyTemplate[] = [
  // Movement tiles (path-shape icons).
  movementTemplate('Bow Tie', 'builtin-bow-tie'),
  movementTemplate('Flower', 'builtin-flower'),
  movementTemplate('Half Flower 3', 'builtin-half-flower-3'),
  movementTemplate('Half Flower 5', 'builtin-half-flower-5'),
  movementTemplate('Pan Track', 'builtin-pan-track'),
  movementTemplate('Random Dots', 'builtin-random-dots'),
  movementTemplate('Tilt Track 1', 'builtin-tilt-track-1'),
  movementTemplate('Tilt Track 2', 'builtin-tilt-track-2'),
  movementTemplate('Triangle Small', 'builtin-triangle-small'),
  movementTemplate('Triangle Wide', 'builtin-triangle-wide'),
  movementTemplate('Wedge Curved', 'builtin-wedge-curved'),
  movementTemplate('Wedge Straight', 'builtin-wedge-straight'),
  movementTemplate('Zigzag 2', 'builtin-zigzag-2'),
  movementTemplate('Zigzag 5', 'builtin-zigzag-5'),
  // Curve tiles (wave icons): pan/tilt curves, not paths.
  {
    id: 'builtin-position-ballyhoo-mirrored', name: 'Ballyhoo (Mirrored)', property: 'position', kind: 'curve',
    curveComponents: [waveformComponent('pan', 'sine'), waveformComponent('tilt', 'cosine')],
    mirrorPan: true
  },
  {
    id: 'builtin-position-ballyhoo-random', name: 'Ballyhoo (Random)', property: 'position', kind: 'curve',
    curveComponents: [waveformComponent('pan', 'sine'), waveformComponent('tilt', 'cosine')],
    fixtureOrder: 'random-fixed'
  },
  {
    id: 'builtin-position-tilt-wave', name: 'Tilt Wave', property: 'position', kind: 'curve',
    curveComponents: [flatComponent('pan', 0.5), waveformComponent('tilt', 'sine')]
  },
  {
    id: 'builtin-position-wiper', name: 'Wiper', property: 'position', kind: 'curve',
    curveComponents: [waveformComponent('pan', 'triangle'), flatComponent('tilt', 0.5)]
  }
]

const ZOOM_TEMPLATES: LightKeyTemplate[] = [
  {
    id: 'builtin-zoom-alternating', name: 'Zoom Alternating', property: 'zoom', kind: 'curve',
    curveComponents: [waveformComponent('zoom', 'sine')]
  },
  {
    id: 'builtin-zoom-closing', name: 'Zoom Closing', property: 'zoom', kind: 'curve',
    curveComponents: [rampComponent('zoom', false)]
  },
  {
    id: 'builtin-zoom-opening', name: 'Zoom Opening', property: 'zoom', kind: 'curve',
    curveComponents: [rampComponent('zoom', true)]
  },
  {
    id: 'builtin-zoom-wave', name: 'Zoom Wave', property: 'zoom', kind: 'curve',
    curveComponents: [waveformComponent('zoom', 'sine')]
  }
]

export interface TemplateSection {
  property: TemplateProperty
  label: string
  templates: LightKeyTemplate[]
}

export const EFFECT_TEMPLATE_SECTIONS: TemplateSection[] = [
  { property: 'intensity', label: 'Dimmer', templates: DIMMER_TEMPLATES },
  { property: 'color', label: 'Color', templates: COLOR_TEMPLATES },
  { property: 'position', label: 'Position', templates: POSITION_TEMPLATES },
  { property: 'zoom', label: 'Zoom', templates: ZOOM_TEMPLATES }
]

export const ALL_LIGHTKEY_TEMPLATES: LightKeyTemplate[] = EFFECT_TEMPLATE_SECTIONS.flatMap((s) => s.templates)

export function findLightKeyTemplate(id: string): LightKeyTemplate | undefined {
  return ALL_LIGHTKEY_TEMPLATES.find((t) => t.id === id)
}

/** Build a fresh effect from a template (Guide p.148: LightKey adds the
 *  effect to the selected fixtures and shows its settings). The effect
 *  takes the template's name — what LightKey names a template-added
 *  effect is not in the guide, so this is flagged for Jake to confirm. */
export function createEffectFromTemplate(template: LightKeyTemplate, fixtureIds: string[]): EffectDef {
  const attribute = template.property
  const base: EffectDef = {
    id: crypto.randomUUID(),
    name: template.name,
    fixtureIds: [...fixtureIds],
    attribute,
    waveform: template.waveform ?? 'sine',
    speed: 1,
    syncToBpm: false,
    size: 255,
    offset: 128,
    phaseSpread: 0,
    enabled: true,
    kind: template.kind,
    durationMs: 2000,
    timingMode: template.beat ? 'beat' : 'fixed',
    beatMultiplier: template.beat ? template.beatMultiplier ?? 1 : undefined
  }
  if (template.fixtureOrder) base.fixtureOrder = template.fixtureOrder
  if (template.mirrorPan) base.mirrorPan = template.mirrorPan
  if (template.kind === 'pattern' && template.pattern) {
    return {
      ...base,
      pattern: template.pattern,
      samples: template.samples ?? defaultSamples(isColorAttribute(attribute))
    }
  }
  if (template.kind === 'curve') {
    return { ...base, curveComponents: template.curveComponents ?? defaultCurveComponents(attribute) }
  }
  if (template.kind === 'movement' && template.movementPathId) {
    return { ...base, movementPathId: template.movementPathId }
  }
  return base
}
