import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { defaultSamples, isColorAttribute, normalizedPatternSamples } from '../lib/patternRuntime'
import { colorModelComponents, defaultCurvePoints, evaluateCurve, extraColorComponents, waveformPoints } from '../lib/curveEffects'
import { BUILTIN_MOVEMENT_PATHS, builtinMovementPathPoints, pathPointAt, resolveMovementPath } from '../lib/movementRuntime'
import {
  chartOffsetToNormalized,
  cmdDragTiltSign,
  formatPanTiltDegrees,
  nearestSegmentMidpoint,
  normalizedToChartOffset,
  samplePathPoints
} from '../lib/movementChart'
import { movementPoint } from '../lib/movementEffects'
import { effectableProperties } from '../lib/availableProperties'
import {
  EFFECT_TEMPLATE_SECTIONS,
  createEffectFromTemplate,
  defaultCurveComponents,
  defaultEffectDurationMs,
  type LightKeyTemplate
} from '../lib/effectTemplates'
import { getEffectTime } from '../lib/output'
import { panTiltRange } from '../lib/calibration'

/**
 * LightKey's visual effect editor (Guide ch.10, pp.146-175). The editor sits
 * below the Preview — in the Design panel — and edits one effect: its timing,
 * fixture order, and the pattern samples, drawable curves or movement path
 * that drive it. The effects chooser (same chapter) picks a template or a
 * custom effect to add.
 *
 * The built-in templates live in lib/effectTemplates.ts — LightKey's real
 * template names, kinds and beat flags from Jake's screenshots, with the
 * pattern behind each name flagged as a reading to confirm.
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
  { value: 4, label: '×4' },
  { value: 2, label: '×2' },
  { value: 1, label: '×1' },
  { value: 0.5, label: '÷2' },
  { value: 0.25, label: '÷4' }
]

function beatMultiplierLabel(value: number): string {
  return BEAT_MULTIPLIERS.find((m) => m.value === value)?.label ?? `×${value}`
}

/** Duration as LightKey shows it in the timing column (Guide p.149):
 *  minutes:seconds.tenths, e.g. 00:08.0. */
export function formatDurationMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 100) * 100)
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const tenths = Math.floor((total % 1000) / 100)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
}

/** Parse a duration the user typed: "mm:ss.t", "ss.t" or plain seconds. */
export function parseDurationMs(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const parts = trimmed.split(':')
  let seconds = 0
  if (parts.length === 1) {
    seconds = Number(parts[0])
  } else if (parts.length === 2) {
    const minutes = Number(parts[0])
    const secs = Number(parts[1])
    if (!Number.isFinite(minutes) || !Number.isFinite(secs)) return null
    seconds = minutes * 60 + secs
  } else {
    return null
  }
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return Math.max(50, Math.min(600000, Math.round(seconds * 1000 / 100) * 100))
}

/** The pulse glyph LightKey shows on beat-controlled templates. */
function BeatGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h4l2-6 4 12 2-6h8" />
    </svg>
  )
}

/** The clock glyph for the fixed-duration timing segment. */
function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function attributeLabel(attribute: string): string {
  if (attribute === 'intensity') return 'Dimmer'
  if (attribute === 'color') return 'Color'
  if (attribute === 'position') return 'Position'
  if (attribute === 'uv') return 'UV'
  return attribute.charAt(0).toUpperCase() + attribute.slice(1)
}

/** Which effect kinds apply to a property (Guide p.146): patterns are Dimmer
 *  and Color only; curves are any property; movement is Position. A single
 *  colour channel is not a pattern target — red alone is automated with a
 *  curve on Color, picking the red component. */
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

/** Small glyph for a pattern, used by the pattern picker and template tiles. */
function PatternGlyph({ pattern }: { pattern: PatternEffect }) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {pattern === 'chase' && <circle cx="9" cy="9" r="6" strokeDasharray="3 2" />}
      {pattern === 'scanner' && (<><line x1="2" y1="9" x2="16" y2="9" /><circle cx="9" cy="9" r="3" fill="currentColor" stroke="none" /></>)}
      {pattern === 'yo-yo' && (<><rect x="2" y="4" width="6" height="10" fill="currentColor" stroke="none" /><rect x="10" y="4" width="6" height="10" /></>)}
      {pattern === 'fill' && (<><rect x="2" y="4" width="14" height="10" /><rect x="2" y="4" width="7" height="10" fill="currentColor" stroke="none" /></>)}
      {pattern === 'rain' && (<><line x1="5" y1="3" x2="5" y2="8" /><line x1="9" y1="3" x2="9" y2="8" /><line x1="13" y1="3" x2="13" y2="8" /><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" /><circle cx="13" cy="12" r="1" fill="currentColor" stroke="none" /></>)}
      {pattern === 'meteor' && (<><line x1="3" y1="15" x2="11" y2="7" /><circle cx="14" cy="4" r="3" fill="currentColor" stroke="none" /></>)}
      {pattern === 'sparkle' && <path d="M9 2 L10.5 7.5 L16 9 L10.5 10.5 L9 16 L7.5 10.5 L2 9 L7.5 7.5 Z" fill="currentColor" stroke="none" />}
      {pattern === 'fire' && <path d="M9 2 C12 6 14 8 14 11 A5 5 0 0 1 4 11 C4 8 6 6 9 2 Z" fill="currentColor" stroke="none" />}
      {pattern === 'jellyfish' && (<><path d="M3 9 A6 6 0 0 1 15 9 Z" fill="currentColor" stroke="none" /><line x1="6" y1="11" x2="6" y2="15" /><line x1="9" y1="11" x2="9" y2="16" /><line x1="12" y1="11" x2="12" y2="15" /></>)}
      {pattern === 'snakes' && <path d="M2 12 C4 6 6 6 8 10 S12 14 16 10" />}
    </svg>
  )
}

/** The icon LightKey shows on a template tile: overlapping sample circles
 *  for a pattern, the curve's shape for a curve, the path's shape for a
 *  movement (Jake's screenshots, 9.15.56 / 9.16.05 / 9.16.22 pm). */
