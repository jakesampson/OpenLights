import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CurveComponent,
  CurveControlPoint,
  EffectDef,
  EffectFixtureOrder,
  EffectSample,
  EffectWaveform,
  MovementPathDef,
  PatternEffect
} from '@shared/types'
import { useShowStore } from '../stores/showStore'
import { defaultSamples, isColorAttribute } from '../lib/patternRuntime'
import { colorModelComponents, defaultCurvePoints, evaluateCurve, waveformPoints } from '../lib/curveEffects'
import { BUILTIN_MOVEMENT_PATHS, pathPointAt, resolveMovementPath } from '../lib/movementRuntime'
import { getEffectTime } from '../lib/output'
import { panTiltRange } from '../lib/calibration'

/**
 * LightKey's visual effect editor (Guide ch.10, pp.146-175). The editor sits
 * below the Preview — in the Design panel — and edits one effect: its timing,
 * fixture order, and the pattern samples, drawable curves or movement path
 * that drive it. The effects chooser (same chapter) picks a template or a
 * custom effect to add.
 *
 * Built-in templates: the guide says there are over 70 but does not enumerate
 * them, so this ships one template per pattern, waveform and built-in path.
 */

export const PATTERN_LABELS: Record<PatternEffect, string> = {
  chase: 'Chase',
  scanner: 'Scanner',
  'yo-yo': 'Yo-Yo',
  fill: 'Fill',
  rain: 'Rain',
  meteor: 'Meteor',
  sparkle: 'Sparkle',
  fire: 'Fire',
  jellyfish: 'Jellyfish',
  snakes: 'Snakes'
}

const WAVEFORM_LABELS: Record<EffectWaveform, string> = {
  sine: 'Sine',
  cosine: 'Cosine',
  triangle: 'Triangle',
  square: 'Square',
  saw: 'Sawtooth',
  pulse: 'Pulse',
  smooth: 'Smooth',
  random: 'Random'
}

const FIXTURE_ORDER_LABELS: Record<EffectFixtureOrder, string> = {
  forward: 'Forward',
  reverse: 'Reverse',
  random: 'Random',
  custom: 'Custom Order',
  'left-right': 'Left to Right',
  'right-left': 'Right to Left',
  'top-bottom': 'Top to Bottom',
  'bottom-top': 'Bottom to Top',
  'short-name-asc': 'By Short Name (A–Z)',
  'short-name-desc': 'By Short Name (Z–A)',
  'address-asc': 'By Address (Low–High)',
  'address-desc': 'By Address (High–Low)',
  'random-fixed': 'Random (Fixed)',
  'random-variable': 'Random (Variable)',
  'custom-direction': 'Custom Direction'
}

const BEAT_MULTIPLIERS: { value: number; label: string }[] = [
  { value: 4, label: '4 beats' },
  { value: 2, label: '2 beats' },
  { value: 1, label: '1 beat' },
  { value: 0.5, label: '½ beat' },
  { value: 0.25, label: '¼ beat' }
]

function attributeLabel(attribute: string): string {
  if (attribute === 'intensity') return 'Dimmer'
  if (attribute === 'color') return 'Color'
  if (attribute === 'position') return 'Position'
  if (attribute === 'uv') return 'UV'
  return attribute.charAt(0).toUpperCase() + attribute.slice(1)
}

/** Which effect kinds apply to a property (Guide p.147): patterns are Dimmer
 *  and Color; curves are any property; movement is Position. */
function kindsForAttribute(attribute: string): ('pattern' | 'curve' | 'movement')[] {
  if (attribute === 'position') return ['curve', 'movement']
  if (attribute === 'intensity' || isColorAttribute(attribute)) return ['pattern', 'curve']
  return ['curve']
}

function newEffectId() {
  return crypto.randomUUID()
}

/* ------------------------------------------------------------------ */
/* Effects chooser (Guide ch.10, pp.148-149)                         */
/* ------------------------------------------------------------------ */

interface TemplateChoice {
  id: string
  name: string
  kind: 'pattern' | 'curve' | 'movement'
  pattern?: PatternEffect
  waveform?: EffectWaveform
  movementPathId?: string
  /** Saved project template (Guide p.174) — applied as stored. */
  templateId?: string
  beat?: boolean
}

function builtinTemplates(attribute: string): TemplateChoice[] {
  const kinds = kindsForAttribute(attribute)
  const list: TemplateChoice[] = []
  if (kinds.includes('pattern')) {
    for (const pattern of Object.keys(PATTERN_LABELS) as PatternEffect[]) {
      list.push({ id: `builtin-pattern-${pattern}`, name: PATTERN_LABELS[pattern], kind: 'pattern', pattern, beat: true })
    }
  }
  if (kinds.includes('curve')) {
    for (const waveform of Object.keys(WAVEFORM_LABELS) as EffectWaveform[]) {
      list.push({ id: `builtin-curve-${waveform}`, name: `${WAVEFORM_LABELS[waveform]} Wave`, kind: 'curve', waveform, beat: true })
    }
  }
  if (kinds.includes('movement')) {
    for (const path of BUILTIN_MOVEMENT_PATHS) {
      list.push({ id: `builtin-movement-${path.id}`, name: path.name, kind: 'movement', movementPathId: path.id })
    }
  }
  return list
}