function TemplateIcon({ template }: { template: LightKeyTemplate }) {
  if (template.kind === 'pattern') {
    const samples = template.samples ?? defaultSamples(template.property === 'color')
    // LightKey's icons show the foreground colours when there are several
    // (Fire: red, orange, yellow, white); with two samples, background
    // and foreground (Barn Doors: black, white).
    const shown = samples.length > 3 ? samples.slice(1, 4) : samples.slice(0, 3)
    const colour = (sample: EffectSample) =>
      sample.color ?? `rgb(${Math.round(((sample.value ?? 0) / 100) * 255)}, ${Math.round(((sample.value ?? 0) / 100) * 255)}, ${Math.round(((sample.value ?? 0) / 100) * 255)})`
    return (
      <svg viewBox="0 0 36 20" width="36" height="20" aria-hidden="true" className="shrink-0">
        {shown.map((sample, i) => (
          <circle key={sample.id} cx={9 + i * 9} cy="10" r="6.5" fill={colour(sample)} opacity={i > 0 ? 0.85 : 1} />
        ))}
      </svg>
    )
  }
  if (template.kind === 'curve') {
    const components = template.curveComponents ?? defaultCurveComponents(template.property)
    const line = (points: CurveControlPoint[]) => {
      const sorted = [...points].sort((a, b) => a.x - b.x)
      return sorted.map((p) => `${2 + p.x * 32},${18 - p.y * 16}`).join(' ')
    }
    return (
      <svg viewBox="0 0 36 20" width="36" height="20" aria-hidden="true" className="shrink-0">
        {components[1] && <polyline points={line(components[1].points)} fill="none" stroke="#fb923c" strokeWidth="1.5" />}
        {components[0] && <polyline points={line(components[0].points)} fill="none" stroke="#22d3ee" strokeWidth="1.5" />}
      </svg>
    )
  }
  const resolved = template.movementPathId ? resolveMovementPath(template.movementPathId) : null
  let points: { pan: number; tilt: number }[] = []
  if (resolved) {
    points = Array.isArray(resolved.path)
      ? resolved.path
      : Array.from({ length: 16 }, (_, i) => movementPoint(resolved.path, i / 16))
  }
  const toXY = (p: { pan: number; tilt: number }) => `${18 + p.pan * 16},${10 - p.tilt * 8}`
  return (
    <svg viewBox="0 0 36 20" width="36" height="20" aria-hidden="true" className="shrink-0">
      {resolved?.type === 'points'
        ? points.map((p, i) => <circle key={i} cx={18 + p.pan * 16} cy={10 - p.tilt * 8} r="1.6" fill="#22d3ee" />)
        : points.length > 1 && (
          <polyline points={[...points, points[0]].map(toXY).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
        )}
    </svg>
  )
}

export function EffectsChooser({ chooserLeftHost, chooserSearchHost }: { chooserLeftHost?: HTMLElement | null; chooserSearchHost?: HTMLElement | null } = {}) {
  const attribute = useShowStore((s) => s.effectChooserAttribute)
  const setEffectChooserAttribute = useShowStore((s) => s.setEffectChooserAttribute)
  const effects = useShowStore((s) => s.effects)
  const show = useShowStore((s) => s.show)
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const addEffect = useShowStore((s) => s.addEffect)
  const removeEffect = useShowStore((s) => s.removeEffect)
  const applyEffectTemplate = useShowStore((s) => s.applyEffectTemplate)
  const startEditingEffectTemplate = useShowStore((s) => s.startEditingEffectTemplate)
  const updateEffectTemplate = useShowStore((s) => s.updateEffectTemplate)
  const editingEffectTemplateId = useShowStore((s) => s.editingEffectTemplateId)
  const renameEffectTemplate = useShowStore((s) => s.renameEffectTemplate)
  const duplicateEffectTemplate = useShowStore((s) => s.duplicateEffectTemplate)
  const deleteEffectTemplate = useShowStore((s) => s.deleteEffectTemplate)
  const setEditingEffectId = useShowStore((s) => s.setEditingEffectId)
  const previewEffectTemplateId = useShowStore((s) => s.previewEffectTemplateId)
  const setPreviewEffect = useShowStore((s) => s.setPreviewEffect)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'templates' | 'template-editor'>('templates')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Right-click menu on a saved template (LightKey's preset menu, 21 Nov
  // 2026 screenshot 10.49.20 pm) and its inline rename.
  const [templateMenu, setTemplateMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const templateMenuRef = useRef<HTMLDivElement>(null)
  const [renamingTemplate, setRenamingTemplate] = useState<{ id: string; name: string } | null>(null)
  const [renameTemplateValue, setRenameTemplateValue] = useState('')
  useEffect(() => {
    if (!templateMenu) return
    const close = (event: PointerEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) setTemplateMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [templateMenu])
  /** An effect already controls this property — LightKey asks Replace or Overlay (p.152). */
  const [conflict, setConflict] = useState<{ apply: () => void; existing: EffectDef } | null>(null)
  // The template editor opens on the property the wand menu picked.
  const [templateProperty, setTemplateProperty] = useState<string>('intensity')
  const [templateKind, setTemplateKind] = useState<'pattern' | 'curve' | 'movement'>('pattern')

  const fixtures = useMemo(
    () => (show?.fixtures ?? []).filter((f) => selectedFixtureIds.includes(f.id)),
    [show?.fixtures, selectedFixtureIds]
  )
  const effectable = useMemo(
    () => new Set(effectableProperties(fixtures).map((p) => p.attribute)),
    [fixtures]
  )
  const projectTemplates = useMemo(() => show?.effectTemplates ?? [], [show?.effectTemplates])

  // The show's saved templates, read through a ref so the open-on-pick
  // effect below doesn't re-run when one is saved mid-session.
  const projectTemplatesRef = useRef(projectTemplates)
  projectTemplatesRef.current = projectTemplates
  const hasTemplatesFor = (property: string) =>
    EFFECT_TEMPLATE_SECTIONS.some((s) => s.property === property) ||
    projectTemplatesRef.current.some((t) => t.attribute === property)

  useEffect(() => {
    setConflict(null)
    if (attribute) {
      setTemplateProperty(attribute)
      setTemplateKind(kindsForAttribute(attribute)[0])
      // A property with no templates — built-in or the show's saved ones —
      // goes straight to the effect template editor with that property
      // pre-selected (Jake's screenshot, 21 Nov 2026, 10.27.26 pm: Frost
      // opens the template editor, not an empty templates view).
      setMode(hasTemplatesFor(attribute) ? 'templates' : 'template-editor')
    }
  }, [attribute])

  /** The section each property's templates live in, so opening the view
   *  can land on the picked property (Jake, 21 Nov 2026). */
  const sectionRefs = useRef(new Map<string, HTMLElement>())
  // Opening the templates view from the wand menu lands on the picked
  // property's section — and so does coming back from the template
  // editor, since the picked property is still in context. A property
  // with no section (Focus, Frost) or filtered out by search simply
  // doesn't scroll. Manual scrolling is untouched: this only runs when
  // the picked property or the view mode changes.
  useEffect(() => {
    if (mode !== 'templates' || !attribute) return
    sectionRefs.current.get(attribute)?.scrollIntoView?.({ block: 'start' })
  }, [attribute, mode])

  // The preview belongs to the selection it was started on; selecting
  // different fixtures stops it rather than previewing on the old ones.
  useEffect(() => {
    if (previewEffectTemplateId) setPreviewEffect(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFixtureIds])

  if (!attribute) return null
  const label = attributeLabel(attribute)

  const existingFor = (property: string) =>
    effects.find(
      (e) => e.enabled && e.attribute === property && (e.fixtureIds.length === 0 || e.fixtureIds.some((id) => selectedFixtureIds.includes(id)))
    )

  const openEditor = (id: string) => {
    setEffectChooserAttribute(null)
    setEditingEffectId(id)
  }

  // Clicking a template tile previews it live on the selected fixtures
  // (Jake, 25 Nov 2026): the effect runs in the Preview without being
  // added or stored. Clicking the same tile again stops it; clicking
  // another tile switches to that template. Only the Add button applies
  // it. The preview effect is session-only (store, never in the show),
  // so it can never be captured into a cue or survive a reload.
  const togglePreview = (template: LightKeyTemplate) => {
    if (previewEffectTemplateId === template.id) { setPreviewEffect(null); return }
    setPreviewEffect({ ...createEffectFromTemplate(template, selectedFixtureIds), enabled: true }, template.id)
  }
  const toggleProjectPreview = (template: EffectDef) => {
    if (previewEffectTemplateId === template.id) { setPreviewEffect(null); return }
    setPreviewEffect({ ...structuredClone(template), id: crypto.randomUUID(), fixtureIds: [...selectedFixtureIds], enabled: true }, template.id)
  }

  const addBuiltIn = (template: LightKeyTemplate) => {
    setPreviewEffect(null)
    const run = () => {
      const effect = createEffectFromTemplate(template, selectedFixtureIds)
      addEffect(effect)
      openEditor(effect.id)
    }
    const clash = existingFor(template.property)
    if (clash && !conflict) {
      setConflict({ apply: run, existing: clash })
      return
    }
    run()
  }

  const addProjectTemplate = (id: string) => {
    const template = projectTemplates.find((t) => t.id === id)
    if (!template) return
    setPreviewEffect(null)
    const run = () => {
      const newId = applyEffectTemplate(id)
      if (newId) openEditor(newId)
    }
    const clash = existingFor(template.attribute)
    if (clash && !conflict) {
      setConflict({ apply: run, existing: clash })
      return
    }
    run()
  }

  // Edit a saved template (LightKey Guide ch.9, p.128: hover the preset
  // and click Edit): a working copy opens in the editor and the session
  // binds to the template, so Update can write back to it. Same
  // Replace/Overlay conflict flow as adding.
  const editProjectTemplate = (id: string) => {
    const template = projectTemplates.find((t) => t.id === id)
    if (!template) return
    setPreviewEffect(null)
    const run = () => {
      const newId = startEditingEffectTemplate(id)
      if (newId) openEditor(newId)
    }
    const clash = existingFor(template.attribute)
    if (clash && !conflict) {
      setConflict({ apply: run, existing: clash })
      return
    }
    run()
  }

  const commitTemplateRename = () => {
    if (!renamingTemplate) return
    if (renameTemplateValue.trim()) renameEffectTemplate(renamingTemplate.id, renameTemplateValue.trim())
    setRenamingTemplate(null)
  }

  const createCustomEffect = (): EffectDef => {
    const base: EffectDef = {
      id: newEffectId(),
      name: `${attributeLabel(templateProperty)} Effect`,
      fixtureIds: [...selectedFixtureIds],
      attribute: templateProperty,
      waveform: 'sine',
      speed: 1,
      syncToBpm: false,
      size: 255,
      offset: 128,
      phaseSpread: 0,
      enabled: true,
      kind: templateKind,
      durationMs: defaultEffectDurationMs(templateProperty),
      timingMode: 'fixed'
    }
    if (templateKind === 'pattern') {
      return { ...base, pattern: 'chase', samples: defaultSamples(isColorAttribute(templateProperty)) }
    }
    if (templateKind === 'curve') {
      return { ...base, curveComponents: defaultCurveComponents(templateProperty) }
    }
    return { ...base, movementPathId: 'builtin-circle' }
  }

  const addCustomEffect = () => {
    setPreviewEffect(null)
    const run = () => {
      const effect = createCustomEffect()
      addEffect(effect)
      openEditor(effect.id)
    }
    const clash = existingFor(templateProperty)
    if (clash && !conflict) {
      setConflict({ apply: run, existing: clash })
      return
    }
    run()
  }

  const resolveConflict = (mode: 'replace' | 'overlay') => {
    if (!conflict) return
    if (mode === 'replace') removeEffect(conflict.existing.id)
    const apply = conflict.apply
    setConflict(null)
    apply()
  }

  const conflictAlert = conflict && (
    <div className="rounded border border-line bg-panel2 p-2 text-xs" role="alert">
      <p className="mb-2">
        <strong>{conflict.existing.name}</strong> already controls {attributeLabel(conflict.existing.attribute)} for these fixtures.
        Replace it, or overlay the new effect on top of it?
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn-theme text-xs" onClick={() => resolveConflict('replace')}>Replace</button>
        <button type="button" className="btn-theme text-xs" onClick={() => resolveConflict('overlay')}>Overlay</button>
        <button type="button" className="text-xs text-dim" onClick={() => setConflict(null)}>Cancel</button>
      </div>
    </div>
  )

  const searchField = (
    <input
      aria-label="Search effects"
      placeholder="Search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      className="ml-auto min-w-0 rounded bg-bg px-2 py-1 text-xs sm:w-40"
    />
  )
  // The mode-swap button and the search live in the panel-level header
  // row (Jake, 22 Nov 2026; LightKey screenshot 12.03.49 am): the swap
  // pill far left, Design/Live centred, Search at the right — one
  // header row, not two. Portalled there when the hosts exist; inline
  // at the top of the chooser when they don't (standalone tests).
  // Exiting the chooser is via Design/Live or Esc (App's escape
  // command) — there is no Close button, as in LightKey.
  const swapButton = mode === 'templates' ? (
    <button
      type="button"
      className="shrink-0 rounded-full border border-line bg-panel2 px-3 py-1 text-xs font-medium"
      onClick={() => { setPreviewEffect(null); setMode('template-editor') }}
    >
      Custom Effect
    </button>
  ) : (
    <button
      type="button"
      className="shrink-0 rounded-full border border-line bg-panel2 px-3 py-1 text-xs font-medium"
      onClick={() => setMode('templates')}
    >
      Effect Template
    </button>
  )
  const swapNode = chooserLeftHost ? createPortal(swapButton, chooserLeftHost) : swapButton
  const searchNode = chooserSearchHost ? createPortal(searchField, chooserSearchHost) : searchField
  const hasChooserHosts = Boolean(chooserLeftHost && chooserSearchHost)
  const chooserHeader = hasChooserHosts ? (
    <>{swapNode}{searchNode}</>
  ) : (
    <div className="flex items-center gap-2">{swapNode}{searchNode}</div>
  )

  if (mode === 'template-editor') {
    // The effect template editor (Guide ch.10, pp.148-149; Jake's
    // screenshot, 9.28.18 pm): pick a fixture property and an effect
    // kind, then Add Effect opens the editor for a fresh custom effect.
    const kinds = kindsForAttribute(templateProperty)
    const properties = effectableProperties(fixtures)
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2" data-testid="effects-chooser">
        {chooserHeader}
        {conflictAlert}
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-2">
          <label className="flex items-center gap-2 text-sm">
            <span>Fixture property:</span>
            <select
              aria-label="Fixture property"
              value={templateProperty}
              onChange={(event) => {
                const next = event.target.value
                setTemplateProperty(next)
                const nextKinds = kindsForAttribute(next)
                if (!nextKinds.includes(templateKind)) setTemplateKind(nextKinds[0])
              }}
              className="rounded bg-bg px-2 py-1 text-sm"
            >
              {properties.map((p) => <option key={p.attribute} value={p.attribute}>{p.label}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-4">
            <span className="text-sm">Effect:</span>
            <div className="flex gap-5" role="radiogroup" aria-label="Effect kind">
              {/* LightKey shows all three kinds and greys out the ones
                  that don't apply to the property (Jake's screenshot, 21
                  Nov 2026, 10.27.26 pm: Pattern and Movement are dimmed
                  for Frost, Curve is selected). */}
              {(['pattern', 'curve', 'movement'] as const).map((kind) => {
                const offered = kinds.includes(kind)
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={templateKind === kind}
                    disabled={!offered}
                    className={`flex flex-col items-center gap-1 text-xs ${offered ? '' : 'opacity-40'}`}
                    onClick={() => setTemplateKind(kind)}
                  >
                  <span className="flex h-10 w-10 items-center justify-center rounded border border-line bg-panel2 text-[var(--text)]">
                    {kind === 'pattern' && (
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="9" cy="12" r="6" fill="currentColor" opacity="0.45" /><circle cx="15" cy="12" r="6" fill="currentColor" opacity="0.85" /></svg>
                    )}
                    {kind === 'curve' && (
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12 C5 4 8 4 11 12 S17 20 22 12" /></svg>
                    )}
                    {kind === 'movement' && (
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3 C16 3 20 7 20 12 C20 17 16 21 12 21 C8 21 4 17 4 12 C4 7 8 3 12 3 Z M12 8 C14 8 16 10 16 12 C16 14 14 16 12 16" /></svg>
                    )}
                  </span>
                  {kind === 'pattern' ? 'Pattern' : kind === 'curve' ? 'Curve' : 'Movement'}
                  <span className={`h-1 w-10 rounded-full ${templateKind === kind ? 'bg-[#0A84FF]' : 'bg-transparent'}`} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded px-3 py-1 text-xs" onClick={() => setMode('templates')}>Cancel</button>
            <button
              type="button"
              className="rounded bg-[#22c55e] px-4 py-1.5 text-xs font-semibold text-white"
              onClick={addCustomEffect}
            >
              Add Effect
            </button>
          </div>
        </div>
      </div>
    )
  }

  // The template presets view (Guide ch.10, p.148; Jake's screenshots,
  // 9.15.56 / 9.16.05 / 9.16.22 pm): sections grouped by fixture property,
  // each template a tile with its icon and name; beat-controlled templates
  // carry the pulse icon. Hovering a tile reveals the green Add pill;
  // clicking the tile adds that template and opens its editor. Templates
  // which don't apply to the selected fixtures appear gray.
  const q = query.trim().toLowerCase()
  const matches = (name: string) => !q || name.toLowerCase().includes(q)
  const visibleSections = EFFECT_TEMPLATE_SECTIONS
    .map((section) => ({ ...section, templates: section.templates.filter((t) => matches(t.name)) }))
    .filter((section) => section.templates.length > 0)
  const visibleProject = projectTemplates.filter((t) => matches(t.name))

  // Clicking a tile previews the template live on the selected fixtures
  // (Jake, 25 Nov 2026); only the Add pill applies it. The tile is a
  // div, not a button, because the Add pill is its own button inside
  // it — a button inside a button is invalid HTML.
  const tile = (template: LightKeyTemplate) => {
    const grayed = !effectable.has(template.property)
    const previewing = previewEffectTemplateId === template.id
    return (
      <div
        key={template.id}
        data-template-tile
        role="button"
        tabIndex={grayed ? -1 : 0}
        aria-disabled={grayed}
        aria-label={`${template.name} template${previewing ? ' (previewing)' : ''}`}
        className={`relative flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs ${grayed ? 'cursor-not-allowed border-line bg-panel2 opacity-40' : previewing ? 'border-[var(--accent)] bg-panel2' : 'border-line bg-panel2 hover:border-[var(--accent)]'}`}
        onMouseEnter={() => setHoveredId(template.id)}
        onMouseLeave={() => setHoveredId((current) => (current === template.id ? null : current))}
        onFocus={() => setHoveredId(template.id)}
        onBlur={(event) => {
          // Clicking the Add pill moves focus from the tile to the pill
          // inside it — that must not hide the pill mid-click (the
          // mousedown focuses the pill, the tile blurs, the pill
          // unmounts, and the mouseup lands on the Previewing chip
          // instead, so no click ever fires). Only clear when focus
          // leaves the tile entirely.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setHoveredId((current) => (current === template.id ? null : current))
        }}
        onClick={() => { if (!grayed) togglePreview(template) }}
        onKeyDown={(event) => {
          if (grayed || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          togglePreview(template)
        }}
      >
        <TemplateIcon template={template} />
        <span className="min-w-0 flex-1 truncate font-medium">{template.name}</span>
        {template.beat && <span className="shrink-0 text-dim" title="Beat-controlled"><BeatGlyph /></span>}
        {previewing && hoveredId !== template.id && !grayed && (
          <span className="absolute right-2 rounded bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">Previewing</span>
        )}
        {hoveredId === template.id && !grayed && (
          <button
            type="button"
            aria-label={`Add ${template.name}`}
            onClick={(event) => { event.stopPropagation(); addBuiltIn(template) }}
            className="absolute right-2 rounded bg-[#22c55e] px-2 py-0.5 text-xs font-semibold text-white"
          >
            Add
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2"
      data-testid="effects-chooser"
      onPointerDown={(event) => {
        // Clicking blank space in the chooser stops a running template
        // preview (like the preset palette's blank-space clear); clicks
        // on tiles, buttons or the search field leave it running.
        if (!(event.target as HTMLElement).closest('button, input, [data-template-tile], [role="button"], a')) setPreviewEffect(null)
      }}
    >
      {chooserHeader}
      {conflictAlert}
      {visibleSections.map((section) => (
        <section
          key={section.property}
          aria-label={`${section.label} templates`}
          ref={(el) => {
            if (el) sectionRefs.current.set(section.property, el)
            else sectionRefs.current.delete(section.property)
          }}
        >
          <h3 className="px-1 pb-1 text-sm">{section.label}</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
            {section.templates.map(tile)}
          </div>
        </section>
      ))}
      {visibleSections.length === 0 && visibleProject.length === 0 && (
        <span className="text-[11px] text-dim">No templates match.</span>
      )}
      {visibleProject.length > 0 && (
        <section aria-label="Your templates">
          <h3 className="px-1 pb-1 text-sm">Your Templates</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
            {visibleProject.map((template) => {
              const beingEdited = editingEffectTemplateId === template.id
              const renaming = renamingTemplate?.id === template.id
              const previewing = previewEffectTemplateId === template.id
              return (
                <div
                  key={template.id}
                  data-template-tile
                  className={`relative flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs ${beingEdited ? 'border-yellow-400 bg-yellow-400/15' : previewing ? 'border-[var(--accent)] bg-panel2' : 'border-line bg-panel2 hover:border-[var(--accent)]'}`}
                  onMouseEnter={() => setHoveredId(template.id)}
                  onMouseLeave={() => setHoveredId((current) => (current === template.id ? null : current))}
                  onContextMenu={(event) => {
                    event.preventDefault(); event.stopPropagation()
                    setTemplateMenu({ x: event.clientX, y: event.clientY, id: template.id })
                  }}
                >
                  <button
                    type="button"
                    aria-label={`${template.name} template${previewing ? ' (previewing)' : ''}`}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => toggleProjectPreview(template)}
                  >
                    {renaming ? (
                      <input
                        aria-label="Rename template"
                        ref={(el) => el?.focus()}
                        value={renameTemplateValue}
                        onChange={(event) => setRenameTemplateValue(event.target.value)}
                        onBlur={commitTemplateRename}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter') commitTemplateRename()
                          else if (event.key === 'Escape') setRenamingTemplate(null)
                        }}
                        className="min-w-0 flex-1 rounded bg-bg px-1 py-0.5 text-xs"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-medium">{template.name}</span>
                    )}
                    <span className="shrink-0 text-[10px] text-dim">Saved template</span>
                  </button>
                  {/* Hovering a saved template shows a yellow Edit button
                      (LightKey Guide ch.9, p.128); while it is being
                      edited the row shows a yellow Update button instead
                      (Jake's 10.40.51 pm screenshot). Clicking the row
                      previews the template (Jake, 25 Nov 2026); the green
                      Add button applies it. */}
                  {previewing && hoveredId !== template.id && !renaming && !beingEdited && (
                    <span className="absolute right-2 rounded bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">Previewing</span>
                  )}
                  {beingEdited ? (
                    <button
                      type="button"
                      aria-label={`Update ${template.name}`}
                      className="shrink-0 rounded bg-yellow-400 px-2 py-0.5 text-xs font-semibold text-black"
                      onClick={() => updateEffectTemplate()}
                    >
                      Update
                    </button>
                  ) : hoveredId === template.id && !renaming && (
                    <span className="absolute right-2 flex gap-1">
                      <button
                        type="button"
                        aria-label={`Add ${template.name}`}
                        className="shrink-0 rounded bg-[#22c55e] px-2 py-0.5 text-xs font-semibold text-white"
                        onClick={() => addProjectTemplate(template.id)}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${template.name}`}
                        className="shrink-0 rounded bg-yellow-400 px-2 py-0.5 text-xs font-semibold text-black"
                        onClick={() => editProjectTemplate(template.id)}
                      >
                        Edit
                      </button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
      {templateMenu && <EffectTemplateContextMenu
        x={templateMenu.x}
        y={templateMenu.y}
        templateId={templateMenu.id}
        templateName={projectTemplates.find((t) => t.id === templateMenu.id)?.name ?? ''}
        menuRef={templateMenuRef}
        onClose={() => setTemplateMenu(null)}
        onAction={(action) => {
          const id = templateMenu.id
          const template = projectTemplates.find((t) => t.id === id)
          setTemplateMenu(null)
          if (action === 'apply') addProjectTemplate(id)
          else if (action === 'edit') editProjectTemplate(id)
          else if (action === 'rename') {
            if (template) { setRenamingTemplate({ id, name: template.name }); setRenameTemplateValue(template.name) }
          } else if (action === 'duplicate') duplicateEffectTemplate(id)
          else if (action === 'delete') {
            if (template && confirm(`Delete template “${template.name}”?`)) deleteEffectTemplate(id)
          } else if (action === 'new-preset' || action === 'new-preset-snapshot' || action === 'new-group' || action === 'new-sequence') {
            // The palette owns the composer; ask it to open (same event
            // shape the palette's own menu uses internally).
            window.dispatchEvent(new CustomEvent('openlights-palette-composer', { detail: { type: action === 'new-preset' ? 'preset' : action === 'new-preset-snapshot' ? 'preset-snapshot' : action === 'new-group' ? 'group' : 'sequence' } }))
          }
        }}
      />}
    </div>
  )
}

type EffectTemplateMenuAction =
  | 'apply' | 'edit' | 'rename' | 'duplicate' | 'delete'
  | 'new-preset' | 'new-preset-snapshot' | 'new-group' | 'new-sequence'

// Right-click menu on a saved effect template, modelled on LightKey's
// preset menu (Jake's screenshot, 21 Nov 2026, 10.49.20 pm: Show
// Properties, Apply, Edit, Add Overrides, Rename, Duplicate, Delete,
// External Control, New Preset, New Preset With Snapshot, New Group,
// New Group From Selection, New Sequence, New Sequence From Selection).
// Four entries have no OpenLights equivalent and are left out:
// Show Properties — a template's properties are the editor itself
// (Edit opens it); Add Overrides — a template holds no static fixture
// values to add as overrides; External Control — no such feature;
// New Group/Sequence From Selection — the chooser has no template
// multi-select to take a selection from.
function EffectTemplateContextMenu({ x, y, templateId, templateName, menuRef, onClose, onAction }: {
  x: number; y: number; templateId: string; templateName: string
  menuRef: { current: HTMLDivElement | null }
  onClose: () => void
  onAction: (action: EffectTemplateMenuAction) => void
}) {
  // The chooser lives in the bottom panel, so a menu opened at the
  // click point can run off the bottom of the window (its lower items
  // then can't be clicked). Clamp it into the viewport after mount.
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    })
  }, [x, y, menuRef])
  const item = (action: EffectTemplateMenuAction, label: string) => (
    <button key={action} type="button" role="menuitem"
      className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2"
      onClick={() => onAction(action)}>{label}</button>
  )
  return (
    <div ref={menuRef} role="menu" aria-label={`${templateName} actions`} className="fixed z-[300] min-w-56 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: pos.left, top: pos.top }}>
      {item('apply', 'Apply')}
      {item('edit', 'Edit')}
      <div className="my-1 border-t border-line" />
      {item('rename', 'Rename')}
      {item('duplicate', 'Duplicate')}
      {item('delete', 'Delete')}
      <div className="my-1 border-t border-line" />
      {item('new-preset', 'New Preset')}
      {item('new-preset-snapshot', 'New Preset With Snapshot')}
      {item('new-group', 'New Group')}
      {item('new-sequence', 'New Sequence')}
      <div className="my-1 border-t border-line" />
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={onClose}>Close</button>
    </div>
  )
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

/** Up/down steppers, LightKey style (small chevrons beside a value). */
function StepperButtons({ onUp, onDown, upLabel, downLabel }: {
  onUp: () => void
  onDown: () => void
  upLabel: string
  downLabel: string
}) {
  return (
    <span className="flex shrink-0 flex-col leading-none">
      <button type="button" aria-label={upLabel} title={upLabel} className="px-0.5 text-[9px] text-dim hover:text-[var(--text)]" onClick={onUp}>▲</button>
      <button type="button" aria-label={downLabel} title={downLabel} className="px-0.5 text-[9px] text-dim hover:text-[var(--text)]" onClick={onDown}>▼</button>
    </span>
  )
}

/** The duration field (mm:ss.t, LightKey's timing column). The text is
 *  local state so typing "00:04.0" doesn't reformat mid-keystroke; it
 *  commits on blur or Return. */
function DurationField({ valueMs, onChange }: { valueMs: number; onChange: (ms: number) => void }) {
  const [text, setText] = useState(() => formatDurationMs(valueMs))
  useEffect(() => { setText(formatDurationMs(valueMs)) }, [valueMs])
  const commit = () => {
    const parsed = parseDurationMs(text)
    if (parsed !== null) onChange(parsed)
    else setText(formatDurationMs(valueMs))
  }
  return (
    <span className="flex items-center gap-1">
      <input
        aria-label="Duration"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }}
        className="w-20 rounded bg-bg px-2 py-1 text-center text-sm"
      />
      <StepperButtons
        upLabel="Increase duration"
        downLabel="Decrease duration"
        onUp={() => onChange(Math.min(600000, valueMs + 100))}
        onDown={() => onChange(Math.max(50, valueMs - 100))}
      />
    </span>
  )
}

/** The left timing column (Guide p.149; Jake's screenshots, 9.31.29 /
 *  9.33.33 / 9.34.46 pm): a clock/pulse toggle, then the Duration
 *  (mm:ss.t) or the Beat Multiplier (×N with steppers) below it. Two
 *  segments only — LightKey's toggle is clock/pulse. Random timing
 *  (Guide p.150: "Some pattern effects are entirely random") is a
 *  property of some patterns, not a timing control: the engine keeps a
 *  'random' timing mode internally, but the UI never offers it. An
 *  effect saved with it (from an older build) keeps the mode until the
 *  user picks Duration or Beat Multiplier here. */
function TimingColumn({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const canBeat = effect.kind !== 'movement'
  const mode = effect.timingMode ?? (effect.syncToBpm ? 'beat' : 'fixed')
  const beatIndex = BEAT_MULTIPLIERS.findIndex((m) => m.value === (effect.beatMultiplier ?? 1))
  const stepBeat = (direction: 1 | -1) => {
    const current = beatIndex < 0 ? 2 : beatIndex
    const next = BEAT_MULTIPLIERS[Math.max(0, Math.min(BEAT_MULTIPLIERS.length - 1, current + direction))]
    update({ beatMultiplier: next.value })
  }
  return (
    <div className="flex w-28 shrink-0 flex-col items-start gap-2" aria-label="Timing">
      <div className="flex rounded-lg border border-line bg-panel2" role="group" aria-label="Timing mode">
        <button
          type="button"
          aria-label="Fixed duration"
          aria-pressed={mode === 'fixed'}
          title="Fixed duration"
          className={`flex h-9 w-11 items-center justify-center rounded-l-lg ${canBeat ? '' : 'rounded-r-lg'} ${mode === 'fixed' ? 'bg-panel font-medium' : 'text-dim'}`}
          onClick={() => update({ timingMode: 'fixed' })}
        >
          <ClockGlyph />
        </button>
        {canBeat && (
          <button
            type="button"
            aria-label="Beat-controlled"
            aria-pressed={mode === 'beat'}
            title="Beat-controlled"
            className={`flex h-9 w-11 items-center justify-center rounded-r-lg ${mode === 'beat' ? 'bg-panel font-medium' : 'text-dim'}`}
            onClick={() => update({ timingMode: 'beat' })}
          >
            <BeatGlyph />
          </button>
        )}
      </div>
      {mode === 'fixed' && (
        <div className="flex flex-col items-start gap-1">
          <DurationField valueMs={effect.durationMs ?? 2000} onChange={(durationMs) => update({ durationMs })} />
          <span className="text-[11px] text-dim">Duration</span>
        </div>
      )}
      {mode === 'beat' && (
        <div className="flex flex-col items-start gap-1">
          <span className="flex items-center gap-1">
            <span className="flex h-8 w-20 items-center justify-center rounded bg-bg text-sm" aria-label="Beat multiplier">
              {beatMultiplierLabel(effect.beatMultiplier ?? 1)}
            </span>
            <StepperButtons
              upLabel="Increase beat multiplier"
              downLabel="Decrease beat multiplier"
              onUp={() => stepBeat(-1)}
              onDown={() => stepBeat(1)}
            />
          </span>
          <span className="text-[11px] text-dim">Beat Multiplier</span>
        </div>
      )}
      {mode === 'random' && <span className="text-[11px] text-dim">No fixed cycle — a new random order each time.</span>}
    </div>
  )
}

/** LightKey's Fixture Order menu entries in LightKey's order (Jake's
 *  screenshot, 11.52.59 pm). The engine values are the same orders the
 *  runtime already implements (lib/effects.ts); the labels are
 *  LightKey's own ("By Short Name, Ascending", not our "(A–Z)"). */
const FIXTURE_ORDER_MENU: { value: EffectFixtureOrder; label: string }[] = [
  { value: 'left-right', label: 'Left to Right' },
  { value: 'right-left', label: 'Right to Left' },
  { value: 'top-bottom', label: 'Top to Bottom' },
  { value: 'bottom-top', label: 'Bottom to Top' },
  { value: 'custom-direction', label: 'Custom Direction…' },
  { value: 'short-name-asc', label: 'By Short Name, Ascending' },
  { value: 'short-name-desc', label: 'By Short Name, Descending' },
  { value: 'address-asc', label: 'By Address, Ascending' },
  { value: 'address-desc', label: 'By Address, Descending' },
  { value: 'random-fixed', label: 'Random (Fixed)' },
  { value: 'random-variable', label: 'Random (Variable)' },
  { value: 'custom', label: 'Custom Order…' }
]

/** One row of the Fixture Order menu: checkmark column, label, and an
 *  optional ▸ for a submenu (LightKey's menu, 11.52.59 pm). */
function FixtureOrderMenuItem({ label, checked, disabled, title, hasSubmenu, onClick }: {
  label: string
  checked?: boolean
  disabled?: boolean
  title?: string
  hasSubmenu?: boolean
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onClick}
    >
      <span className="w-4 shrink-0 text-center" aria-hidden="true">{checked ? '✓' : ''}</span>
      <span className="min-w-0 flex-1">{label}</span>
      {hasSubmenu && <span aria-hidden="true">›</span>}
    </button>
  )
}

/** Clamp a fixed-position menu into the viewport after it mounts
 *  (jsdom reports 0 sizes, so this is a no-op there). */
function useClampedMenu(open: boolean, ref: React.RefObject<HTMLDivElement | null>, pos: { top: number; left: number } | null, setPos: (pos: { top: number; left: number }) => void) {
  useLayoutEffect(() => {
    if (!open || !ref.current || !pos) return
    const el = ref.current
    const height = el.offsetHeight
    const width = el.offsetWidth
    if (!height && !width) return
    let { top, left } = pos
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8)
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
    if (left < 8) left = 8
    if (top !== pos.top || left !== pos.left) setPos({ top, left })
  }, [open, pos, ref, setPos])
}

/** The Fixture Order menu (Guide ch.10, pp.151-152; Jake's screenshot,
 *  11.52.59 pm): the direction orders, the By Short Name / By Address
 *  sorts, Random (Fixed) / Random (Variable), Custom Order…, Consider
 *  Spacing, Select Fixtures / Select Beams, the Origin / Grouping /
 *  Repeat submenus, and Change Fixtures…. The menu is portalled to the
 *  document body (fixed) — the bottom panel clips anything that opens
 *  downward inside it, and this menu is far taller than the panel, so
 *  it opens over the Preview instead and clamps into the viewport.
 *
 *  Honest gaps, flagged (Jake, 21 Nov 2026): Custom Direction's drag
 *  across fixtures in the Preview is not built — the menu sets the
 *  order and the angle is edited in the menu's footer (LightKey sets
 *  it by dragging). Custom Order's number-editing in the Preview is
 *  not built — the menu sets the order and the numbers have nowhere
 *  to be edited yet. Change Fixtures… applies the fixtures currently
 *  selected in the Preview; LightKey opens a picking mode with an OK
 *  button instead. The Grouping/Repeat submenu contents (a number
 *  field each) are our own presentation — the guide defines the
 *  semantics, not the menu. The fixture-order hover preview (Guide
 *  p.151) is not built. */
function FixtureOrderControls({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const order = effect.fixtureOrder ?? 'forward'
  const kind = effect.kind ?? 'curve'
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [submenu, setSubmenu] = useState<{ kind: 'origin' | 'grouping' | 'repeat'; top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  useClampedMenu(menuOpen, menuRef, menuPos, setMenuPos)
  useClampedMenu(Boolean(submenu), submenuRef, submenu ? { top: submenu.top, left: submenu.left } : null, (pos) => setSubmenu((current) => (current ? { ...current, ...pos } : current)))

  // Close on a click outside the trigger, the menu or the submenu, and
  // on Escape — the menu is portalled to the body, so the check spans
  // both trees.
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      if (submenuRef.current?.contains(target)) return
      setMenuOpen(false)
      setSubmenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); setSubmenu(null) }
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    setMenuPos(rect ? { top: rect.bottom + 4, left: rect.right - 288 } : { top: 8, left: 8 })
    setSubmenu(null)
    setMenuOpen(true)
  }
  const closeMenu = () => { setMenuOpen(false); setSubmenu(null) }
  const pickOrder = (value: EffectFixtureOrder) => { update({ fixtureOrder: value }); closeMenu() }
  const openSubmenu = (event: React.MouseEvent<HTMLButtonElement>, kind: 'origin' | 'grouping' | 'repeat') => {
    const rect = event.currentTarget.getBoundingClientRect()
    setSubmenu({ kind, top: rect.top - 4, left: rect.left - 196 })
  }
  // The stored order has no LightKey menu entry for the legacy
  // patch/reverse orders, so no entry is checked for them; the legacy
  // 'random' is the fixed random (a stable hash), so it checks
  // Random (Fixed).
  const orderChecked = (value: EffectFixtureOrder) => order === value || (value === 'random-fixed' && order === 'random')
  // Guide p.151: Consider Spacing is available for curve and movement
  // effects only — LightKey greys it for a pattern effect.
  const spacingDisabled = kind === 'pattern'
  // Guide p.152: Origin does not apply to random or custom orders.
  const originDisabled = ['random', 'random-fixed', 'random-variable', 'custom'].includes(order)

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-label="Fixture order menu"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => (menuOpen ? closeMenu() : openMenu())}
        className="text-sm hover:text-[var(--text)]"
      >
        Fixture Order <span aria-hidden="true">⌄</span>
      </button>
      {menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Fixture order"
          className="fixed z-[100] flex w-72 flex-col rounded-lg border border-line bg-panel2 p-1 shadow-xl"
          style={{ top: menuPos.top, left: menuPos.left, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
        >
          {FIXTURE_ORDER_MENU.map((entry) => (
            <FixtureOrderMenuItem
              key={entry.value}
              label={entry.label}
              checked={orderChecked(entry.value)}
              onClick={() => pickOrder(entry.value)}
            />
          ))}
          <div role="separator" className="my-1 border-t border-line" />
          <FixtureOrderMenuItem
            label="Consider Spacing"
            checked={effect.considerSpacing ?? false}
            disabled={spacingDisabled}
            title={spacingDisabled ? 'Consider Spacing is available for curve and movement effects only' : undefined}
            onClick={() => { update({ considerSpacing: !(effect.considerSpacing ?? false) }); closeMenu() }}
          />
          <div role="separator" className="my-1 border-t border-line" />
          <FixtureOrderMenuItem
            label="Select Fixtures"
            checked={(effect.pixelMode ?? 'beams') === 'fixtures'}
            onClick={() => { update({ pixelMode: 'fixtures' }); closeMenu() }}
          />
          <FixtureOrderMenuItem
            label="Select Beams"
            checked={(effect.pixelMode ?? 'beams') === 'beams'}
            onClick={() => { update({ pixelMode: 'beams' }); closeMenu() }}
          />
          <div role="separator" className="my-1 border-t border-line" />
          <FixtureOrderMenuItem
            label="Origin"
            hasSubmenu
            disabled={originDisabled}
            title={originDisabled ? 'Origin does not apply to random or custom orders' : undefined}
            onClick={(event) => openSubmenu(event, 'origin')}
          />
          <FixtureOrderMenuItem
            label="Grouping"
            hasSubmenu
            onClick={(event) => openSubmenu(event, 'grouping')}
          />
          <FixtureOrderMenuItem
            label="Repeat"
            hasSubmenu
            onClick={(event) => openSubmenu(event, 'repeat')}
          />
          <div role="separator" className="my-1 border-t border-line" />
          <FixtureOrderMenuItem
            label="Change Fixtures…"
            title="Apply the fixtures currently selected in the Preview as this effect's fixtures"
            onClick={() => {
              if (selectedFixtureIds.length) update({ fixtureIds: [...selectedFixtureIds] })
              closeMenu()
            }}
          />
          {order === 'custom-direction' && (
            <div className="mt-1 flex items-center justify-between gap-2 border-t border-line px-2 pt-2 text-xs">
              <NumberField label="Direction (°)" value={effect.customDirectionAngle ?? 0} min={0} max={359} step={1}
                onChange={(customDirectionAngle) => update({ customDirectionAngle })} />
            </div>
          )}
          {order === 'custom' && (
            <div className="mt-1 border-t border-line px-2 pt-2 text-[11px] text-dim">
              Custom Order is set by editing the fixture numbers in the Preview.
            </div>
          )}
        </div>,
        document.body
      )}
      {menuOpen && submenu && createPortal(
        <div
          ref={submenuRef}
          role="menu"
          aria-label={submenu.kind === 'origin' ? 'Origin' : submenu.kind === 'grouping' ? 'Grouping' : 'Repeat'}
          className="fixed z-[101] flex w-44 flex-col rounded-lg border border-line bg-panel2 p-1 text-xs shadow-xl"
          style={{ top: submenu.top, left: submenu.left }}
        >
          {submenu.kind === 'origin' && (
            <>
              <FixtureOrderMenuItem label="Start to End" checked={(effect.fixtureOrderOrigin ?? 'start-end') === 'start-end'} onClick={() => { update({ fixtureOrderOrigin: 'start-end' }); closeMenu() }} />
              <FixtureOrderMenuItem label="From Center" checked={effect.fixtureOrderOrigin === 'from-center'} onClick={() => { update({ fixtureOrderOrigin: 'from-center' }); closeMenu() }} />
              <FixtureOrderMenuItem label="To Center" checked={effect.fixtureOrderOrigin === 'to-center'} onClick={() => { update({ fixtureOrderOrigin: 'to-center' }); closeMenu() }} />
            </>
          )}
          {submenu.kind === 'grouping' && (
            <div className="flex flex-col gap-1 px-2 py-1.5">
              <NumberField label="Group size" value={effect.fixtureGrouping ?? 1} min={1} max={64} step={1}
                onChange={(fixtureGrouping) => update({ fixtureGrouping })} />
              <span className="text-[11px] text-dim">Adjacent pixels act as one.</span>
            </div>
          )}
          {submenu.kind === 'repeat' && (
            <div className="flex flex-col gap-1 px-2 py-1.5">
              <NumberField label="Repeat every" value={effect.fixtureRepeat ?? 0} min={0} max={64} step={1}
                onChange={(fixtureRepeat) => update({ fixtureRepeat })} />
              <span className="text-[11px] text-dim">Repeat after every Nth pixel (0 = off).</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
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
  /** Rendered as a percentage row (label + value in one row with a fill). */
  percent?: boolean
  /** Seconds (Interval, Lifetime) — shown with an "s" suffix. */
  unit?: 's'
  /** Manual-timing only (Guide pp.154-158 labels Phase, Time Offset and
   *  Delay "Manual timing") — hidden under beat-controlled timing.
   *  Jake's Meteor screenshot (9.34.46 pm, beat timing ×4) shows no
   *  Phase row, while the Chase screenshot (9.31.29 pm, fixed duration)
   *  shows it; the stored values are kept either way. */
  manual?: boolean
  /** LightKey shows Speed as a percentage (Fire screenshot, 5.35.53 am:
   *  Speed 50%); the runtime stores a multiplier where 1 = normal
   *  speed, so 50% maps to 1 and the displayed range 0–100% maps to
   *  0–2. Applies to Fire, Jellyfish and Snakes Speed alike. */
  speed?: boolean
}

/** Per-pattern parameters (Guide ch.10, pp.154-160) with LightKey's own
 *  labels from Jake's screenshots ("Steps p. Sample", "Phase",
 *  "Time Offset", …). Percent parameters render as a row whose fill is
 *  proportional to the value (screenshot 9.34.46 pm: Trail 60%).
 *  The sets below are the guide's, cross-checked against the
 *  screenshots: Chase (9.31.29 pm), Scanner (9.34.02 pm), Meteor
 *  (9.34.46 pm) and Fire (5.35.53 am) all match the guide exactly —
 *  no pattern's set needed a screenshot correction. Yo-yo, Fill, Rain,
 *  Sparkle, Jellyfish and Snakes have no LightKey screenshot; their
 *  sets are the guide's alone (see the per-pattern notes in the
 *  report). */
const PATTERN_PARAMS: Record<PatternEffect, PatternParam[]> = {
  chase: [
    { key: 'stepsPerValue', label: 'Steps p. Sample', min: 1, max: 64, step: 1, placeholder: '1' },
    { key: 'phase', label: 'Phase', min: 0, max: 100, step: 1, placeholder: '0', percent: true, manual: true },
    { key: 'timeOffset', label: 'Time Offset', min: 0, max: 100, step: 1, placeholder: '0', percent: true, manual: true },
    { key: 'delay', label: 'Delay', min: 0, max: 100, step: 1, placeholder: '0', percent: true, manual: true },
    { key: 'smoothness', label: 'Smoothness', min: 0, max: 100, step: 1, placeholder: '0', percent: true }
  ],
  scanner: [
    { key: 'length', label: 'Length', min: 1, max: 64, step: 1, placeholder: '1' },
    { key: 'overshoot', label: 'Overshoot', min: 0, max: 64, step: 1, placeholder: '0' },
    { key: 'phase', label: 'Phase', min: 0, max: 100, step: 1, placeholder: '0', percent: true, manual: true },
    { key: 'fringe', label: 'Fringe', min: 0, max: 100, step: 1, placeholder: '0', percent: true },
    { key: 'noise', label: 'Noise', min: 0, max: 100, step: 1, placeholder: '0', percent: true }
  ],
  'yo-yo': [
    { key: 'phase', label: 'Phase', min: 0, max: 100, step: 1, placeholder: '0', percent: true, manual: true },
    { key: 'center', label: 'Center', min: 0, max: 100, step: 1, placeholder: '50', percent: true },
    { key: 'steepness', label: 'Steepness', min: 0, max: 100, step: 1, placeholder: '0', percent: true }
  ],
  fill: [],
  rain: [
    { key: 'length', label: 'Length', min: 1, max: 64, step: 1, placeholder: '1' },
    { key: 'distance', label: 'Distance', min: 1, max: 64, step: 1, placeholder: '2' },
    { key: 'phase', label: 'Phase', min: 0, max: 100, step: 1, placeholder: '0', percent: true, manual: true },
    { key: 'fringe', label: 'Fringe', min: 0, max: 100, step: 1, placeholder: '0', percent: true },
    { key: 'noise', label: 'Noise', min: 0, max: 100, step: 1, placeholder: '0', percent: true }
  ],
  meteor: [
    { key: 'length', label: 'Length', min: 1, max: 64, step: 1, placeholder: '1' },
    { key: 'distance', label: 'Distance', min: 1, max: 64, step: 1, placeholder: '6' },
    { key: 'phase', label: 'Phase', min: 0, max: 100, step: 1, placeholder: '0', percent: true, manual: true },
    { key: 'trail', label: 'Trail', min: 0, max: 100, step: 1, placeholder: '0', percent: true }
  ],
  sparkle: [
    { key: 'interval', label: 'Interval', min: 0.05, max: 10, step: 0.05, placeholder: '0.5', unit: 's' },
    { key: 'lifetime', label: 'Lifetime', min: 0.05, max: 10, step: 0.05, placeholder: '1', unit: 's' },
    { key: 'fringe', label: 'Fringe', min: 0, max: 100, step: 1, placeholder: '0', percent: true },
    { key: 'noise', label: 'Noise', min: 0, max: 100, step: 1, placeholder: '0', percent: true }
  ],
  fire: [
    { key: 'fireSpeed', label: 'Speed', min: 0, max: 100, step: 1, placeholder: '50', percent: true, speed: true },
    { key: 'sparking', label: 'Sparking', min: 0, max: 100, step: 1, placeholder: '50', percent: true },
    { key: 'cooling', label: 'Cooling', min: 0, max: 100, step: 1, placeholder: '50', percent: true }
  ],
  jellyfish: [
    { key: 'jellyfishCount', label: 'Count', min: 1, max: 16, step: 1, placeholder: '1' },
    { key: 'jellyfishSize', label: 'Size', min: 1, max: 100, step: 1, placeholder: '50', percent: true },
    { key: 'jellyfishSpeed', label: 'Speed', min: 0, max: 100, step: 1, placeholder: '50', percent: true, speed: true },
    { key: 'fringe', label: 'Fringe', min: 0, max: 100, step: 1, placeholder: '0', percent: true }
  ],
  snakes: [
    { key: 'snakeSpeed', label: 'Speed', min: 0, max: 100, step: 1, placeholder: '50', percent: true, speed: true },
    { key: 'fringe', label: 'Fringe', min: 0, max: 100, step: 1, placeholder: '0', percent: true },
    { key: 'noise', label: 'Noise', min: 0, max: 100, step: 1, placeholder: '0', percent: true }
  ]
}

/** One parameter row, LightKey style (Jake's screenshots, 9.31.29 /
 *  9.34.46 pm and 11.52.35 pm): a percentage row is a full-width
 *  slider row — label left, the % value and steppers right, its fill
 *  proportional to the value (Fringe 50%). A plain-number row is a
 *  compact boxed field at the right (Length 7, Overshoot 0), the label
 *  sitting outside it on the left. */
function ParamRow({ param, value, onChange }: {
  param: PatternParam
  value: number | undefined
  onChange: (value: number) => void
}) {
  // A Speed row shows LightKey's percentage while the stored value is
  // the runtime's multiplier (50% = 1 = normal speed — see
  // PatternParam.speed). Everything else passes through unchanged.
  const toDisplay = (stored: number | undefined) => param.speed ? (stored ?? 1) * 50 : stored
  const toStored = (display: number) => param.speed ? display / 50 : display
  const displayValue = toDisplay(value)
  const current = displayValue ?? Number(param.placeholder)
  const clamped = Math.max(param.min, Math.min(param.max, Number.isFinite(current) ? current : Number(param.placeholder)))
  const commit = (display: number) => { if (Number.isFinite(display)) onChange(toStored(display)) }
  const input = (
    <input
      type="number"
      aria-label={param.label}
      value={displayValue ?? ''}
      min={param.min}
      max={param.max}
      step={param.step}
      placeholder={param.placeholder}
      onChange={(event) => commit(Number(event.target.value))}
      className="relative w-14 rounded bg-transparent text-right"
    />
  )
  const steppers = (
    <StepperButtons
      upLabel={`Increase ${param.label}`}
      downLabel={`Decrease ${param.label}`}
      onUp={() => commit(Math.min(param.max, clamped + param.step))}
      onDown={() => commit(Math.max(param.min, clamped - param.step))}
    />
  )
  if (!param.percent) {
    return (
      <div className="flex items-center justify-between gap-2 px-1 py-1 text-xs">
        <span className="min-w-0 flex-1 truncate text-dim">{param.label}</span>
        <span className="flex shrink-0 items-center gap-0.5 rounded bg-bg px-1 py-0.5">
          {input}
          {param.unit === 's' && <span className="text-dim">s</span>}
          {steppers}
        </span>
      </div>
    )
  }
  return (
    <div className="relative flex items-center gap-1 overflow-hidden rounded border border-line bg-panel2 px-2 py-1 text-xs">
      <div aria-hidden="true" className="absolute inset-y-0 left-0" style={{ width: `${clamped}%`, backgroundColor: 'rgba(255, 255, 255, 0.14)' }} />
      <span className="relative min-w-0 flex-1 truncate">{param.label}</span>
      {input}
      <span className="relative text-dim">%</span>
      {steppers}
    </div>
  )
}

/** One min/max range parameter (Snakes' Length / Distance, Guide p.160)
 *  as a single row: the label plus two boxed numbers joined by an en
 *  dash. The plain rows' steppers do not fit two values in the 224px
 *  column; the number inputs are still directly editable (and their
 *  native arrow keys step by 1). Labels keep the "Length min" /
 *  "Length max" form, so the param set is unchanged. */
function RangeParamRow({ label, min, max, minValue, maxValue, onMin, onMax }: {
  label: string; min: number; max: number
  minValue: number; maxValue: number
  onMin: (value: number) => void; onMax: (value: number) => void
}) {
  const input = (ariaLabel: string, value: number, onChange: (value: number) => void) => (
    <input
      type="number"
      aria-label={ariaLabel}
      value={value}
      min={min}
      max={max}
      step={1}
      onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next))) }}
      className="relative w-12 rounded bg-transparent text-right"
    />
  )
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate text-dim">{label}</span>
      <span className="flex shrink-0 items-center gap-0.5 rounded bg-bg px-1 py-0.5">
        {input(`${label} min`, minValue, onMin)}
        <span className="text-dim">–</span>
        {input(`${label} max`, maxValue, onMax)}
      </span>
    </div>
  )
}

/** The pattern picker (Jake's screenshots, 9.31.29 / 9.34.02 pm): a
 *  button showing the current pattern, opening a menu of the ten
 *  patterns with their icons. */
function PatternPicker({ pattern, onChange }: { pattern: PatternEffect; onChange: (pattern: PatternEffect) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Pattern"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel2 px-2 py-1.5 text-sm"
      >
        <PatternGlyph pattern={pattern} />
        {PATTERN_LABELS[pattern]}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col rounded border border-line bg-panel2 p-1 text-xs shadow-lg" role="menu" aria-label="Patterns">
          {(Object.keys(PATTERN_LABELS) as PatternEffect[]).map((key) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-panel"
              onClick={() => { onChange(key); setOpen(false) }}
            >
              <PatternGlyph pattern={key} />
              {PATTERN_LABELS[key]}
              {key === pattern && <span className="ml-auto">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The right column of a pattern editor: the pattern picker and the
 *  per-pattern parameters (Guide pp.154-160). */
function PatternParams({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const pattern = effect.pattern ?? 'chase'
  // Manual-timing parameters (Phase, Time Offset, Delay) only show
  // under fixed-duration timing (Guide p.150: fixed duration vs
  // beat-controlled; pp.154-158 label them "Manual timing"). Jake's
  // Meteor screenshot (9.34.46 pm, beat timing ×4) shows no Phase
  // row, while the fixed-duration Chase screenshot (9.31.29 pm) shows
  // it. The stored values are kept when hidden, so switching timing
  // modes never loses them.
  const mode = effect.timingMode ?? (effect.syncToBpm ? 'beat' : 'fixed')
  const params = PATTERN_PARAMS[pattern].filter((param) => !param.manual || mode === 'fixed')
  return (
    <div className="flex flex-col gap-1">
      <PatternPicker pattern={pattern} onChange={(next) => update({ pattern: next })} />
      {params.map((param) => (
        <ParamRow
          key={param.key}
          param={param}
          value={effect[param.key] as number | undefined}
          onChange={(value) => update({ [param.key]: value } as Partial<EffectDef>)}
        />
      ))}
      {/* Snakes' Length and Distance are each ONE guide parameter with
          a min/max range (Guide p.160), so each renders as one row with
          two numbers — four separate rows made the panel scroll (the
          tallest panel must fit without scrolling, Jake 22 Nov 2026).
          The inputs keep the "Length min" / "Length max" labels the
          plain rows used, so the param set is unchanged. */}
      {pattern === 'snakes' && (
        <>
          <RangeParamRow
            label="Length" min={1} max={64}
            minValue={effect.lengthRange?.[0] ?? 1} maxValue={effect.lengthRange?.[1] ?? 4}
            onMin={(value) => update({ lengthRange: [value, effect.lengthRange?.[1] ?? 4] })}
            onMax={(value) => update({ lengthRange: [effect.lengthRange?.[0] ?? 1, value] })}
          />
          <RangeParamRow
            label="Distance" min={1} max={64}
            minValue={effect.distanceRange?.[0] ?? 1} maxValue={effect.distanceRange?.[1] ?? 4}
            onMin={(value) => update({ distanceRange: [value, effect.distanceRange?.[1] ?? 4] })}
            onMax={(value) => update({ distanceRange: [effect.distanceRange?.[0] ?? 1, value] })}
          />
        </>
      )}
      {(pattern === 'meteor' || pattern === 'sparkle' || pattern === 'jellyfish') && (
        <label className="flex items-center gap-2 rounded border border-line bg-panel2 px-2 py-1 text-xs">
          <input
            type="checkbox"
            checked={effect.usePalette ?? false}
            onChange={(event) => update({ usePalette: event.target.checked })}
          />
          Use samples as palette
        </label>
      )}
    </div>
  )
}

function PatternEditor({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  const isColor = isColorAttribute(effect.attribute)
  // Legacy single-channel patterns stored colour samples; show (and save
  // back) the levels of that channel, not a colour picker — a red chase
  // must not offer a colour that would light the whole fixture white.
  const samples = normalizedPatternSamples(effect)
  const [selectedSample, setSelectedSample] = useState(0)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // The sample being edited in the transient popover (click a swatch to
  // edit it — Guide p.153), and the right-click menu's position.
  const [editingSample, setEditingSample] = useState<number | null>(null)
  const [sampleMenu, setSampleMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selectedIndex = Math.min(selectedSample, samples.length - 1)
  const selected = samples[selectedIndex]

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

  const duplicateSample = (index: number) => {
    const next = [...samples]
    next.splice(index + 1, 0, { ...samples[index], id: `sample-${Date.now()}` })
    setSamples(next)
    setSelectedSample(index + 1)
  }

  const deleteSample = (index: number) => {
    if (samples.length <= 1) return
    setSamples(samples.filter((_, i) => i !== index))
    setSelectedSample(Math.max(0, index - 1))
  }

  // The popover and the right-click menu close on a click outside them
  // or on Escape (the ViewSwitch menu pattern).
  useEffect(() => {
    if (editingSample === null && !sampleMenu) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (editorRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setEditingSample(null)
      setSampleMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setEditingSample(null); setSampleMenu(null) }
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [editingSample, sampleMenu])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Sample strip (Guide p.153; Jake's screenshots, 9.31.29 /
          9.34.46 pm and 11.47.29 pm): large rounded squares with no
          labels — LightKey has no "BG" swatch or Background selector;
          the first colour simply IS the background by position. Drag
          to reorder; click a swatch to edit it; the + tile adds one.
          The strip stretches to fill the panel height, as in LightKey. */}
      <div className="relative flex flex-1 flex-wrap content-start items-start gap-2 rounded-lg border border-line bg-panel2 p-2" role="listbox" aria-label="Pattern samples">
        {samples.map((sample, index) => {
          const isSelected = index === selectedIndex
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
              onClick={() => { setSelectedSample(index); setEditingSample(index) }}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setSelectedSample(index)
                setSampleMenu({ x: event.clientX, y: event.clientY, index })
              }}
              title="Sample — drag to reorder"
              className={`flex h-16 w-16 items-center justify-center rounded-lg border text-xs ${isSelected ? 'border-[#0A84FF]' : 'border-line'}`}
              style={{ backgroundColor: swatch, color: isColor ? '#fff' : '#000' }}
            />
          )
        })}
        <button
          type="button"
          className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-line text-lg text-dim"
          title="Add sample"
          aria-label="Add sample"
          onClick={() => {
            const next = [...samples, { id: `sample-${Date.now()}`, ...(isColor ? { color: '#ffffff' } : { value: 100 }) }]
            setSamples(next)
            setSelectedSample(next.length - 1)
            setEditingSample(next.length - 1)
          }}
        >
          +
        </button>
        {/* Transient sample editor (Guide p.153: click a sample to edit
            it): the colour picker / dimmer slider and Duplicate /
            Delete for the selected sample. It floats over the empty
            space below the swatches and closes on Escape or a click
            outside it — it never takes layout height, so the strip
            keeps its full height. */}
        {editingSample !== null && selected && (
          <div ref={editorRef} role="dialog" aria-label="Edit sample" className="absolute left-2 top-20 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel2 p-2 text-xs shadow-lg">
            {isColor ? (
              <label className="flex items-center gap-1">
                <input
                  type="color"
                  aria-label="Sample color"
                  value={selected.color ?? '#000000'}
                  onChange={(event) => updateSample(selectedIndex, { color: event.target.value })}
                  className="h-6 w-8 cursor-pointer rounded bg-bg"
                />
                <span className="font-mono">{selected.color ?? '#000000'}</span>
              </label>
            ) : (
              <>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  aria-label="Sample value"
                  value={selected.value ?? 0}
                  onChange={(event) => updateSample(selectedIndex, { value: Number(event.target.value) })}
                  className="w-28"
                />
                <NumberField label="Value (%)" value={selected.value ?? 0} min={0} max={100} step={1}
                  onChange={(value) => updateSample(selectedIndex, { value })} />
              </>
            )}
            <button type="button" className="text-xs text-dim" onClick={() => duplicateSample(selectedIndex)}>
              Duplicate
            </button>
            <button
              type="button"
              className="text-xs text-dim disabled:opacity-40"
              disabled={samples.length <= 1}
              onClick={() => { deleteSample(selectedIndex); setEditingSample(null) }}
            >
              Delete
            </button>
            <button type="button" className="text-xs text-dim" aria-label="Close sample editor" onClick={() => setEditingSample(null)}>✕</button>
          </div>
        )}
      </div>
      {/* Right-click a sample (Guide p.153: Control-click → shortcut
          menu): Duplicate / Delete. */}
      {sampleMenu && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Sample actions"
          className="fixed z-[100] flex w-40 flex-col rounded-lg border border-line bg-panel2 p-1 text-xs shadow-xl"
          style={{ left: Math.max(8, Math.min(sampleMenu.x, window.innerWidth - 168)), top: Math.max(8, Math.min(sampleMenu.y, window.innerHeight - 96)) }}
        >
          <button
            type="button"
            role="menuitem"
            className="rounded px-2 py-1.5 text-left hover:bg-panel"
            onClick={() => { duplicateSample(sampleMenu.index); setSampleMenu(null) }}
          >
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={samples.length <= 1}
            className="rounded px-2 py-1.5 text-left hover:bg-panel disabled:opacity-40"
            onClick={() => { deleteSample(sampleMenu.index); setSampleMenu(null) }}
          >
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Curve editor (Guide ch.10, pp.161-164)                          */
/* ------------------------------------------------------------------ */

/* The curve viewBox is wide (640×200, ~3.2:1) to match the panel the
 * canvas fills: the SVG stretches to its container with
 * preserveAspectRatio="none", and a wide viewBox keeps the axis
 * labels from stretching sideways (Jake, 22 Nov 2026: the curve
 * editor must fit on one page without scrolling). The stored points
 * are normalised 0–1, so the viewBox size is render-only. */
const CURVE_WIDTH = 640
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
  // The horizontal axis shows percent or exact times (Guide p.163) —
  // click the labels to toggle.
  const [axisMode, setAxisMode] = useState<'percent' | 'time'>('percent')

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
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}`}
        preserveAspectRatio="none"
        className="min-h-0 w-full flex-1 touch-none select-none rounded border border-line bg-bg"
        role="img"
        aria-label={`Curve for ${component.component}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragId(null)}
        onDoubleClick={onDoubleClick}
      >
        {/* Axis: percent and time subdivisions (Guide p.163) — click the
            horizontal labels to switch between percent and exact times. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const x = CURVE_PAD + f * (CURVE_WIDTH - CURVE_PAD * 2)
          const y = CURVE_HEIGHT - CURVE_PAD - f * (CURVE_HEIGHT - CURVE_PAD * 2)
          return (
            <g key={f}>
              <line x1={x} y1={CURVE_PAD} x2={x} y2={CURVE_HEIGHT - CURVE_PAD} stroke="var(--line, #333)" strokeWidth="0.5" />
              <line x1={CURVE_PAD} y1={y} x2={CURVE_WIDTH - CURVE_PAD} y2={y} stroke="var(--line, #333)" strokeWidth="0.5" />
              <text
                x={x}
                y={CURVE_HEIGHT - 2}
                fontSize="8"
                fill="var(--dim, #888)"
                textAnchor="middle"
                style={{ cursor: 'pointer' }}
                onClick={() => setAxisMode((mode) => (mode === 'percent' ? 'time' : 'percent'))}
              >
                <title>Click to switch between percent and time</title>
                {axisMode === 'percent' ? `${Math.round(f * 100)}%` : `${(f * (durationMs / 1000)).toFixed(1)}s`}
              </text>
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

/** The vertical gradient bar beside the curve (Jake's screenshot,
 *  9.35.05 pm): the value range the curve moves through — the hue
 *  spectrum for a hue curve, black-to-white for anything else. */
function curveGradientBar(component: string): string {
  if (component === 'hue') {
    return 'linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
  }
  return 'linear-gradient(to bottom, #ffffff, #000000)'
}

/** The right column of a curve editor: "Select Template…" and the Time
 *  Offset (Guide p.163: Time Offset sits to the right of the curve). */
function CurveParams({ effect, update, activeComponent }: {
  effect: EffectDef
  update: (patch: Partial<EffectDef>) => void
  activeComponent: string
}) {
  const components = effect.curveComponents ?? []
  const active = components.find((c) => c.component === activeComponent) ?? components[0]

  const applyTemplate = (waveform: EffectWaveform | 'flat') => {
    if (!active) return
    const points = waveform === 'flat' ? defaultCurvePoints() : waveformPoints(waveform)
    const curvedSegments = Array.from({ length: Math.max(0, points.length - 1) }, () => waveform !== 'flat')
    update({
      curveComponents: components.map((c) =>
        c.component === active.component ? { ...active, points, curvedSegments } : c
      )
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-dim">Template</span>
        <select
          aria-label="Curve template"
          value=""
          onChange={(event) => {
            if (event.target.value) applyTemplate(event.target.value as EffectWaveform | 'flat')
            event.target.value = ''
          }}
          className="rounded border border-line bg-panel2 px-2 py-1.5 text-xs"
        >
          <option value="">Select Template…</option>
          {(Object.keys(WAVEFORM_LABELS) as EffectWaveform[]).map((w) => (
            <option key={w} value={w}>{WAVEFORM_LABELS[w]}</option>
          ))}
          <option value="flat">Flat</option>
        </select>
      </label>
      <ParamRow
        param={{ key: 'timeOffset', label: 'Time Offset', min: 0, max: 100, step: 1, placeholder: '0', percent: true }}
        value={effect.timeOffset ?? 0}
        onChange={(timeOffset) => update({ timeOffset })}
      />
    </div>
  )
}

function CurveEditor({ effect, update, activeComponent, onActiveComponent }: {
  effect: EffectDef
  update: (patch: Partial<EffectDef>) => void
  activeComponent: string
  onActiveComponent: (component: string) => void
}) {
  const components = effect.curveComponents ?? []
  const selectedFixtures = useShowStore((s) => {
    const fixtures = s.show?.fixtures ?? []
    return fixtures.filter((f) => s.selectedFixtureIds.includes(f.id))
  })
  const model = effect.colorModel ?? 'hsb'
  const isColor = effect.attribute === 'color'
  const isPosition = effect.attribute === 'position'
  const active = components.find((c) => c.component === activeComponent) ?? components[0]

  const updateComponent = (component: string, next: CurveComponent) => {
    update({ curveComponents: components.map((c) => (c.component === component ? next : c)) })
  }

  const setColorModel = (nextModel: 'hsb' | 'rgb' | 'cmy') => {
    const extras = components.filter((c) => !colorModelComponents('hsb').includes(c.component) && !colorModelComponents('rgb').includes(c.component) && !colorModelComponents('cmy').includes(c.component))
    const fresh = colorModelComponents(nextModel).map((component) => ({
      component,
      points: waveformPoints('sine'),
      curvedSegments: Array.from({ length: 8 }, () => true)
    }))
    update({ colorModel: nextModel, curveComponents: [...fresh, ...extras] })
    onActiveComponent(fresh[0]?.component ?? '')
  }

  const componentNames = useMemo(() => {
    if (isColor) {
      const extras = selectedFixtures.flatMap((f) => extraColorComponents(f))
      return [...colorModelComponents(model), ...Array.from(new Set(extras))]
    }
    if (isPosition) return ['pan', 'tilt']
    return [effect.attribute]
  }, [isColor, isPosition, model, selectedFixtures, effect.attribute])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {isColor && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
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
        </div>
      )}
      {/* One component is not a tab row — a Dimmer curve has only
          Intensity, and LightKey's curve screen (9.35.05 pm) shows no
          tabs for it. The row appears only when there is something to
          switch between. */}
      {componentNames.length > 1 && (
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
                onActiveComponent(name)
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
      )}
      {active && (
        <div className="flex min-h-0 flex-1 items-stretch gap-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <CurveCanvas
              component={active}
              durationMs={effect.durationMs ?? 2000}
              onChange={(next) => updateComponent(active.component, next)}
            />
          </div>
          <div
            aria-hidden="true"
            title="Value range"
            className="w-4 shrink-0 rounded"
            style={{ background: curveGradientBar(active.component) }}
          />
        </div>
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

/* LightKey's Position HUD (Guide ch.10, pp.167-169; Jake's "Effects
 * Showcase" screenshots, 26 Nov 2026): a circular pan/tilt chart that
 * floats over the Preview while a movement effect is being edited. The
 * mapping is the Rotation dial's (see lib/movementChart.ts): pan angle
 * around the circle (0° at the bottom, +90° at the right, ±180° at the
 * top), radius from the centre is |tilt|. The path is drawn with the
 * runtime's own interpolation, so the live dot sits on the drawn curve.
 * The hint is LightKey's exact wording, dismissible for the session. */
const HUD_SIZE = 280
const HUD_C = HUD_SIZE / 2
const HUD_R = 118
const HUD_HINT =
  'Click in the center of a connection line to add a control point. Hold down Command and drag a point beyond the center to move it to a negative tilt angle.'

export function PositionHud({ path, onChange, durationMs, range }: {
  path: MovementPathDef
  onChange: (next: MovementPathDef) => void
  durationMs: number
  range: { pan: number; tilt: number }
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dot, setDot] = useState<{ pan: number; tilt: number } | null>(null)
  const [showHint, setShowHint] = useState(true)
  // Tilt-sign state for the current drag (lib/movementChart.ts): the
  // screen position cannot encode the sign, so it is sticky per drag —
  // without Command it stays the point's sign; with Command held it
  // flips when the pointer crosses the centre.
  const dragSignRef = useRef<{ sign: number; armed: boolean }>({ sign: 1, armed: false })

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

  const points = path.points

  /** Chart coordinates for a normalized point, clamped to the rim. */
  const toSvg = (pan: number, tilt: number) => {
    const at = normalizedToChartOffset(pan, tilt, HUD_R)
    const length = Math.hypot(at.x, at.y)
    const scale = length > HUD_R ? HUD_R / length : 1
    return { x: HUD_C + at.x * scale, y: HUD_C + at.y * scale }
  }
  /** Pointer offset from the chart centre, in chart units. */
  const pointerOffset = (clientX: number, clientY: number): { dx: number; dy: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = ((clientX - rect.left) / rect.width) * HUD_SIZE
    const y = ((clientY - rect.top) / rect.height) * HUD_SIZE
    return { dx: x - HUD_C, dy: y - HUD_C }
  }

  const onPointerDown = (event: React.PointerEvent) => {
    const at = pointerOffset(event.clientX, event.clientY)
    if (!at) return
    const px = HUD_C + at.dx
    const py = HUD_C + at.dy
    const hit = points.findIndex((p) => {
      const s = toSvg(p.pan, p.tilt)
      return Math.hypot(s.x - px, s.y - py) < 12
    })
    if (hit >= 0) {
      setSelectedIndex(hit)
      setDragIndex(hit)
      dragSignRef.current = { sign: points[hit].tilt < 0 ? -1 : 1, armed: false }
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
      return
    }
    // Click near the middle of a connection line inserts a point there
    // (smooth/line types, Guide p.169); a 'points' path has no lines.
    if (path.type !== 'points') {
      const mid = nearestSegmentMidpoint(points, path.type, at.dx, at.dy, HUD_R, 12)
      if (mid) {
        const next = [...points.slice(0, mid.index + 1), mid.point, ...points.slice(mid.index + 1)]
        onChange({ ...path, points: next })
        setSelectedIndex(mid.index + 1)
        setDragIndex(mid.index + 1)
        dragSignRef.current = { sign: mid.point.tilt < 0 ? -1 : 1, armed: false }
        ;(event.target as Element).setPointerCapture?.(event.pointerId)
        return
      }
    }
    // Clicking empty space clears the selection (Guide p.168).
    setSelectedIndex(null)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (dragIndex === null) return
    const at = pointerOffset(event.clientX, event.clientY)
    if (!at) return
    const radiusFraction = Math.hypot(at.dx, at.dy) / HUD_R
    if (event.metaKey || event.ctrlKey) {
      dragSignRef.current = cmdDragTiltSign(dragSignRef.current, radiusFraction)
    }
    const sign = dragSignRef.current.sign
    const next = chartOffsetToNormalized(at.dx, at.dy, HUD_R, sign)
    // At the centre the pan angle is undefined — keep the point's pan
    // until the pointer comes out the other side.
    const pan = radiusFraction < 0.03 ? points[dragIndex].pan : next.pan
    onChange({ ...path, points: points.map((p, i) => (i === dragIndex ? { pan, tilt: next.tilt } : p)) })
  }

  const onDoubleClick = (event: React.MouseEvent) => {
    // A 'points' path has no connection lines: double-click anywhere
    // adds a point (Guide p.169).
    if (path.type !== 'points') return
    const at = pointerOffset(event.clientX, event.clientY)
    if (!at) return
    const next = chartOffsetToNormalized(at.dx, at.dy, HUD_R, 1)
    onChange({ ...path, points: [...points, next] })
    setSelectedIndex(points.length)
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
    ? { pan: formatPanTiltDegrees(dot.pan * (range.pan / 2)), tilt: formatPanTiltDegrees(dot.tilt * (range.tilt / 2)) }
    : null
  const drawn = samplePathPoints(points, path.type)
  const drawnLine = drawn.length > 1
    ? [...drawn, drawn[0]].map((p) => { const s = toSvg(p.pan, p.tilt); return `${s.x},${s.y}` }).join(' ')
    : ''
  const degreeLabels = [0, 30, 60, 90, 120, 150, 180, -150, -120, -90, -60, -30]

  return (
    <div
      className="pointer-events-auto flex w-[300px] flex-col gap-1 rounded border border-line bg-panel p-2 shadow-lg"
      data-testid="movement-chart"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${HUD_SIZE} ${HUD_SIZE}`}
        className="w-full touch-none select-none rounded bg-bg"
        role="img"
        aria-label={`Movement path ${path.name}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragIndex(null)}
        onDoubleClick={onDoubleClick}
      >
        {/* Concentric tilt rings (0.25 / 0.5 / 0.75 / full tilt). */}
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <circle key={fraction} cx={HUD_C} cy={HUD_C} r={HUD_R * fraction} fill="none" stroke="var(--line, #333)" strokeWidth={fraction === 1 ? 1 : 0.5} opacity={fraction === 1 ? 1 : 0.6} />
        ))}
        {/* Radial spokes every 30° of pan. */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = i * 30
          const at = normalizedToChartOffset(angle / 180, 1, HUD_R)
          return <line key={angle} x1={HUD_C} y1={HUD_C} x2={HUD_C + at.x} y2={HUD_C + at.y} stroke="var(--line, #333)" strokeWidth="0.5" opacity="0.35" />
        })}
        {/* Rim ticks every 5°, longer every 30°. */}
        {Array.from({ length: 72 }, (_, i) => {
          const angle = i * 5
          const outer = normalizedToChartOffset(angle / 180, 1, HUD_R)
          const inner = normalizedToChartOffset(angle / 180, 1, HUD_R - (angle % 30 === 0 ? 8 : 4))
          return <line key={angle} x1={HUD_C + inner.x} y1={HUD_C + inner.y} x2={HUD_C + outer.x} y2={HUD_C + outer.y} stroke="var(--dim, #888)" strokeWidth={angle % 30 === 0 ? 1.5 : 0.75} />
        })}
        {/* Degree labels around the rim: 0° at the bottom, ±180° at the top. */}
        {degreeLabels.map((angle) => {
          const at = normalizedToChartOffset(angle / 180, 1, HUD_R + 13)
          const label = angle === 180 ? '±180°' : angle === 0 ? '0°' : `${angle > 0 ? '+' : ''}${angle}°`
          return <text key={angle} x={HUD_C + at.x} y={HUD_C + at.y} textAnchor="middle" dominantBaseline="middle" fill="var(--dim, #888)" fontSize="9">{label}</text>
        })}
        <circle cx={HUD_C} cy={HUD_C} r="2" fill="var(--dim, #888)" />
        {path.type !== 'points' && drawnLine && <polyline points={drawnLine} fill="none" stroke="#22d3ee" strokeWidth="1.5" />}
        {path.type === 'points' && points.map((p, i) => {
          const s = toSvg(p.pan, p.tilt)
          return <circle key={`dot-${i}`} cx={s.x} cy={s.y} r="2" fill="#22d3ee" />
        })}
        {points.map((p, i) => {
          const s = toSvg(p.pan, p.tilt)
          const selected = i === selectedIndex
          return (
            <g key={i}>
              <circle cx={s.x} cy={s.y} r={selected ? 6.5 : 5} fill={i === 0 ? '#22c55e' : selected ? '#0A84FF' : '#fff'} stroke="#0A84FF" strokeWidth="1.5" />
              {i === 0 && <text x={s.x + 9} y={s.y - 7} fontSize="9" fill="var(--dim, #888)">start</text>}
            </g>
          )
        })}
        {dot && (
          <circle cx={toSvg(dot.pan, dot.tilt).x} cy={toSvg(dot.pan, dot.tilt).y} r="4" fill="#22c55e" />
        )}
      </svg>
      <div className="flex items-center justify-between px-1 text-[11px] text-dim">
        <span>PAN</span>
        <span className="font-mono text-sm text-[var(--text)]">{dotDegrees ? dotDegrees.pan : '—'}</span>
        <span>TILT</span>
        <span className="font-mono text-sm text-[var(--text)]">{dotDegrees ? dotDegrees.tilt : '—'}</span>
      </div>
      {showHint && (
        <div className="flex items-start gap-1.5 rounded border border-line bg-panel2 px-2 py-1.5 text-[11px] text-dim" data-testid="movement-chart-hint">
          <span className="flex-1">{HUD_HINT}</span>
          <button type="button" aria-label="Dismiss hint" className="shrink-0 leading-none" onClick={() => setShowHint(false)}>×</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
        <button type="button" className="text-xs text-dim" disabled={selectedIndex === null || points.length <= 2} onClick={deleteSelected}>Delete point</button>
        <button type="button" className="text-xs text-dim" onClick={() => flip('pan')}>Flip horizontal</button>
        <button type="button" className="text-xs text-dim" onClick={() => flip('tilt')}>Flip vertical</button>
        <button type="button" className="text-xs text-dim" onClick={reverse}>Reverse</button>
        <button type="button" className="text-xs text-dim" disabled={selectedIndex === null || selectedIndex === 0} onClick={setAsStart}>Set as Start</button>
      </div>
    </div>
  )
}

/** A miniature of a movement path for the gallery (Guide p.165: the
 *  path gallery — click a path to use it). LightKey's tiles are all the
 *  same size and each is a small preview of the circular movement chart
 *  (Jake's "Effects Showcase" screenshots, 26 Nov 2026), so every tile
 *  renders this same 56×56 polar chart — built-in, user or copy. */
const TILE_CHART_SIZE = 56
const TILE_CHART_C = TILE_CHART_SIZE / 2
const TILE_CHART_R = 24

function PathPreview({ pathId, userPaths }: { pathId: string; userPaths: MovementPathDef[] }) {
  const resolved = resolveMovementPath(pathId, userPaths)
  if (!resolved) return <span className="block h-14 w-14" aria-hidden="true" />
  const parametric = Array.isArray(resolved.path)
    ? null
    : Array.from({ length: 16 }, (_, i) => movementPoint(resolved.path, i / 16))
  const rawPoints = Array.isArray(resolved.path) ? resolved.path : parametric!
  // The drawn curve uses the runtime's interpolation (samplePathPoints),
  // so the tile matches the Position HUD; a 'points' path shows its
  // control points as dots only, with no connection lines.
  const drawPoints = resolved.type === 'points' ? rawPoints : samplePathPoints(rawPoints, resolved.type, 32)
  if (drawPoints.length === 0) return <span className="block h-14 w-14" aria-hidden="true" />
  const toXY = (p: { pan: number; tilt: number }) => {
    const at = normalizedToChartOffset(p.pan, p.tilt, TILE_CHART_R)
    return `${TILE_CHART_C + at.x},${TILE_CHART_C + at.y}`
  }
  return (
    <svg viewBox={`0 0 ${TILE_CHART_SIZE} ${TILE_CHART_SIZE}`} width={TILE_CHART_SIZE} height={TILE_CHART_SIZE} aria-hidden="true" className="shrink-0">
      <circle cx={TILE_CHART_C} cy={TILE_CHART_C} r={TILE_CHART_R} fill="none" stroke="var(--line, #333)" strokeWidth="0.75" />
      <circle cx={TILE_CHART_C} cy={TILE_CHART_C} r={TILE_CHART_R / 2} fill="none" stroke="var(--line, #333)" strokeWidth="0.5" opacity="0.6" />
      {resolved.type === 'points'
        ? drawPoints.map((p, i) => {
          const [cx, cy] = toXY(p).split(',').map(Number)
          return <circle key={i} cx={cx} cy={cy} r="1.8" fill="#22d3ee" />
        })
        : <polyline points={[...drawPoints, drawPoints[0]].map(toXY).join(' ')} fill="none" stroke="#22d3ee" strokeWidth="1.5" />}
    </svg>
  )
}

/** The right column of a movement editor: Time Offset, Pan/Tilt Offset
 *  and the Options (Guide pp.166-167). */
function MovementParams({ effect, update }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ParamRow
        param={{ key: 'timeOffset', label: 'Time Offset', min: 0, max: 100, step: 1, placeholder: '0', percent: true }}
        value={effect.timeOffset ?? 0}
        onChange={(timeOffset) => update({ timeOffset })}
      />
      <ParamRow
        param={{ key: 'panOffset', label: 'Pan Offset (°)', min: -180, max: 180, step: 1, placeholder: '0' }}
        value={effect.panOffset ?? 0}
        onChange={(panOffset) => update({ panOffset })}
      />
      <ParamRow
        param={{ key: 'tiltOffset', label: 'Tilt Offset (°)', min: -180, max: 180, step: 1, placeholder: '0' }}
        value={effect.tiltOffset ?? 0}
        onChange={(tiltOffset) => update({ tiltOffset })}
      />
      <label className="flex items-center gap-2 rounded border border-line bg-panel2 px-2 py-1.5 text-xs">
        <input type="checkbox" checked={effect.mirrorPan ?? false} onChange={(event) => update({ mirrorPan: event.target.checked })} />
        Mirror Pan
      </label>
      <label className="flex items-center gap-2 rounded border border-line bg-panel2 px-2 py-1.5 text-xs">
        <input type="checkbox" checked={effect.mirrorTilt ?? false} onChange={(event) => update({ mirrorTilt: event.target.checked })} />
        Mirror Tilt
      </label>
      <label className="flex items-center gap-2 rounded border border-line bg-panel2 px-2 py-1.5 text-xs">
        <input type="checkbox" checked={effect.relative ?? false} onChange={(event) => update({ relative: event.target.checked })} />
        Relative
      </label>
    </div>
  )
}

/** One movement-path tile (LightKey's gallery, Jake's "Effects Showcase"
 *  screenshots, 26 Nov 2026): every tile — built-in, user path or copy —
 *  has identical dimensions, a 56×56 polar chart preview and a one-line
 *  name label. Selection, and the user tiles' rename/delete affordances
 *  (small overlay buttons that never change the tile's size), never
 *  change a tile's size. */
const MOVEMENT_TILE_CLASS = 'flex w-[76px] shrink-0 flex-col items-center gap-0.5 rounded border px-1 py-1 text-[11px]'

function MovementEditor({ effect, update, movementChartHost }: { effect: EffectDef; update: (patch: Partial<EffectDef>) => void; movementChartHost?: HTMLElement | null }) {
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
    const named = builtinMovementPathPoints(id)
    if (named) {
      const def = BUILTIN_MOVEMENT_PATHS.find((p) => p.id === id)
      if (!def) return null
      return { id, name: def.name, builtIn: true, type: named.type, points: [...named.points] }
    }
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
      {/* The Position HUD lives over the Preview (portalled into the
          preview-stack host App provides); without a host — standalone
          tests — it renders inline here instead. It appears whenever
          this editor is open and leaves with it. */}
      {editablePath && (movementChartHost
        ? createPortal(
          <PositionHud path={editablePath} onChange={onPathChange} durationMs={effect.durationMs ?? 2000} range={range} />,
          movementChartHost
        )
        : (
          <PositionHud path={editablePath} onChange={onPathChange} durationMs={effect.durationMs ?? 2000} range={range} />
        ))}
      <div className="flex flex-wrap items-center gap-1" role="listbox" aria-label="Movement paths">
        {BUILTIN_MOVEMENT_PATHS.map((path) => (
          <button
            key={path.id}
            type="button"
            role="option"
            aria-selected={selectedPathId === path.id}
            data-testid="movement-path-tile"
            className={`${MOVEMENT_TILE_CLASS} ${selectedPathId === path.id ? 'border-[#0A84FF] bg-panel2' : 'border-line'}`}
            onClick={() => update({ movementPathId: path.id })}
          >
            <PathPreview pathId={path.id} userPaths={userPaths} />
            <span className="h-4 max-w-full truncate leading-4">{path.name}</span>
          </button>
        ))}
        {userPaths.map((path) => (
          <div
            key={path.id}
            data-testid="movement-path-tile"
            className={`${MOVEMENT_TILE_CLASS} relative ${selectedPathId === path.id ? 'border-[#0A84FF] bg-panel2' : 'border-line'}`}
          >
            {renameId === path.id ? (
              <>
                <PathPreview pathId={path.id} userPaths={userPaths} />
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
                  className="h-4 w-full rounded bg-bg px-1 text-[11px] leading-4"
                />
              </>
            ) : (
              <button
                type="button"
                role="option"
                aria-selected={selectedPathId === path.id}
                aria-label={`Use path ${path.name}`}
                onClick={() => update({ movementPathId: path.id })}
                className="flex flex-col items-center gap-0.5"
              >
                <PathPreview pathId={path.id} userPaths={userPaths} />
                <span className="h-4 max-w-full truncate leading-4">{path.name}</span>
              </button>
            )}
            <span className="absolute right-0.5 top-0.5 flex gap-0.5">
              <button type="button" className="px-0.5 text-[10px] leading-none text-dim hover:text-[var(--text)]" title="Rename path" aria-label="Rename path" onClick={() => { setRenameId(path.id); setRenameName(path.name) }}>✎</button>
              <button
                type="button"
                className="px-0.5 text-[10px] leading-none text-dim hover:text-[var(--text)]"
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
          </div>
        ))}
        <button
          type="button"
          data-testid="movement-path-tile"
          className={`${MOVEMENT_TILE_CLASS} border-dashed text-dim`}
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
          <span className="flex h-14 w-14 items-center justify-center text-xl leading-none" aria-hidden="true">+</span>
          <span className="h-4 leading-4">New Path</span>
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

export function EffectEditor({ effectTabHost, effectToolsHost, movementChartHost }: { effectTabHost?: HTMLElement | null; effectToolsHost?: HTMLElement | null; movementChartHost?: HTMLElement | null } = {}) {
  const editingEffectId = useShowStore((s) => s.editingEffectId)
  const setEditingEffectId = useShowStore((s) => s.setEditingEffectId)
  const effect = useShowStore((s) => s.effects.find((e) => e.id === s.editingEffectId))
  const setEffectChooserAttribute = useShowStore((s) => s.setEffectChooserAttribute)
  const updateEffect = useShowStore((s) => s.updateEffect)
  const removeEffect = useShowStore((s) => s.removeEffect)
  const duplicateEffect = useShowStore((s) => s.duplicateEffect)
  const deleteEffectAndKeepValues = useShowStore((s) => s.deleteEffectAndKeepValues)
  const saveEffectTemplate = useShowStore((s) => s.saveEffectTemplate)
  const editingEffectTemplateId = useShowStore((s) => s.editingEffectTemplateId)
  const cancelEditingEffectTemplate = useShowStore((s) => s.cancelEditingEffectTemplate)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [includeFixtureOrder, setIncludeFixtureOrder] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeCurveComponent, setActiveCurveComponent] = useState('')

  useEffect(() => {
    setActiveCurveComponent(effect?.curveComponents?.[0]?.component ?? '')
    setMenuOpen(false)
  }, [effect?.id])

  if (!editingEffectId || !effect) return null
  const update = (patch: Partial<EffectDef>) => updateEffect(effect.id, patch)
  const kind = effect.kind ?? 'curve'
  const label = attributeLabel(effect.attribute)

  // Closing the editor ends a template-edit session: the working copy
  // Edit created is discarded (the saved template is untouched). An
  // ordinary effect just closes and stays.
  const close = () => {
    if (editingEffectTemplateId) cancelEditingEffectTemplate()
    else setEditingEffectId(null)
  }

  // The editor's header lives in the Design/Live pill bar (Jake,
  // 21 Nov 2026; LightKey screenshots 11.47.29 pm / 9.35.05 pm): the
  // effect-type tab joins the pill selector on the left (the light
  // pill — it is the active tab while editing), Fixture Order sits
  // at the right. Portalled there when the hosts exist; inline at
  // the top of the editor when they don't (standalone tests). There
  // is no On toggle and no × here (Jake, 22 Nov 2026): effects are
  // built into cues and triggered when desired, there is no on/off
  // switch — and exiting is via Design/Live or Esc, as LightKey does
  // ("esc End editing"). The dropdown's menu is LightKey's, per Jake's
  // 25 Nov 2026 "Effects Showcase" screenshot: only the effect being
  // edited, checked, then Add Effect…, Save as Template…, Duplicate,
  // Delete, Delete and Keep Values — in that order. It is NOT an
  // effect switcher: no other effects are listed, neither from the
  // project nor from the fixture. Rename is not in the menu: it lives
  // in the preset browser's right-click menu (Guide p.174).
  const effectTypeTab = (
    <div className="relative">
      <button
        type="button"
        aria-label="Effect menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
        className="view-switch-segment on"
      >
        {attributeLabel(effect.attribute)} Effect <span className="view-switch-caret" aria-hidden="true">⌄</span>
      </button>
      {menuOpen && (
        <div className="absolute left-0 z-10 mt-1 flex max-h-60 min-w-52 flex-col overflow-y-auto rounded border border-line bg-panel2 p-1 text-xs shadow-lg" role="menu">
          <button
            type="button"
            role="menuitem"
            className="rounded px-2 py-1 text-left hover:bg-panel"
            onClick={() => setMenuOpen(false)}
          >
            {label} Effect ✓
          </button>
          <button
            type="button"
            role="menuitem"
            className="rounded px-2 py-1 text-left hover:bg-panel"
            onClick={() => {
              // Opening the chooser exits the editor (store action);
              // after adding, the new effect's editor opens as usual.
              setMenuOpen(false)
              setEffectChooserAttribute(effect.attribute)
            }}
          >
            Add Effect…
          </button>
          <hr className="my-1 border-line" />
          <button
            type="button"
            className="rounded px-2 py-1 text-left hover:bg-panel"
            onClick={() => {
              setTemplateName(effect.name)
              setIncludeFixtureOrder(true)
              setSavingTemplate(true)
              setMenuOpen(false)
            }}
          >
            Save as Template…
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-left hover:bg-panel"
            onClick={() => {
              const id = duplicateEffect(effect.id)
              setMenuOpen(false)
              if (id) setEditingEffectId(id)
            }}
          >
            Duplicate {label} Effect
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-left text-red-400 hover:bg-panel"
            onClick={() => { removeEffect(effect.id); close() }}
          >
            Delete {label} Effect
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-left hover:bg-panel"
            onClick={() => { deleteEffectAndKeepValues(effect.id); close() }}
          >
            Delete {label} Effect and Keep Values
          </button>
        </div>
      )}
    </div>
  )
  // Fixture Order is the only tool left in the pill-bar's right-hand
  // host (no On toggle, no × — see above).
  const effectTools = <FixtureOrderControls effect={effect} update={update} />
  const tabNode = effectTabHost ? createPortal(effectTypeTab, effectTabHost) : effectTypeTab
  const toolsNode = effectToolsHost ? createPortal(effectTools, effectToolsHost) : effectTools
  const hasHosts = Boolean(effectTabHost && effectToolsHost)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2" data-testid="effect-editor">
      {hasHosts ? (
        <>{tabNode}{toolsNode}</>
      ) : (
        <div className="flex items-center gap-2">{tabNode}<div className="ml-auto flex items-center gap-2">{toolsNode}</div></div>
      )}
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
      {/* Body (Jake's screenshots): the timing column on the left, the
          pattern samples / curve canvas / movement path in the centre,
          and the pattern picker + parameters on the right. The centre
          column is a flex column so the sample strip (pattern) and
          the canvas (curve) stretch to fill the panel height instead
          of scrolling. */}
      <div className="flex min-h-0 flex-1 gap-3">
        <TimingColumn effect={effect} update={update} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {kind === 'pattern' && <PatternEditor effect={effect} update={update} />}
          {kind === 'curve' && (
            <CurveEditor
              effect={effect}
              update={update}
              activeComponent={activeCurveComponent}
              onActiveComponent={setActiveCurveComponent}
            />
          )}
          {kind === 'movement' && <MovementEditor effect={effect} update={update} movementChartHost={movementChartHost} />}
        </div>
        <div className="flex w-56 shrink-0 flex-col gap-2">
          {kind === 'pattern' && <PatternParams effect={effect} update={update} />}
          {kind === 'curve' && <CurveParams effect={effect} update={update} activeComponent={activeCurveComponent} />}
          {kind === 'movement' && <MovementParams effect={effect} update={update} />}
        </div>
      </div>
    </div>
  )
}