export function EffectsChooser() {
  const attribute = useShowStore((s) => s.effectChooserAttribute)
  const setEffectChooserAttribute = useShowStore((s) => s.setEffectChooserAttribute)
  const effects = useShowStore((s) => s.effects)
  const show = useShowStore((s) => s.show)
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const addEffect = useShowStore((s) => s.addEffect)
  const removeEffect = useShowStore((s) => s.removeEffect)
  const applyEffectTemplate = useShowStore((s) => s.applyEffectTemplate)
  const setEditingEffectId = useShowStore((s) => s.setEditingEffectId)
  const [query, setQuery] = useState('')
  const [customKind, setCustomKind] = useState<'pattern' | 'curve' | 'movement'>(() =>
    kindsForAttribute(attribute ?? 'intensity')[0]
  )
  /** An effect already controls this property — LightKey asks Replace or Overlay (p.152). */
  const [conflict, setConflict] = useState<{ choice: TemplateChoice; existing: EffectDef } | null>(null)

  const templates = useMemo(() => builtinTemplates(attribute ?? 'intensity'), [attribute])
  const projectTemplates = useMemo(
    () => (show?.effectTemplates ?? []).filter((t) => t.attribute === attribute),
    [show?.effectTemplates, attribute]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter((t) => t.name.toLowerCase().includes(q))
  }, [templates, query])
  const filteredProject = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projectTemplates
    return projectTemplates.filter((t) => t.name.toLowerCase().includes(q))
  }, [projectTemplates, query])

  if (!attribute) return null
  const label = attributeLabel(attribute)
  const kinds = kindsForAttribute(attribute)
  const existing = effects.find(
    (e) => e.enabled && e.attribute === attribute && (e.fixtureIds.length === 0 || e.fixtureIds.some((id) => selectedFixtureIds.includes(id)))
  )

  const createFromChoice = (choice: TemplateChoice): EffectDef | null => {
    const base: EffectDef = {
      id: newEffectId(),
      name: `${choice.name} ${label}`,
      fixtureIds: [...selectedFixtureIds],
      attribute,
      waveform: choice.waveform ?? 'sine',
      speed: 1,
      syncToBpm: false,
      size: 255,
      offset: 128,
      phaseSpread: 0,
      enabled: true,
      kind: choice.kind,
      durationMs: 2000,
      timingMode: 'fixed'
    }
    if (choice.kind === 'pattern' && choice.pattern) {
      return { ...base, pattern: choice.pattern, samples: defaultSamples(isColorAttribute(attribute)) }
    }
    if (choice.kind === 'curve') {
      return { ...base, curveComponents: defaultComponentsFor(attribute) }
    }
    if (choice.kind === 'movement' && choice.movementPathId) {
      return { ...base, movementPathId: choice.movementPathId }
    }
    return base
  }

  const addChoice = (choice: TemplateChoice) => {
    if (existing && !conflict) {
      setConflict({ choice, existing })
      return
    }
    if (choice.templateId) {
      const id = applyEffectTemplate(choice.templateId)
      if (id) {
        setEffectChooserAttribute(null)
        setEditingEffectId(id)
      }
      return
    }
    const effect = createFromChoice(choice)
    if (!effect) return
    addEffect(effect)
    setEffectChooserAttribute(null)
    setEditingEffectId(effect.id)
  }

  const resolveConflict = (mode: 'replace' | 'overlay') => {
    if (!conflict) return
    if (mode === 'replace') removeEffect(conflict.existing.id)
    const choice = conflict.choice
    setConflict(null)
    // Re-run without the conflict gate (the existing effect is gone, or kept for overlay).
    if (choice.templateId) {
      const id = applyEffectTemplate(choice.templateId)
      if (id) {
        setEffectChooserAttribute(null)
        setEditingEffectId(id)
      }
      return
    }
    const effect = createFromChoice(choice)
    if (!effect) return
    addEffect(effect)
    setEffectChooserAttribute(null)
    setEditingEffectId(effect.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2" data-testid="effects-chooser">
      <div className="flex items-center gap-2">
        <strong className="text-sm">Add {label} Effect</strong>
        <input
          aria-label="Search effects"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="ml-auto min-w-0 flex-1 rounded bg-bg px-2 py-1 text-xs sm:max-w-48"
        />
        <button type="button" className="text-xs text-dim" onClick={() => setEffectChooserAttribute(null)}>Close</button>
      </div>
      {conflict && (
        <div className="rounded border border-line bg-panel2 p-2 text-xs" role="alert">
          <p className="mb-2">
            <strong>{conflict.existing.name}</strong> already controls {label} for these fixtures.
            Replace it, or overlay the new effect on top of it?
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-theme text-xs" onClick={() => resolveConflict('replace')}>Replace</button>
            <button type="button" className="btn-theme text-xs" onClick={() => resolveConflict('overlay')}>Overlay</button>
            <button type="button" className="text-xs text-dim" onClick={() => setConflict(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {filtered.map((template) => (
          <button
            key={template.id}
            type="button"
            className="rounded border border-line bg-panel2 px-2 py-1.5 text-left text-xs hover:border-[var(--accent)]"
            onClick={() => addChoice(template)}
          >
            <span className="block font-medium">{template.name}</span>
            <span className="text-[10px] text-dim">
              {template.kind === 'pattern' ? 'Pattern' : template.kind === 'curve' ? 'Curve' : 'Movement'}
              {template.beat ? ' · ♩' : ''}
            </span>
          </button>
        ))}
        {filtered.length === 0 && <span className="text-[11px] text-dim">No built-in templates match.</span>}
      </div>
      {filteredProject.length > 0 && (
        <>
          <strong className="text-xs">Your Templates</strong>
          <div className="flex flex-wrap gap-1">
            {filteredProject.map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded border border-line bg-panel2 px-2 py-1.5 text-left text-xs hover:border-[var(--accent)]"
                onClick={() => addChoice({ id: template.id, name: template.name, kind: template.kind ?? 'curve', templateId: template.id })}
              >
                <span className="block font-medium">{template.name}</span>
                <span className="text-[10px] text-dim">Saved template</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-auto flex items-center gap-2 border-t border-line pt-2">
        <strong className="text-xs">Custom Effect</strong>
        <select
          aria-label="Custom effect kind"
          value={customKind}
          onChange={(event) => setCustomKind(event.target.value as 'pattern' | 'curve' | 'movement')}
          className="rounded bg-bg px-1 py-1 text-xs"
        >
          {kinds.includes('pattern') && <option value="pattern">Pattern</option>}
          {kinds.includes('curve') && <option value="curve">Curve</option>}
          {kinds.includes('movement') && <option value="movement">Movement</option>}
        </select>
        <button
          type="button"
          className="btn-theme text-xs"
          onClick={() => addChoice({
            id: `custom-${customKind}`,
            name: customKind === 'pattern' ? 'Custom Pattern' : customKind === 'curve' ? 'Custom Curve' : 'Custom Movement',
            kind: customKind,
            pattern: customKind === 'pattern' ? 'chase' : undefined,
            waveform: customKind === 'curve' ? 'sine' : undefined,
            movementPathId: customKind === 'movement' ? 'builtin-circle' : undefined
          })}
        >
          Add Effect
        </button>
      </div>
    </div>
  )
}

/** Default curves for a fresh custom curve effect (Guide p.161): one curve per
 *  component, each a sine wave sampled into control points. */
function defaultComponentsFor(attribute: string): CurveComponent[] {
  if (attribute === 'color') {
    return colorModelComponents('hsb').map((component) => ({
      component,
      points: waveformPoints('sine'),
      curvedSegments: Array.from({ length: 8 }, () => true)
    }))
  }
  if (attribute === 'position') {
    return [
      { component: 'pan', points: waveformPoints('sine'), curvedSegments: Array.from({ length: 8 }, () => true) },
      { component: 'tilt', points: waveformPoints('cosine'), curvedSegments: Array.from({ length: 8 }, () => true) }
    ]
  }
  return [{ component: attribute, points: waveformPoints('sine'), curvedSegments: Array.from({ length: 8 }, () => true) }]
}

/* ------------------------------------------------------------------ */
/* Effect editor (Guide ch.10, pp.149-152)                          */
/* ------------------------------------------------------------------ */

function NumberField({ label, value, min, max, step, onChange, placeholder }: {
  label: string
  value: number | undefined
  min?: number
  max?: number
  step?: number
  placeholder?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="text-dim">{label}</span>
      <input
        type="number"
        aria-label={label}
        value={value ?? ''}
        min={min}
        max={max}
        step={step ?? 1}
        placeholder={placeholder}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        className="w-16 rounded bg-bg px-1 py-0.5 text-xs"
      />
    </label>
  )
}

function TimingControls({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const canBeat = effect.kind !== 'movement'
  const canRandom = effect.kind === 'pattern'
  const mode = effect.timingMode ?? (effect.syncToBpm ? 'beat' : 'fixed')
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-1">
        <span className="text-dim">Timing</span>
        <select
          aria-label="Timing mode"
          value={mode}
          onChange={(event) => update({ timingMode: event.target.value as EffectDef['timingMode'] })}
          className="rounded bg-bg px-1 py-1 text-xs"
        >
          <option value="fixed">Fixed duration</option>
          {canBeat && <option value="beat">Beat-controlled</option>}
          {canRandom && <option value="random">Random</option>}
        </select>
      </label>
      {mode === 'fixed' && (
        <NumberField label="Duration (ms)" value={effect.durationMs ?? 2000} min={50} max={600000} step={50}
          onChange={(durationMs) => update({ durationMs })} />
      )}
      {mode === 'beat' && (
        <label className="flex items-center gap-1">
          <span className="text-dim">Beats per cycle</span>
          <select
            aria-label="Beats per cycle"
            value={String(effect.beatMultiplier ?? 1)}
            onChange={(event) => update({ beatMultiplier: Number(event.target.value) })}
            className="rounded bg-bg px-1 py-1 text-xs"
          >
            {BEAT_MULTIPLIERS.map((m) => <option key={m.value} value={String(m.value)}>{m.label}</option>)}
          </select>
        </label>
      )}
      {mode === 'random' && <span className="text-[11px] text-dim">No fixed cycle — a new random order each time.</span>}
    </div>
  )
}

function FixtureOrderControls({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const order = effect.fixtureOrder ?? 'forward'
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-1">
        <span className="text-dim">Fixture order</span>
        <select
          aria-label="Fixture order"
          value={order}
          onChange={(event) => update({ fixtureOrder: event.target.value as EffectFixtureOrder })}
          className="rounded bg-bg px-1 py-1 text-xs"
        >
          {(Object.keys(FIXTURE_ORDER_LABELS) as EffectFixtureOrder[]).map((key) => (
            <option key={key} value={key}>{FIXTURE_ORDER_LABELS[key]}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-dim">Origin</span>
        <select
          aria-label="Fixture order origin"
          value={effect.fixtureOrderOrigin ?? 'start-end'}
          onChange={(event) => update({ fixtureOrderOrigin: event.target.value as EffectDef['fixtureOrderOrigin'] })}
          className="rounded bg-bg px-1 py-1 text-xs"
        >
          <option value="start-end">Start to End</option>
          <option value="from-center">From Center</option>
          <option value="to-center">To Center</option>
        </select>
      </label>
      <NumberField label="Grouping" value={effect.fixtureGrouping ?? 1} min={1} max={64} step={1}
        onChange={(fixtureGrouping) => update({ fixtureGrouping })} />
      <NumberField label="Repeat" value={effect.fixtureRepeat ?? 0} min={0} max={64} step={1}
        onChange={(fixtureRepeat) => update({ fixtureRepeat })} />
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={effect.considerSpacing ?? false}
          onChange={(event) => update({ considerSpacing: event.target.checked })}
        />
        <span className="text-dim">Consider Spacing</span>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-dim">Pixels</span>
        <select
          aria-label="Pixel mode"
          value={effect.pixelMode ?? 'beams'}
          onChange={(event) => update({ pixelMode: event.target.value as EffectDef['pixelMode'] })}
          className="rounded bg-bg px-1 py-1 text-xs"
        >
          <option value="beams">Beams</option>
          <option value="fixtures">Fixtures</option>
        </select>
      </label>
      {order === 'custom-direction' && (
        <NumberField label="Direction (°)" value={effect.customDirectionAngle ?? 0} min={0} max={359} step={1}
          onChange={(customDirectionAngle) => update({ customDirectionAngle })} />
      )}
      {order === 'custom' && (
        <span className="text-[11px] text-dim">Custom Order is set by editing the fixture numbers in the Preview.</span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pattern editor (Guide ch.10, pp.153-160)                        */
/* ------------------------------------------------------------------ */

interface PatternParam {
  key: keyof EffectDef
  label: string
  min: number
  max: number
  step: number
  /** The runtime default, shown while the field is empty (unset = default). */
  placeholder: string
}

const PATTERN_PARAMS: Record<PatternEffect, PatternParam[]> = {
  chase: [
    { key: 'stepsPerValue', label: 'Steps per value', min: 1, max: 64, step: 1, placeholder: '1' },
    { key: 'delay', label: 'Delay (%)', min: 0, max: 100, step: 1, placeholder: '0' },
    { key: 'smoothness', label: 'Smoothness (%)', min: 0, max: 100, step: 1, placeholder: '0' }
  ],
  scanner: [
    { key: 'length', label: 'Length (pixels)', min: 1, max: 64, step: 1, placeholder: '1' },
    { key: 'overshoot', label: 'Overshoot (pixels)', min: 0, max: 64, step: 1, placeholder: '0' },
    { key: 'fringe', label: 'Fringe (%)', min: 0, max: 100, step: 1, placeholder: '0' },
    { key: 'noise', label: 'Noise', min: 0, max: 100, step: 1, placeholder: '0' }
  ],
  'yo-yo': [
    { key: 'center', label: 'Center (%)', min: 0, max: 100, step: 1, placeholder: '50' },
    { key: 'steepness', label: 'Steepness (%)', min: 0, max: 100, step: 1, placeholder: '0' }
  ],
  fill: [],
  rain: [
    { key: 'length', label: 'Length (pixels)', min: 1, max: 64, step: 1, placeholder: '1' },
    { key: 'distance', label: 'Distance (pixels)', min: 1, max: 64, step: 1, placeholder: '2' },
    { key: 'fringe', label: 'Fringe (%)', min: 0, max: 100, step: 1, placeholder: '0' },
    { key: 'noise', label: 'Noise', min: 0, max: 100, step: 1, placeholder: '0' }
  ],
  meteor: [
    { key: 'length', label: 'Length (pixels)', min: 1, max: 64, step: 1, placeholder: '1' },
    { key: 'distance', label: 'Distance (pixels)', min: 1, max: 64, step: 1, placeholder: '6' },
    { key: 'trail', label: 'Trail', min: 0, max: 64, step: 1, placeholder: '0' }
  ],
  sparkle: [
    { key: 'interval', label: 'Interval (s)', min: 0.05, max: 10, step: 0.05, placeholder: '0.5' },
    { key: 'lifetime', label: 'Lifetime (s)', min: 0.05, max: 10, step: 0.05, placeholder: '1' },
    { key: 'fringe', label: 'Fringe (%)', min: 0, max: 100, step: 1, placeholder: '0' }
  ],
  fire: [
    { key: 'fireSpeed', label: 'Speed', min: 0.1, max: 10, step: 0.1, placeholder: '1' },
    { key: 'sparking', label: 'Sparking (%)', min: 0, max: 100, step: 1, placeholder: '50' },
    { key: 'cooling', label: 'Cooling (%)', min: 0, max: 100, step: 1, placeholder: '50' }
  ],
  jellyfish: [
    { key: 'jellyfishCount', label: 'Count', min: 1, max: 16, step: 1, placeholder: '1' },
    { key: 'jellyfishSize', label: 'Size', min: 1, max: 64, step: 1, placeholder: '50' },
    { key: 'fringe', label: 'Fringe (%)', min: 0, max: 100, step: 1, placeholder: '0' }
  ],
  snakes: [
    { key: 'fringe', label: 'Fringe (%)', min: 0, max: 100, step: 1, placeholder: '0' },
    { key: 'noise', label: 'Noise', min: 0, max: 100, step: 1, placeholder: '0' }
  ]
}

function PatternEditor({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const isColor = isColorAttribute(effect.attribute)
  const samples = effect.samples ?? defaultSamples(isColor)
  const pattern = effect.pattern ?? 'chase'
  const [selectedSample, setSelectedSample] = useState(0)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const selected = samples[Math.min(selectedSample, samples.length - 1)]

  const setSamples = (next: EffectSample[]) => update({ samples: next })
  const updateSample = (index: number, patch: Partial<EffectSample>) => {
    const next = samples.map((s, i) => (i === index ? { ...s, ...patch } : s))
    setSamples(next)
  }

  const moveSample = (from: number, to: number) => {
    if (from === to || to < 0 || to >= samples.length) return
    const next = [...samples]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setSamples(next)
    setSelectedSample(to)
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-dim">Pattern</span>
          <select
            aria-label="Pattern"
            value={pattern}
            onChange={(event) => update({ pattern: event.target.value as PatternEffect })}
            className="rounded bg-bg px-1 py-1 text-xs"
          >
            {(Object.keys(PATTERN_LABELS) as PatternEffect[]).map((key) => (
              <option key={key} value={key}>{PATTERN_LABELS[key]}</option>
            ))}
          </select>
        </label>
        <NumberField label="Time Offset (%)" value={effect.timeOffset ?? 0} min={0} max={100} step={1}
          onChange={(timeOffset) => update({ timeOffset })} />
      </div>
      {/* Sample strip (Guide p.153): the first sample is the background.
          Drag to reorder; click to edit; the buttons duplicate or delete. */}
      <div className="flex flex-wrap items-center gap-1" role="listbox" aria-label="Pattern samples">
        {samples.map((sample, index) => {
          const isSelected = index === Math.min(selectedSample, samples.length - 1)
          const swatch = isColor
            ? sample.color ?? '#000000'
            : `rgb(${Math.round(((sample.value ?? 0) / 100) * 255)}, ${Math.round(((sample.value ?? 0) / 100) * 255)}, ${Math.round(((sample.value ?? 0) / 100) * 255)})`
          return (
            <button
              key={sample.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex !== null) moveSample(dragIndex, index)
                setDragIndex(null)
              }}
              onDragEnd={() => setDragIndex(null)}
              onClick={() => setSelectedSample(index)}
              title={index === 0 ? 'Background sample — drag to reorder' : 'Sample — drag to reorder'}
              className={`flex h-8 w-8 items-center justify-center rounded border text-[10px] ${isSelected ? 'border-[#0A84FF]' : 'border-line'}`}
              style={{ backgroundColor: swatch, color: isColor ? '#fff' : '#000' }}
            >
              {index === 0 ? 'BG' : index}
            </button>
          )
        })}
        <button
          type="button"
          className="h-8 w-8 rounded border border-dashed border-line text-xs text-dim"
          title="Add sample"
          aria-label="Add sample"
          onClick={() => {
            const next = [...samples, { id: `sample-${Date.now()}`, ...(isColor ? { color: '#ffffff' } : { value: 100 }) }]
            setSamples(next)
            setSelectedSample(next.length - 1)
          }}
        >
          +
        </button>
      </div>
      {selected && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-dim">{Math.min(selectedSample, samples.length - 1) === 0 ? 'Background' : `Sample ${Math.min(selectedSample, samples.length - 1)}`}</span>
          {isColor ? (
            <label className="flex items-center gap-1">
              <input
                type="color"
                aria-label="Sample color"
                value={selected.color ?? '#000000'}
                onChange={(event) => updateSample(Math.min(selectedSample, samples.length - 1), { color: event.target.value })}
                className="h-6 w-8 cursor-pointer rounded bg-bg"
              />
              <span className="font-mono">{selected.color ?? '#000000'}</span>
            </label>
          ) : (
            <NumberField label="Value (%)" value={selected.value ?? 0} min={0} max={100} step={1}
              onChange={(value) => updateSample(Math.min(selectedSample, samples.length - 1), { value })} />
          )}
          <button
            type="button"
            className="text-xs text-dim"
            onClick={() => {
              const index = Math.min(selectedSample, samples.length - 1)
              const next = [...samples]
              next.splice(index + 1, 0, { ...samples[index], id: `sample-${Date.now()}` })
              setSamples(next)
              setSelectedSample(index + 1)
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="text-xs text-dim"
            disabled={samples.length <= 1}
            onClick={() => {
              const index = Math.min(selectedSample, samples.length - 1)
              const next = samples.filter((_, i) => i !== index)
              setSamples(next)
              setSelectedSample(Math.max(0, index - 1))
            }}
          >
            Delete
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {PATTERN_PARAMS[pattern].map((param) => (
          <NumberField
            key={param.key}
            label={param.label}
            value={effect[param.key] as number | undefined}
            min={param.min}
            max={param.max}
            step={param.step}
            placeholder={param.placeholder}
            onChange={(value) => update({ [param.key]: value } as Partial<EffectDef>)}
          />
        ))}
        {(pattern === 'meteor' || pattern === 'sparkle' || pattern === 'jellyfish') && (
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={effect.usePalette ?? false}
              onChange={(event) => update({ usePalette: event.target.checked })}
            />
            <span className="text-dim">Use samples as palette</span>
          </label>
        )}
        {pattern === 'snakes' && (
          <>
            <NumberField label="Length min" value={effect.lengthRange?.[0] ?? 1} min={1} max={64} step={1}
              onChange={(value) => update({ lengthRange: [value, effect.lengthRange?.[1] ?? 4] })} />
            <NumberField label="Length max" value={effect.lengthRange?.[1] ?? 4} min={1} max={64} step={1}
              onChange={(value) => update({ lengthRange: [effect.lengthRange?.[0] ?? 1, value] })} />
            <NumberField label="Distance min" value={effect.distanceRange?.[0] ?? 1} min={1} max={64} step={1}
              onChange={(value) => update({ distanceRange: [value, effect.distanceRange?.[1] ?? 4] })} />
            <NumberField label="Distance max" value={effect.distanceRange?.[1] ?? 4} min={1} max={64} step={1}
              onChange={(value) => update({ distanceRange: [effect.distanceRange?.[0] ?? 1, value] })} />
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Curve editor (Guide ch.10, pp.161-164)                          */
/* ------------------------------------------------------------------ */

const CURVE_WIDTH = 320
const CURVE_HEIGHT = 200
const CURVE_PAD = 12

function curvePointToSvg(point: CurveControlPoint): { x: number; y: number } {
  return {
    x: CURVE_PAD + point.x * (CURVE_WIDTH - CURVE_PAD * 2),
    y: CURVE_HEIGHT - CURVE_PAD - point.y * (CURVE_HEIGHT - CURVE_PAD * 2)
  }
}

function svgToCurvePoint(clientX: number, clientY: number, rect: DOMRect): CurveControlPoint {
  const x = Math.max(0, Math.min(1, ((clientX - rect.left) / rect.width) * CURVE_WIDTH - CURVE_PAD) / (CURVE_WIDTH - CURVE_PAD * 2))
  const y = Math.max(0, Math.min(1, 1 - (((clientY - rect.top) / rect.height) * CURVE_HEIGHT - CURVE_PAD) / (CURVE_HEIGHT - CURVE_PAD * 2)))
  return { id: '', x, y }
}

/** SVG path through the points: straight segments as lines, curved segments
 *  as Catmull-Rom splines (the guide does not specify the smoothing math). */
function curvePath(points: CurveControlPoint[], curvedSegments: boolean[]): string {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (sorted.length === 0) return ''
  const xy = sorted.map(curvePointToSvg)
  let d = `M ${xy[0].x} ${xy[0].y}`
  for (let i = 0; i < sorted.length - 1; i++) {
    if (!curvedSegments[i]) {
      d += ` L ${xy[i + 1].x} ${xy[i + 1].y}`
      continue
    }
    const p0 = xy[Math.max(0, i - 1)]
    const p1 = xy[i]
    const p2 = xy[i + 1]
    const p3 = xy[Math.min(sorted.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function CurveCanvas({ component, durationMs, onChange }: {
  component: CurveComponent
  durationMs: number
  onChange: (next: CurveComponent) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [copied, setCopied] = useState<CurveComponent | null>(null)
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null)

  // The animated dot (Guide p.163): where the curve currently is.
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const duration = Math.max(50, durationMs) / 1000
      const t = ((getEffectTime() / duration) % 1 + 1) % 1
      const value = evaluateCurve(component.points, component.curvedSegments, t)
      setDot({ x: t, y: value })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [component.points, component.curvedSegments, durationMs])

  const sorted = useMemo(() => [...component.points].sort((a, b) => a.x - b.x), [component.points])
  const segments = useMemo(
    () => component.curvedSegments.slice(0, Math.max(0, sorted.length - 1)),
    [component.curvedSegments, sorted.length]
  )

  const updatePoints = (points: CurveControlPoint[], curvedSegments?: boolean[]) => {
    onChange({
      ...component,
      points,
      curvedSegments: curvedSegments ?? component.curvedSegments
    })
  }

  const pointerPoint = (event: React.PointerEvent): CurveControlPoint | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return svgToCurvePoint(event.clientX, event.clientY, rect)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    const point = pointerPoint(event)
    if (!point) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * CURVE_WIDTH
    const py = ((event.clientY - rect.top) / rect.height) * CURVE_HEIGHT
    const hit = sorted.find((p) => {
      const s = curvePointToSvg(p)
      return Math.hypot(s.x - px, s.y - py) < 12
    })
    if (hit) {
      setSelectedId(hit.id)
      setDragId(hit.id)
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
      return
    }
    // Clicking empty space adds a point (Guide p.162).
    const id = `point-${Date.now()}`
    const next = [...component.points, { ...point, id }].sort((a, b) => a.x - b.x)
    const newSegments = [...component.curvedSegments]
    const insertAt = next.findIndex((p) => p.id === id)
    if (insertAt > 0) newSegments.splice(insertAt - 1, 0, false)
    updatePoints(next, newSegments)
    setSelectedId(id)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragId) return
    const point = pointerPoint(event)
    if (!point) return
    const next = component.points
      .map((p) => (p.id === dragId ? { ...p, x: point.x, y: point.y } : p))
      .sort((a, b) => a.x - b.x)
    updatePoints(next)
  }

  const onDoubleClick = (event: React.MouseEvent) => {
    // Double-click a segment toggles it straight/curved (Guide p.162).
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((event.clientX - rect.left) / rect.width)
    const sortedX = sorted.map((p) => p.x)
    let segment = -1
    for (let i = 0; i < sortedX.length - 1; i++) {
      if (x >= sortedX[i] && x <= sortedX[i + 1]) { segment = i; break }
    }
    if (segment < 0) return
    const next = [...component.curvedSegments]
    next[segment] = !next[segment]
    updatePoints(component.points, next)
  }

  const deleteSelected = () => {
    if (!selectedId || component.points.length <= 2) return
    const index = sorted.findIndex((p) => p.id === selectedId)
    const next = component.points.filter((p) => p.id !== selectedId)
    const segments = [...component.curvedSegments]
    if (index > 0) segments.splice(index - 1, 1)
    else if (segments.length > 0) segments.splice(0, 1)
    updatePoints(next, segments)
    setSelectedId(null)
  }

  const flip = (axis: 'x' | 'y') => {
    const next = component.points.map((p) => (axis === 'x' ? { ...p, x: 1 - p.x } : { ...p, y: 1 - p.y }))
    updatePoints(next)
  }

  return (
    <div className="flex flex-col gap-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}`}
        className="w-full max-w-xl touch-none select-none rounded border border-line bg-bg"
        role="img"
        aria-label={`Curve for ${component.component}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragId(null)}
        onDoubleClick={onDoubleClick}
      >
        {/* Axis: percent and time subdivisions (Guide p.163). */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const x = CURVE_PAD + f * (CURVE_WIDTH - CURVE_PAD * 2)
          const y = CURVE_HEIGHT - CURVE_PAD - f * (CURVE_HEIGHT - CURVE_PAD * 2)
          return (
            <g key={f}>
              <line x1={x} y1={CURVE_PAD} x2={x} y2={CURVE_HEIGHT - CURVE_PAD} stroke="var(--line, #333)" strokeWidth="0.5" />
              <line x1={CURVE_PAD} y1={y} x2={CURVE_WIDTH - CURVE_PAD} y2={y} stroke="var(--line, #333)" strokeWidth="0.5" />
              <text x={x} y={CURVE_HEIGHT - 2} fontSize="8" fill="var(--dim, #888)" textAnchor="middle">{Math.round(f * 100)}%</text>
              <text x={CURVE_PAD - 2} y={y + 3} fontSize="8" fill="var(--dim, #888)" textAnchor="end">{Math.round(f * 100)}</text>
            </g>
          )
        })}
        <path d={curvePath(sorted, segments)} fill="none" stroke="#0A84FF" strokeWidth="1.5" />
        {sorted.map((point) => {
          const s = curvePointToSvg(point)
          const selected = point.id === selectedId
          return (
            <circle
              key={point.id}
              cx={s.x}
              cy={s.y}
              r={selected ? 6 : 4.5}
              fill={selected ? '#0A84FF' : '#fff'}
              stroke="#0A84FF"
              strokeWidth="1.5"
            />
          )
        })}
        {dot && (
          <circle
            cx={CURVE_PAD + dot.x * (CURVE_WIDTH - CURVE_PAD * 2)}
            cy={CURVE_HEIGHT - CURVE_PAD - dot.y * (CURVE_HEIGHT - CURVE_PAD * 2)}
            r="4"
            fill="#22c55e"
          />
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className="text-xs text-dim" disabled={!selectedId || component.points.length <= 2} onClick={deleteSelected}>
          Delete point
        </button>
        <button type="button" className="text-xs text-dim" onClick={() => flip('x')}>Flip horizontal</button>
        <button type="button" className="text-xs text-dim" onClick={() => flip('y')}>Flip vertical</button>
        <button type="button" className="text-xs text-dim" onClick={() => setCopied(structuredClone(component))}>Copy</button>
        <button
          type="button"
          className="text-xs text-dim"
          disabled={!copied}
          onClick={() => { if (copied) updatePoints(structuredClone(copied.points), structuredClone(copied.curvedSegments)) }}
        >
          Paste
        </button>
        <span className="text-[11px] text-dim">Click to add a point · drag to move · double-click a segment to toggle straight/curved</span>
      </div>
    </div>
  )
}

function CurveEditor({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const components = effect.curveComponents ?? []
  const selectedFixtures = useShowStore((s) => {
    const fixtures = s.show?.fixtures ?? []
    return fixtures.filter((f) => s.selectedFixtureIds.includes(f.id))
  })
  const model = effect.colorModel ?? 'hsb'
  const isColor = effect.attribute === 'color'
  const isPosition = effect.attribute === 'position'
  const [activeComponent, setActiveComponent] = useState<string>(components[0]?.component ?? '')
  const active = components.find((c) => c.component === activeComponent) ?? components[0]

  const updateComponent = (component: string, next: CurveComponent) => {
    update({ curveComponents: components.map((c) => (c.component === component ? next : c)) })
  }

  const applyTemplate = (waveform: EffectWaveform | 'flat') => {
    if (!active) return
    const points = waveform === 'flat' ? defaultCurvePoints() : waveformPoints(waveform)
    const curvedSegments = Array.from({ length: Math.max(0, points.length - 1) }, () => waveform !== 'flat')
    updateComponent(active.component, { ...active, points, curvedSegments })
  }

  const setColorModel = (nextModel: 'hsb' | 'rgb' | 'cmy') => {
    const extras = components.filter((c) => !colorModelComponents('hsb').includes(c.component) && !colorModelComponents('rgb').includes(c.component) && !colorModelComponents('cmy').includes(c.component))
    const fresh = colorModelComponents(nextModel).map((component) => ({
      component,
      points: waveformPoints('sine'),
      curvedSegments: Array.from({ length: 8 }, () => true)
    }))
    update({ colorModel: nextModel, curveComponents: [...fresh, ...extras] })
    setActiveComponent(fresh[0]?.component ?? '')
  }

  const componentNames = useMemo(() => {
    if (isColor) {
      const extras = selectedFixtures.flatMap((f) => {
        const attrs = ['cool white', 'warm white', 'amber', 'lime', 'ultraviolet']
        return attrs.filter((attr) => (f as unknown as Record<string, unknown>)[attr] !== undefined)
      })
      return [...colorModelComponents(model), ...Array.from(new Set(extras))]
    }
    if (isPosition) return ['pan', 'tilt']
    return [effect.attribute]
  }, [isColor, isPosition, model, selectedFixtures, effect.attribute])

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isColor && (
          <label className="flex items-center gap-1">
            <span className="text-dim">Color model</span>
            <select
              aria-label="Color model"
              value={model}
              onChange={(event) => setColorModel(event.target.value as 'hsb' | 'rgb' | 'cmy')}
              className="rounded bg-bg px-1 py-1 text-xs"
            >
              <option value="hsb">HSB</option>
              <option value="rgb">RGB</option>
              <option value="cmy">CMY</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-1">
          <span className="text-dim">Template</span>
          <select
            aria-label="Curve template"
            value=""
            onChange={(event) => {
              if (event.target.value) applyTemplate(event.target.value as EffectWaveform | 'flat')
              event.target.value = ''
            }}
            className="rounded bg-bg px-1 py-1 text-xs"
          >
            <option value="">Select Template…</option>
            {(Object.keys(WAVEFORM_LABELS) as EffectWaveform[]).map((w) => (
              <option key={w} value={w}>{WAVEFORM_LABELS[w]}</option>
            ))}
            <option value="flat">Flat</option>
          </select>
        </label>
        <NumberField label="Time Offset (%)" value={effect.timeOffset ?? 0} min={0} max={100} step={1}
          onChange={(timeOffset) => update({ timeOffset })} />
      </div>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Curve components">
        {componentNames.map((name) => {
          const has = components.some((c) => c.component === name)
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={active?.component === name}
              className={`rounded border px-2 py-1 text-xs ${active?.component === name ? 'border-[#0A84FF] bg-panel2' : 'border-line'}`}
              onClick={() => {
                setActiveComponent(name)
                if (!has) {
                  update({
                    curveComponents: [
                      ...components,
                      { component: name, points: waveformPoints('sine'), curvedSegments: Array.from({ length: 8 }, () => true) }
                    ]
                  })
                }
              }}
            >
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </button>
          )
        })}
      </div>
      {active && (
        <CurveCanvas
          component={active}
          durationMs={effect.durationMs ?? 2000}
          onChange={(next) => updateComponent(active.component, next)}
        />
      )}
      {isPosition && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-dim">Position Options</span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={effect.mirrorPan ?? false} onChange={(event) => update({ mirrorPan: event.target.checked })} />
            Mirror Pan
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={effect.mirrorTilt ?? false} onChange={(event) => update({ mirrorTilt: event.target.checked })} />
            Mirror Tilt
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={effect.relative ?? false} onChange={(event) => update({ relative: event.target.checked })} />
            Relative
          </label>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Movement editor (Guide ch.10, pp.165-171)                       */
/* ------------------------------------------------------------------ */

const PATH_SIZE = 280

function PathCanvas({ path, onChange, durationMs, range }: {
  path: MovementPathDef
  onChange: (next: MovementPathDef) => void
  durationMs: number
  range: { pan: number; tilt: number }
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dot, setDot] = useState<{ pan: number; tilt: number } | null>(null)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const duration = Math.max(50, durationMs) / 1000
      const t = ((getEffectTime() / duration) % 1 + 1) % 1
      setDot(pathPointAt(path.points, path.type, t))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [path.points, path.type, durationMs])

  const toSvg = (pan: number, tilt: number) => ({
    x: PATH_SIZE / 2 + (pan / 1) * (PATH_SIZE / 2 - 8),
    y: PATH_SIZE / 2 - (tilt / 1) * (PATH_SIZE / 2 - 8)
  })
  const fromSvg = (clientX: number, clientY: number): { pan: number; tilt: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = ((clientX - rect.left) / rect.width) * PATH_SIZE
    const y = ((clientY - rect.top) / rect.height) * PATH_SIZE
    return {
      pan: Math.max(-1, Math.min(1, (x - PATH_SIZE / 2) / (PATH_SIZE / 2 - 8))),
      tilt: Math.max(-1, Math.min(1, (PATH_SIZE / 2 - y) / (PATH_SIZE / 2 - 8)))
    }
  }

  const points = path.points
  const polyline = points.length > 1
    ? [...points, points[0]].map((p) => { const s = toSvg(p.pan, p.tilt); return `${s.x},${s.y}` }).join(' ')
    : ''

  const onPointerDown = (event: React.PointerEvent) => {
    const at = fromSvg(event.clientX, event.clientY)
    if (!at) return
    const rect = svgRef.current!.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * PATH_SIZE
    const py = ((event.clientY - rect.top) / rect.height) * PATH_SIZE
    const hit = points.findIndex((p) => {
      const s = toSvg(p.pan, p.tilt)
      return Math.hypot(s.x - px, s.y - py) < 12
    })
    if (hit >= 0) {
      setSelectedIndex(hit)
      setDragIndex(hit)
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
      return
    }
    onChange({ ...path, points: [...points, at] })
    setSelectedIndex(points.length)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (dragIndex === null) return
    const at = fromSvg(event.clientX, event.clientY)
    if (!at) return
    onChange({ ...path, points: points.map((p, i) => (i === dragIndex ? at : p)) })
  }

  const deleteSelected = () => {
    if (selectedIndex === null || points.length <= 2) return
    onChange({ ...path, points: points.filter((_, i) => i !== selectedIndex) })
    setSelectedIndex(null)
  }

  const flip = (axis: 'pan' | 'tilt') => {
    onChange({ ...path, points: points.map((p) => (axis === 'pan' ? { ...p, pan: -p.pan } : { ...p, tilt: -p.tilt })) })
  }

  const reverse = () => onChange({ ...path, points: [...points].reverse() })

  const setAsStart = () => {
    if (selectedIndex === null || selectedIndex === 0) return
    onChange({ ...path, points: [...points.slice(selectedIndex), ...points.slice(0, selectedIndex)] })
    setSelectedIndex(0)
  }

  const dotDegrees = dot
    ? { pan: Math.round(dot.pan * (range.pan / 2)), tilt: Math.round(dot.tilt * (range.tilt / 2)) }
    : null

  return (
    <div className="flex flex-col gap-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${PATH_SIZE} ${PATH_SIZE}`}
        className="w-full max-w-xs touch-none select-none rounded border border-line bg-bg"
        role="img"
        aria-label={`Movement path ${path.name}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragIndex(null)}
      >
        <line x1={PATH_SIZE / 2} y1={8} x2={PATH_SIZE / 2} y2={PATH_SIZE - 8} stroke="var(--line, #333)" strokeWidth="0.5" />
        <line x1={8} y1={PATH_SIZE / 2} x2={PATH_SIZE - 8} y2={PATH_SIZE / 2} stroke="var(--line, #333)" strokeWidth="0.5" />
        {polyline && <polygon points={polyline} fill="none" stroke="#0A84FF" strokeWidth="1.5" />}
        {points.map((p, i) => {
          const s = toSvg(p.pan, p.tilt)
          const selected = i === selectedIndex
          return (
            <g key={i}>
              <circle cx={s.x} cy={s.y} r={selected ? 6 : 4.5} fill={i === 0 ? '#22c55e' : selected ? '#0A84FF' : '#fff'} stroke="#0A84FF" strokeWidth="1.5" />
              {i === 0 && <text x={s.x + 8} y={s.y - 6} fontSize="9" fill="var(--dim, #888)">start</text>}
            </g>
          )
        })}
        {dot && (
          <circle cx={toSvg(dot.pan, dot.tilt).x} cy={toSvg(dot.pan, dot.tilt).y} r="4" fill="#22c55e" />
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className="text-xs text-dim" disabled={selectedIndex === null || points.length <= 2} onClick={deleteSelected}>Delete point</button>
        <button type="button" className="text-xs text-dim" onClick={() => flip('pan')}>Flip horizontal</button>
        <button type="button" className="text-xs text-dim" onClick={() => flip('tilt')}>Flip vertical</button>
        <button type="button" className="text-xs text-dim" onClick={reverse}>Reverse</button>
        <button type="button" className="text-xs text-dim" disabled={selectedIndex === null || selectedIndex === 0} onClick={setAsStart}>Set as Start</button>
        <span className="text-[11px] text-dim">Click to add a point · drag to move · green dot is the start</span>
        {dotDegrees && <span className="ml-auto font-mono text-[11px] text-dim">Pan {dotDegrees.pan}° · Tilt {dotDegrees.tilt}°</span>}
      </div>
    </div>
  )
}

function MovementEditor({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const show = useShowStore((s) => s.show)
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const addMovementPath = useShowStore((s) => s.addMovementPath)
  const updateMovementPath = useShowStore((s) => s.updateMovementPath)
  const removeMovementPath = useShowStore((s) => s.removeMovementPath)
  const userPaths = show?.movementPaths ?? []
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')

  const selectedPathId = effect.movementPathId ?? 'builtin-circle'
  const builtin = BUILTIN_MOVEMENT_PATHS.find((p) => p.id === selectedPathId)
  const userPath = userPaths.find((p) => p.id === selectedPathId)
  const resolved = resolveMovementPath(selectedPathId, userPaths)
  const firstFixture = (show?.fixtures ?? []).find((f) => selectedFixtureIds.includes(f.id))
  const range = firstFixture ? panTiltRange(firstFixture) : { pan: 540, tilt: 270 }

  const builtinAsPath = (id: string): MovementPathDef | null => {
    if (id === 'builtin-circle') {
      const points = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2
        return { pan: Math.cos(a) * 0.8, tilt: Math.sin(a) * 0.8 }
      })
      return { id, name: 'Circle', builtIn: true, type: 'smooth', points }
    }
    if (id === 'builtin-figure-eight') {
      const points = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2
        return { pan: Math.sin(a) * 0.8, tilt: Math.sin(a * 2) * 0.8 }
      })
      return { id, name: 'Figure Eight', builtIn: true, type: 'smooth', points }
    }
    if (id === 'builtin-line') {
      return { id, name: 'Line', builtIn: true, type: 'line', points: [{ pan: -0.8, tilt: 0 }, { pan: 0.8, tilt: 0 }] }
    }
    return null
  }

  const editablePath: MovementPathDef | null = userPath ?? (builtin ? builtinAsPath(builtin.id) : null)

  const onPathChange = (next: MovementPathDef) => {
    if (!next.builtIn) {
      updateMovementPath(next.id, next)
      return
    }
    // Editing a built-in path duplicates it first (Guide p.168). During a
    // drag the canvas keeps calling with the built-in shape, so reuse the
    // copy once it exists instead of duplicating on every pointer move.
    const currentId = useShowStore.getState().effects.find((e) => e.id === effect.id)?.movementPathId
    const existingCopy = userPaths.find((p) => p.id === currentId)
    if (existingCopy) {
      updateMovementPath(existingCopy.id, { ...next, id: existingCopy.id, builtIn: false })
      return
    }
    const copy: MovementPathDef = { ...structuredClone(next), id: newEffectId(), name: `${next.name} copy`, builtIn: false }
    addMovementPath(copy)
    update({ movementPathId: copy.id })
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="listbox" aria-label="Movement paths">
        {BUILTIN_MOVEMENT_PATHS.map((path) => (
          <button
            key={path.id}
            type="button"
            role="option"
            aria-selected={selectedPathId === path.id}
            className={`rounded border px-2 py-1 text-xs ${selectedPathId === path.id ? 'border-[#0A84FF] bg-panel2' : 'border-line'}`}
            onClick={() => update({ movementPathId: path.id })}
          >
            {path.name}
          </button>
        ))}
        {userPaths.map((path) => (
          <span key={path.id} className={`flex items-center gap-1 rounded border px-1 py-0.5 text-xs ${selectedPathId === path.id ? 'border-[#0A84FF] bg-panel2' : 'border-line'}`}>
            {renameId === path.id ? (
              <input
                aria-label="Path name"
                value={renameName}
                autoFocus
                onChange={(event) => setRenameName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && renameName.trim()) {
                    updateMovementPath(path.id, { name: renameName.trim() })
                    setRenameId(null)
                  } else if (event.key === 'Escape') setRenameId(null)
                }}
                onBlur={() => setRenameId(null)}
                className="w-24 rounded bg-bg px-1 py-0.5 text-xs"
              />
            ) : (
              <button type="button" role="option" aria-selected={selectedPathId === path.id} onClick={() => update({ movementPathId: path.id })}>
                {path.name}
              </button>
            )}
            <button type="button" className="text-dim" title="Rename path" aria-label="Rename path" onClick={() => { setRenameId(path.id); setRenameName(path.name) }}>✎</button>
            <button
              type="button"
              className="text-dim"
              title="Delete path"
              aria-label="Delete path"
              onClick={() => {
                if (selectedPathId === path.id) update({ movementPathId: 'builtin-circle' })
                removeMovementPath(path.id)
              }}
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          className="rounded border border-dashed border-line px-2 py-1 text-xs text-dim"
          onClick={() => {
            const path: MovementPathDef = {
              id: newEffectId(),
              name: `Path ${userPaths.length + 1}`,
              type: 'smooth',
              points: [{ pan: -0.5, tilt: 0 }, { pan: 0.5, tilt: 0 }]
            }
            addMovementPath(path)
            update({ movementPathId: path.id })
          }}
        >
          + New Path
        </button>
      </div>
      {editablePath && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-dim">Type</span>
            <select
              aria-label="Path type"
              value={editablePath.type}
              disabled={Boolean(editablePath.builtIn)}
              onChange={(event) => onPathChange({ ...editablePath, type: event.target.value as MovementPathDef['type'] })}
              className="rounded bg-bg px-1 py-1 text-xs"
            >
              <option value="smooth">Smooth</option>
              <option value="line">Line</option>
              <option value="points">Points</option>
            </select>
          </label>
          {editablePath.builtIn && (
            <span className="text-[11px] text-dim">Built-in path — editing it duplicates it first.</span>
          )}
          {resolved && <span className="text-[11px] text-dim">{resolved.type === 'smooth' ? 'Smooth' : resolved.type === 'line' ? 'Line' : 'Points'} path</span>}
        </div>
      )}
      {editablePath && (
        <PathCanvas
          path={editablePath}
          onChange={onPathChange}
          durationMs={effect.durationMs ?? 2000}
          range={range}
        />
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <NumberField label="Time Offset (%)" value={effect.timeOffset ?? 0} min={0} max={100} step={1}
          onChange={(timeOffset) => update({ timeOffset })} />
        <NumberField label="Pan Offset (°)" value={effect.panOffset ?? 0} min={-180} max={180} step={1}
          onChange={(panOffset) => update({ panOffset })} />
        <NumberField label="Tilt Offset (°)" value={effect.tiltOffset ?? 0} min={-180} max={180} step={1}
          onChange={(tiltOffset) => update({ tiltOffset })} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={effect.mirrorPan ?? false} onChange={(event) => update({ mirrorPan: event.target.checked })} />
          Mirror Pan
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={effect.mirrorTilt ?? false} onChange={(event) => update({ mirrorTilt: event.target.checked })} />
          Mirror Tilt
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={effect.relative ?? false} onChange={(event) => update({ relative: event.target.checked })} />
          Relative
        </label>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The editor itself                                               */
/* ------------------------------------------------------------------ */

/** The effect icon LightKey shows in Design in place of a property's normal
 *  controls when that property is effect-controlled (Guide ch.10, p.149).
 *  Clicking it opens the effect in the editor. */
export function EffectIndicator({ effect, onEdit }: { effect: EffectDef; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onEdit() }}
      title={`Edit effect ${effect.name}`}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded border border-line bg-panel2 px-1 py-2 text-[11px] text-dim hover:border-[#0A84FF]"
    >
      <span aria-hidden="true" className="text-base leading-none">∿</span>
      <span className="max-w-full truncate">{effect.name}</span>
      <span className="text-[10px] uppercase tracking-wider">Effect</span>
    </button>
  )
}

export function EffectEditor() {
  const editingEffectId = useShowStore((s) => s.editingEffectId)
  const setEditingEffectId = useShowStore((s) => s.setEditingEffectId)
  const effect = useShowStore((s) => s.effects.find((e) => e.id === s.editingEffectId))
  const updateEffect = useShowStore((s) => s.updateEffect)
  const removeEffect = useShowStore((s) => s.removeEffect)
  const duplicateEffect = useShowStore((s) => s.duplicateEffect)
  const deleteEffectAndKeepValues = useShowStore((s) => s.deleteEffectAndKeepValues)
  const saveEffectTemplate = useShowStore((s) => s.saveEffectTemplate)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [includeFixtureOrder, setIncludeFixtureOrder] = useState(true)

  if (!editingEffectId || !effect) return null
  const update = (patch: Partial<EffectDef>) => updateEffect(effect.id, patch)
  const kind = effect.kind ?? 'curve'
  const kindLabel = kind === 'pattern' ? 'Pattern' : kind === 'movement' ? 'Movement' : 'Curve'

  const close = () => setEditingEffectId(null)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2" data-testid="effect-editor">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-sm">∿</span>
        <input
          aria-label="Effect name"
          value={effect.name}
          onChange={(event) => update({ name: event.target.value })}
          className="min-w-0 flex-1 rounded bg-bg px-2 py-1 text-sm font-medium"
        />
        <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-dim">
          {kindLabel} · {attributeLabel(effect.attribute)}
        </span>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={effect.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          On
        </label>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded border border-line px-2 py-1 text-xs" aria-label="Effect menu">•••</summary>
          <div className="absolute right-0 z-10 mt-1 flex min-w-44 flex-col rounded border border-line bg-panel2 p-1 text-xs shadow-lg">
            <button
              type="button"
              className="rounded px-2 py-1 text-left hover:bg-panel"
              onClick={(event) => {
                const id = duplicateEffect(effect.id)
                ;(event.target as HTMLElement).closest('details')?.removeAttribute('open')
                if (id) setEditingEffectId(id)
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-left hover:bg-panel"
              onClick={() => {
                setTemplateName(effect.name)
                setIncludeFixtureOrder(true)
                setSavingTemplate(true)
              }}
            >
              Save as Template…
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-left hover:bg-panel"
              onClick={() => { deleteEffectAndKeepValues(effect.id); close() }}
            >
              Delete and Keep Values
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-left text-red-400 hover:bg-panel"
              onClick={() => { removeEffect(effect.id); close() }}
            >
              Delete
            </button>
          </div>
        </details>
        <button type="button" className="text-xs text-dim" aria-label="Close effect editor" title="Close effect editor" onClick={close}>✕</button>
      </div>
      {savingTemplate && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-panel2 p-2 text-xs">
          <strong>Save as Template</strong>
          <input
            aria-label="Template name"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="min-w-0 flex-1 rounded bg-bg px-2 py-1 text-xs"
          />
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={includeFixtureOrder}
              onChange={(event) => setIncludeFixtureOrder(event.target.checked)}
            />
            Include fixture order
          </label>
          <button
            type="button"
            className="btn-theme text-xs"
            disabled={!templateName.trim()}
            onClick={() => {
              update({ name: templateName.trim() })
              saveEffectTemplate(effect.id, includeFixtureOrder)
              setSavingTemplate(false)
            }}
          >
            Save
          </button>
          <button type="button" className="text-xs text-dim" onClick={() => setSavingTemplate(false)}>Cancel</button>
        </div>
      )}
      <TimingControls effect={effect} update={update} />
      <FixtureOrderControls effect={effect} update={update} />
      {kind === 'pattern' && <PatternEditor effect={effect} update={update} />}
      {kind === 'curve' && <CurveEditor effect={effect} update={update} />}
      {kind === 'movement' && <MovementEditor effect={effect} update={update} />}
    </div>
  )
}
