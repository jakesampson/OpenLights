import { useEffect, useMemo, useRef, useState } from 'react'
import { previewFixtureValues, previewBeamAppearance } from '../lib/previewOutput'
import { alignObjects, type AlignMode } from '../lib/align'
import { resizeFixtureIcon, rotateFixtureIcon } from '../lib/fixtureGeometry'
import { marqueeSelection } from '../lib/previewSelection'
import { fitPreview, type Bounds } from '../lib/previewViewport'
import { moveTruss, resizeTruss, rotateTruss, snapFixtureToTruss, snapTrussEndpoints, sweepTruss, trussArcAngles, trussArcPath, trussArcPoint, trussLatticeRungs } from '../lib/trussGeometry'
import { fixtureBeams, fixtureMode } from '@shared/fixtureProfiles'
import { resolveCueValues } from '@shared/cueResolution'
import { orderedFanTargets } from '../lib/fanning'
import { defaultColorFan, defaultFan, definedFanIndexes, fannableProperties } from '../lib/fanningHud'
import { fixtureValuesToHex } from '../lib/colorMix'
import { StageObjectLayer } from './StageObjects'
import { FanningHud } from './FanningHud'
import { CalibrationDialog } from './CalibrationDialog'
import { isCalibrationComplete } from '../lib/calibration'
import { useShowStore } from '../stores/showStore'
import { previewSpacePan } from '../lib/previewSpacePan'
import { instanceKey, instancePositions } from '../lib/previewLayout'
import type { FanDef, FixtureDef, CueDef, PreviewTruss } from '@shared/types'

interface Pos { x: number; y: number }
interface FixtureView extends FixtureDef {
  /** Count instance index (0 for a single fixture); `key` is `${id}:${instance}`. */
  instance: number
  key: string
  pos: Pos
  intensity: number
  color: string
}

function clamp(v: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, v))
}

function averageAttribute(values: Record<string, number>, attribute: string) {
  const attributes = [
    attribute,
    `${attribute}2`,
    `${attribute}3`,
    `${attribute}4`
  ].filter((key) => typeof values[key] === 'number')
  if (attributes.length === 0) return 0
  return attributes.reduce((total, key) => total + values[key], 0) / attributes.length
}

export function fixtureColor(values?: Record<string, number>, dimmerOnly = false): string {
  if (!values) return '#5d3a72'
  if (dimmerOnly && !['red', 'green', 'blue'].some((attribute) => typeof values?.[attribute] === 'number')) {
    values = { ...values, red: 255, green: 255, blue: 255 }
  }
  const dim = clamp(values.intensity ?? 255, 0, 255) / 255
  const white = values.white ?? 0
  const amber = values.amber ?? 0
  const r = Math.round(clamp(averageAttribute(values, 'red') + white + amber) * dim)
  const g = Math.round(
    clamp(averageAttribute(values, 'green') + white + amber * 0.45) * dim
  )
  const b = Math.round(clamp(averageAttribute(values, 'blue') + white) * dim)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function fixturePositions(count: number) {
  // Overhead truss arc + floor positions.
  const positions: Array<{ x: number; y: number }> = []
  const overhead = Math.min(count, 6)

  // Spread fixtures evenly along the full truss arc (x 40..760), following
  // the quadratic curve y = 80 - 84·t·(1 - t) so they sit on the truss.
  for (let i = 0; i < overhead; i++) {
    const t = (i + 0.5) / overhead
    const x = 40 + 720 * t
    const y = 80 - 84 * t * (1 - t)
    positions.push({ x, y })
  }

  // Remaining fixtures go on the stage deck as up-lights.
  const floorCount = Math.max(0, count - overhead)
  for (let i = 0; i < floorCount; i++) {
    const t = (i + 0.5) / floorCount
    positions.push({ x: 40 + 720 * t, y: 300 })
  }

  return positions.slice(0, count)
}

export function StagePreview({ designMode = true }: { designMode?: boolean }) {
  const { locked, show, activeCueId, selectedFixtureIds, selectFixture, selectFixtures, setFixturePositions, setFixtureInstancePositions, newFixtureIds, clearNewFixtureIds, setPreviewTrusses, previewEditing, setPreviewEditing, selectedPreviewTrussId, setSelectedPreviewTrussId, selectedLayoutTrussIds, setSelectedLayoutTrussIds, selectedStageObjectId, setSelectedStageObjectId, highlightMode, toggleHighlightMode, setupWizardStep } = useShowStore()
  // Fanning HUD (LightKey Guide §8, p.118 to 123): the HUD lives in the
  // Preview, around the fixtures' icons, and is a Design-view activity —
  // so its toolbar button only shows in Design mode, and the HUD closes
  // when leaving Design or when the project locks.
  const [fanDraft, setFanDraft] = useState<FanDef | null>(null)
  // Beam Direction dialog (Piece 4, Guide pp.58–60): opens from Layout >
  // Beam Direction…, the fixture's shortcut menu, or the Preview edit
  // panel's Beam Direction… button — for the selected fixtures. It
  // closes when leaving Design or when the project locks, like the HUD.
  const [calibrationFixtureIds, setCalibrationFixtureIds] = useState<string[] | null>(null)
  useEffect(() => { if (!designMode || locked) setCalibrationFixtureIds(null) }, [designMode, locked])
  useEffect(() => {
    const handler = () => {
      if (!designMode || locked) return
      const ids = useShowStore.getState().selectedFixtureIds
      if (ids.length) setCalibrationFixtureIds([...ids])
    }
    window.addEventListener('openlights-open-calibration', handler)
    return () => window.removeEventListener('openlights-open-calibration', handler)
  }, [designMode, locked])
  // LightKey's Position fanning lets you fan pan, tilt, or both (video:
  // "we can choose whether the pan angles tilt angles or both should be
  // fanned"). OpenLights fans one attribute per fan, so "both" is two
  // fans: the second is created when the first is first committed, with
  // the first fan's mode, order and fixture set. Pending until then.
  const pendingAlsoFan = useRef<{ attribute: string; fixtureIds: string[] } | null>(null)
  useEffect(() => { if (!designMode || locked) { setFanDraft(null); pendingAlsoFan.current = null } }, [designMode, locked])
  const openFanHud = (attribute?: string, alsoAttribute?: string) => {
    const selected = (show?.fixtures ?? []).filter((f) => selectedFixtureIds.includes(f.id))
    const channels = fannableProperties(selected)
    const wanted = attribute && channels.some((c) => c.attribute === attribute) ? attribute : undefined
    const chosen = wanted ?? (channels.some((c) => c.attribute === 'intensity') ? 'intensity' : channels[0]?.attribute ?? 'intensity')
    // A property that is already fanned on the active cue reopens its fan
    // for editing (Guide p.122: "Click the icon in the Design view") —
    // the Design panel's fanned-property icon dispatches this same event.
    const state = useShowStore.getState()
    const activeCue = state.cues.find((c) => c.id === state.activeCueId)
    const existing = activeCue?.fans?.find((f) => f.attribute === chosen && f.fixtureIds.some((id) => selectedFixtureIds.includes(id)))
    if (existing) { setFanDraft(structuredClone(existing)); return }
    // Beams selected in the Preview fan across themselves (Guide p.119):
    // the new draft's targets are those beams, not the whole fixtures.
    // selectFixtureBeam keeps selectedFixtureIds in step, so the beams'
    // fixtures are the selected fixtures above.
    const withSelectedBeams = (draft: FanDef): FanDef =>
      state.selectedBeams.length ? { ...draft, beams: state.selectedBeams.map((b) => ({ fixtureId: b.fixtureId, beamId: b.beamId })) } : draft
    if (chosen === 'color') {
      // Start/end colours default to the first/last selected fixtures'
      // current colours (video: "click the first and last fixture to
      // change the start and end color"); red → blue when undefined.
      // The colours are the cue's resolved look (Piece 8) — a colour
      // defined by a preset is the colour the fixture shows.
      const values = activeCue ? resolveCueValues(activeCue, state.presets) : {}
      const firstColor = fixtureValuesToHex(values[selected[0]?.id ?? ''] ?? {}) ?? '#ff0000'
      const lastColor = fixtureValuesToHex(values[selected[selected.length - 1]?.id ?? ''] ?? {}) ?? '#0000ff'
      setFanDraft(withSelectedBeams(defaultColorFan([...selectedFixtureIds], firstColor, lastColor)))
    } else {
      setFanDraft(withSelectedBeams(defaultFan(chosen, [...selectedFixtureIds], channels.find((c) => c.attribute === chosen))))
    }
    if (alsoAttribute) pendingAlsoFan.current = { attribute: alsoAttribute, fixtureIds: [...selectedFixtureIds] }
  }
  // The Fanning HUD's entry point (LightKey Guide §8, p.119: click the
  // fixture property's name in the Design view, then choose Add Fanning…)
  // lives on each property in the Design panel, not on the Preview
  // toolbar — the panel dispatches this event with the property that was
  // picked (and, for Pan + Tilt, the second property), and the HUD opens
  // here, in the Preview around the fixtures' icons.
  useEffect(() => {
    const handler = (event: Event) => {
      if (!designMode || locked) return
      const detail = (event as CustomEvent<{ attribute?: string; alsoAttribute?: string }>).detail
      openFanHud(detail?.attribute, detail?.alsoAttribute)
    }
    window.addEventListener('openlights-open-fan-hud', handler)
    return () => window.removeEventListener('openlights-open-fan-hud', handler)
  }, [designMode, locked, show, selectedFixtureIds])
  const commitFan = (next: FanDef) => {
    // saveFan is a no-op with no active cue (and addCue does not activate
    // the cue it creates), so start a cue and activate it first — the same
    // "editing starts a new cue" the Design panel promises.
    const committed = { ...next, id: next.id || crypto.randomUUID() }
    setFanDraft(committed)
    const state = useShowStore.getState()
    if (!state.activeCueId) {
      state.addCue()
      const created = useShowStore.getState().cues[useShowStore.getState().cues.length - 1]
      if (created) useShowStore.getState().activateCue(created.id)
    }
    const isNew = !useShowStore.getState().cues.find((c) => c.id === useShowStore.getState().activeCueId)?.fans?.some((f) => f.id === committed.id)
    useShowStore.getState().saveFan(committed)
    const pending = pendingAlsoFan.current
    if (isNew && pending) {
      pendingAlsoFan.current = null
      const selected = (useShowStore.getState().show?.fixtures ?? []).filter((f) => pending.fixtureIds.includes(f.id))
      const channel = fannableProperties(selected).find((c) => c.attribute === pending.attribute)
      if (channel) useShowStore.getState().saveFan({ ...defaultFan(pending.attribute, pending.fixtureIds, channel), id: crypto.randomUUID(), mode: committed.mode, order: committed.order, considerSpacing: committed.considerSpacing, ...(committed.beams ? { beams: committed.beams } : {}) })
    }
  }
  const deleteFanFromHud = (id: string, keepValues: boolean) => {
    useShowStore.getState().deleteFan(id, keepValues)
    if (fanDraft?.id === id) setFanDraft(null)
  }
  // Preview edit mode is owned by the header Edit toggle (store
  // previewEditing, LightKey Guide p.53) — this component only reads it.
  // Leaving Design or locking the project exits edit mode, mirroring how
  // the Fanning HUD closes in the same cases.
  const editing = previewEditing
  useEffect(() => { if (locked || !designMode) setPreviewEditing(false) }, [locked, designMode, setPreviewEditing])
  const [outputChannels, setOutputChannels] = useState<number[]>([])
  useEffect(() => {
    let alive = true
    let pending = false
    const readOutput = async () => {
      if (pending || !window.electronAPI?.getChannels) return
      pending = true
      try { const values = await window.electronAPI.getChannels(); if (alive) setOutputChannels(values) }
      catch { /* Keep the last known output if the bridge is unavailable. */ }
      finally { pending = false }
    }
    void readOutput()
    const timer = window.setInterval(readOutput, 100)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])
  const [trussDraft, setTrussDraft] = useState<PreviewTruss | null>(null)
  const trussDragRef = useRef<{ mode: 'move' | 'resize' | 'rotate' | 'sweep-start' | 'sweep-end'; start: Pos; original: PreviewTruss; current: PreviewTruss } | null>(null)
  // Truss / stage-object selection lives in the store now: the right side
  // panel becomes the Preview inspector in edit mode (Guide p.53), so
  // both the canvas and the panel read the same selection.
  const copiedTrussRef = useRef<PreviewTruss | null>(null)
  const [marquee, setMarquee] = useState<{ start: Pos; current: Pos; additive: boolean } | null>(null)
  const fixtureHandleRef = useRef<{ fixture: FixtureDef; mode: 'resize' | 'rotate'; centre: Pos; start: Pos } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [viewCentre, setViewCentre] = useState({ x: 400, y: 170 })
  const [dragPositions, setDragPositions] = useState<Record<string, Pos> | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ start: Pos; originals: Record<string, Pos>; positions: Record<string, Pos>; fixtureIds: string[] } | null>(null)
  // Canvas pan (LightKey Guide p.53: Space+drag pans the Preview; "when
  // the Preview is enlarged you can scroll to move the visible area").
  // A pan starts from a blank drag in non-edit mode (no marquee there)
  // or from a Space+blank drag in edit mode; a blank drag without Space
  // stays marquee selection in edit mode (see NOTES.md).
  const panRef = useRef<{ startClient: Pos; startCentre: Pos; moved: boolean } | null>(null)
  const pointerOverRef = useRef(false)
  // The native wheel listener reads the latest view without re-registering.
  const viewStateRef = useRef({ zoom, viewCentre })
  viewStateRef.current = { zoom, viewCentre }
  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const result = point.matrixTransform(matrix.inverse())
    return { x: result.x, y: result.y }
  }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      // preventDefault needs a non-passive listener — React's onWheel is
      // passive, so this is attached natively.
      event.preventDefault()
      const view = viewStateRef.current
      if (event.ctrlKey || event.metaKey) {
        // Pinch / Ctrl+scroll zooms around the cursor (LightKey Guide
        // p.53: "Hold down the Option key and scroll… On a trackpad,
        // pinch using two fingers"; Ctrl is the Windows stand-in).
        const factor = Math.exp(-event.deltaY * 0.0015)
        const nextZoom = Math.max(0.125, Math.min(8, view.zoom * factor))
        const cursor = toWorld(event.clientX, event.clientY)
        if (cursor) {
          const scale = view.zoom / nextZoom
          setViewCentre({ x: cursor.x - (cursor.x - view.viewCentre.x) * scale, y: cursor.y - (cursor.y - view.viewCentre.y) * scale })
        }
        setZoom(nextZoom)
      } else {
        // Two-finger scroll pans in all directions; the viewBox is
        // 800/zoom world units across the element's pixel width.
        const rect = svg.getBoundingClientRect()
        const scale = (800 / view.zoom) / rect.width
        setViewCentre({ x: view.viewCentre.x + event.deltaX * scale, y: view.viewCentre.y + event.deltaY * scale })
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])
  // Space+drag pan (Guide p.53). Space is also OpenLights' Go shortcut,
  // so while Space is held over the Preview in edit mode the flag tells
  // App's key handler not to fire Go — this listener is registered with
  // capture so it runs before App's bubble-phase handler even after
  // re-registration when edit mode toggles.
  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) return
      if (!pointerOverRef.current) return
      previewSpacePan.held = true
      event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === 'Space') previewSpacePan.held = false }
    const onBlur = () => { previewSpacePan.held = false }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      previewSpacePan.held = false
    }
  }, [editing])
  const pointAt = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const result = point.matrixTransform(matrix.inverse())
    return { x: Math.round(clamp(result.x, 0, 800)), y: Math.round(clamp(result.y, 0, 340)) }
  }
  // Exiting edit mode clears any in-progress drag, as the old "Edit
  // layout" button did when it was toggled off.
  useEffect(() => {
    if (editing) return
    setDragPositions(null); dragRef.current = null; trussDragRef.current = null; setTrussDraft(null)
  }, [editing])
  const storedFixtures = (show?.fixtures ?? []).filter((f) => f.inStorage)
  const fixtures: FixtureDef[] = (show?.fixtures ?? []).filter((f) => !f.inStorage)
  const cues: CueDef[] = show?.cues ?? []
  const activeCue = activeCueId ? cues.find((s) => s.id === activeCueId) : null
  // The cue's resolved look (Piece 8) for the preview's dimmer-fixture
  // colours; memoised so the fixture views only recompute when the cue
  // or a preset it references changes.
  const cueValues = useMemo(() => (activeCue ? resolveCueValues(activeCue, show?.presets ?? []) : {}), [activeCue, show?.presets])

  const fixtureViews = useMemo((): FixtureView[] => {
    if (fixtures.length === 0) {
      // Demo rig when nothing patched.
      return fixturePositions(8).map((pos, i) => ({
        id: `demo-${i}`,
        name: `Demo Light ${i + 1}`,
        type: i < 4 ? 'par' : 'moving-head',
        channelStart: i + 1,
        channels: 4,
        instance: 0,
        key: `demo-${i}:0`,
        pos: { x: pos.x, y: pos.y },
        intensity: 170,
        color: '#c24bd6'
      }))
    }
    // One view per Count instance: each instance is its own placeable
    // icon on the canvas (LightKey Guide p.30 — "multiple instances of
    // the fixture in the Preview"), with its own stored position. A
    // fixture with no stored position at all falls back to the demo-arc
    // layout, fanned like Piece 1 did, so old shows do not jump.
    const arc = fixturePositions(fixtures.length)
    const views: FixtureView[] = []
    fixtures.forEach((f, fixtureIndex) => {
      const values = previewFixtureValues(f, outputChannels, cueValues[f.id])
      const stored = instancePositions(f)
      const count = f.count ?? 1
      for (let instance = 0; instance < count; instance++) {
        const fallback = arc[fixtureIndex] ? { x: arc[fixtureIndex].x + instance * 28, y: arc[fixtureIndex].y } : { x: 400, y: 170 }
        views.push({
          ...f,
          instance,
          key: instanceKey(f.id, instance),
          pos: dragPositions?.[instanceKey(f.id, instance)] ?? stored[instance] ?? fallback,
          intensity: values.intensity ?? Math.max(values.red ?? 0, values.green ?? 0, values.blue ?? 0, values.white ?? 0, values.amber ?? 0),
          color: fixtureColor(values, f.type === 'dimmer')
        })
      }
    })
    return views
  }, [fixtures, activeCue, cueValues, dragPositions, outputChannels])

  // Newly patched fixtures appear with a short fade/scale-in when they
  // first land on the canvas (Jake, 19 Nov 2026 — his addition, not a
  // LightKey behaviour, so it stays at 300ms). The marker is set by
  // addProfileFixtures and survives while the user is still on the Patch
  // view, so the animation plays when they come back to the Preview.
  useEffect(() => {
    if (!newFixtureIds.length) return
    const timer = window.setTimeout(clearNewFixtureIds, 450)
    return () => window.clearTimeout(timer)
  }, [newFixtureIds, clearNewFixtureIds])

  const trusses = show?.previewTrusses ?? []
  // Blue dots (Guide p.121) while the Fanning HUD is open: the fixtures
  // in the fan that have a defined value — the two endpoints plus any
  // intermediate anchors — get a dot next to their icon.
  const fanDefined = useMemo(() => {
    if (!fanDraft) return null
    const targets = orderedFanTargets(fixtures, fanDraft)
    const defined = new Set(definedFanIndexes(fanDraft, targets.length))
    const map = new Map<string, boolean>()
    targets.forEach((target, i) => { if (defined.has(i)) map.set(target.fixture.id, true) })
    return map
  }, [fanDraft, fixtures])
  const selectedTruss = trussDraft ?? trusses.find((item) => item.id === selectedPreviewTrussId)
  const fit = (selectionOnly: boolean) => {
    const bounds: Bounds[] = fixtureViews.filter((f) => !selectionOnly || selectedFixtureIds.includes(f.id)).map((f) => ({ x: f.pos.x - 10, y: f.pos.y - 10, width: 20, height: 20 }))
    for (const truss of trusses.filter((t) => !selectionOnly || t.id === selectedPreviewTrussId)) {
      const angle = truss.rotation * Math.PI / 180, w = truss.width, h = truss.shape === 'straight' ? 8 : truss.height
      const width = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle)), height = Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle))
      bounds.push({ x: truss.x - width / 2, y: truss.y - height / 2, width, height })
    }
    const viewport = fitPreview(bounds)
    setZoom(800 / viewport.width); setViewCentre({ x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 })
  }
  useEffect(() => {
    const handler = (event: Event) => { const command = (event as CustomEvent<string>).detail; if (command === 'fit' || command === 'selection') fit(command === 'selection'); else setZoom((z) => Math.max(0.125, Math.min(8, z * (command === 'in' ? 1.2 : 1 / 1.2)))) }
    window.addEventListener('openlights-preview-zoom', handler)
    return () => window.removeEventListener('openlights-preview-zoom', handler)
  }, [fixtures, trusses, selectedFixtureIds, selectedPreviewTrussId])
  const duplicateTruss = (source: PreviewTruss) => {
    const item = { ...source, id: crypto.randomUUID(), x: source.x + 20, y: source.y + 20 }
    setPreviewTrusses([...trusses, item]); setSelectedPreviewTrussId(item.id)
    return item
  }
  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (event.key.toLowerCase() === 'c' && selectedTruss) {
        copiedTrussRef.current = { ...selectedTruss }
        event.preventDefault()
      } else if (event.key.toLowerCase() === 'v' && copiedTrussRef.current) {
        copiedTrussRef.current = duplicateTruss(copiedTrussRef.current)
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editing, selectedTruss, trusses, setPreviewTrusses])
  const align = (mode: AlignMode) => {
    // Align works on instance positions: every icon of a selected fixture
    // is aligned, and the result is committed per instance.
    const selected = fixtureViews.filter((f) => selectedFixtureIds.includes(f.id)).map((f) => ({ id: f.key, x: f.pos.x, y: f.pos.y, width: 20, height: 20 }))
    for (const truss of trusses.filter((t) => selectedLayoutTrussIds.includes(t.id) || t.id === selectedPreviewTrussId)) {
      const angle = truss.rotation * Math.PI / 180, height = truss.shape === 'straight' ? 8 : truss.height
      selected.push({ id: truss.id, x: truss.x, y: truss.y, width: Math.abs(truss.width * Math.cos(angle)) + Math.abs(height * Math.sin(angle)), height: Math.abs(truss.width * Math.sin(angle)) + Math.abs(height * Math.cos(angle)) })
    }
    if (selected.length < 2) return
    const output = alignObjects(selected, mode), state = useShowStore.getState()
    state.beginHistoryGroup()
    setFixtureInstancePositions(Object.fromEntries(Object.entries(output).filter(([id]) => fixtureViews.some((f) => f.key === id))))
    setPreviewTrusses(trusses.map((t) => output[t.id] ? { ...t, ...output[t.id] } : t))
    state.endHistoryGroup()
  }
  // The Align control lives in the side-panel Inspector now, so it
  // dispatches the mode here — aligning needs the live fixture positions
  // that only the canvas holds.
  useEffect(() => {
    const handler = (event: Event) => { align((event as CustomEvent<AlignMode>).detail) }
    window.addEventListener('openlights-preview-align', handler)
    return () => window.removeEventListener('openlights-preview-align', handler)
  }, [align])

  return (
    <div
      className="panel stage min-h-0 overflow-hidden relative bg-bg"
      onPointerEnter={() => { pointerOverRef.current = true }}
      onPointerLeave={() => { pointerOverRef.current = false }}
    >
      {/* The Preview toolbar carries no buttons of its own any more: the
          header Edit toggle owns edit mode (LightKey Guide p.53), the
          Fanning HUD is opened from the Design panel (Guide §8, p.119),
          and Locate has no button — LightKey's nearest equivalent is
          Highlight Mode, which OpenLights does not replicate yet (see
          NOTES.md). The edit tools live in the side-panel Inspector
          (Guide p.53) in edit mode, so the canvas stays clean — only
          the Preview label and the zoom cluster remain on it. */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1">
        <span className="rounded bg-bg/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-dim">Preview</span>
      </div>
      {fanDraft && <FanningHud draft={fanDraft} fixtures={fixtures} fans={activeCue?.fans ?? []} selectedCount={selectedFixtureIds.length} hasActiveCue={Boolean(activeCue)} onCommit={commitFan} onEditFan={(fan) => setFanDraft(structuredClone(fan))} onNewFan={openFanHud} onDeleteFan={deleteFanFromHud} onClose={() => { setFanDraft(null); pendingAlsoFan.current = null }} />}
      {calibrationFixtureIds && <CalibrationDialog fixtureIds={calibrationFixtureIds} onClose={() => setCalibrationFixtureIds(null)} />}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded bg-bg/80 p-1">
        <button type="button" aria-label="Toggle highlight mode" aria-pressed={highlightMode} title="Highlight mode (Cmd-Shift-H): only the selected fixtures light up" onClick={() => toggleHighlightMode()} className={highlightMode ? 'rounded bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black' : 'px-2 text-[10px] text-dim'}>Highlight</button>
        <button type="button" aria-label="Zoom out preview" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} className="px-2 text-sm text-text">−</button>
        <button type="button" onClick={() => { setZoom(1); setViewCentre({ x: 400, y: 170 }) }} className="px-1 text-[10px] text-dim" title="Reset preview zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" className="px-1 text-[10px] text-dim" onClick={() => fit(false)}>Fit</button><button type="button" className="px-1 text-[10px] text-dim" disabled={!selectedFixtureIds.length && !selectedPreviewTrussId} onClick={() => fit(true)}>Selection</button><button type="button" aria-label="Zoom in preview" onClick={() => setZoom((z) => Math.min(8, z * 1.2))} className="px-2 text-sm text-text">+</button>
      </div>
      {/* Truss / fixture properties and the storage tray live in the
          side-panel Inspector in edit mode now (Guide p.53) — see
          PreviewEditPanel. The canvas keeps only the Preview label
          and the zoom cluster. */}
      <svg
        ref={svgRef}
        className="h-full w-full"
        style={{ touchAction: 'none' }}
        onDragOver={(event) => { if (editing && event.dataTransfer.types.includes('application/x-openlights-fixture')) event.preventDefault() }}
        onDrop={(event) => { if (!editing) return; const id = event.dataTransfer.getData('application/x-openlights-fixture'), point = pointAt(event); if (point && storedFixtures.some((f) => f.id === id)) { event.preventDefault(); setFixturePositions({ [id]: point }); selectFixtures([id]) } }}
        viewBox={`${viewCentre.x - 400 / zoom} ${viewCentre.y - 170 / zoom} ${800 / zoom} ${340 / zoom}`}
        onPointerMove={(event) => { if (fixtureHandleRef.current) { const d = fixtureHandleRef.current, point = pointAt(event); if (point) useShowStore.getState().updateFixture(d.fixture.id, d.mode === 'resize' ? { iconSize: resizeFixtureIcon(d.fixture, d.centre, d.start, point) } : { rotation: rotateFixtureIcon(d.fixture, d.centre, d.start, point) }); return } if (marquee) { const point = pointAt(event); if (point) setMarquee({ ...marquee, current: point }); return } if (trussDragRef.current) { const point = pointAt(event); if (point) { const drag = trussDragRef.current; const next = drag.mode === 'move' ? moveTruss(drag.original, drag.start, point) : drag.mode === 'rotate' ? rotateTruss(drag.original, drag.start, point, event.shiftKey) : drag.mode === 'sweep-start' ? sweepTruss(drag.original, 'start', drag.start, point, event.shiftKey) : drag.mode === 'sweep-end' ? sweepTruss(drag.original, 'end', drag.start, point, event.shiftKey) : resizeTruss(drag.original, drag.start, point, event.shiftKey); drag.current = drag.mode === 'rotate' || drag.mode === 'sweep-start' || drag.mode === 'sweep-end' ? next : snapTrussEndpoints(next, trusses); setTrussDraft(drag.current) } return } if (panRef.current) { const pan = panRef.current; const rect = svgRef.current?.getBoundingClientRect(); if (rect) { const scale = (800 / zoom) / rect.width; if (Math.abs(event.clientX - pan.startClient.x) > 3 || Math.abs(event.clientY - pan.startClient.y) > 3) pan.moved = true; setViewCentre({ x: pan.startCentre.x - (event.clientX - pan.startClient.x) * scale, y: pan.startCentre.y - (event.clientY - pan.startClient.y) * scale }) } return } if (!dragRef.current) return; const position = pointAt(event); if (position) { const drag = dragRef.current; const dx = position.x - drag.start.x, dy = position.y - drag.start.y; const positions = Object.fromEntries(Object.entries(drag.originals).map(([id, original]) => [id, { x: clamp(original.x + dx, 0, 800), y: clamp(original.y + dy, 0, 340) }])); drag.positions = positions; setDragPositions(positions) } }}
        onPointerUp={(event) => { if (fixtureHandleRef.current) { fixtureHandleRef.current = null; useShowStore.getState().endHistoryGroup(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return } if (marquee) { const ids = marqueeSelection([...fixtureViews.map((f) => ({ id: f.key, x: f.pos.x, y: f.pos.y, width: 20, height: 20 })), ...trusses.map((t) => ({ ...t, height: t.shape === 'straight' ? 8 : t.height }))], marquee.start, pointAt(event) ?? marquee.current); const fixtures = [...new Set(ids.map((id) => fixtureViews.find((f) => f.key === id)?.id).filter((id): id is string => Boolean(id)))]; selectFixtures(marquee.additive ? [...new Set([...selectedFixtureIds, ...fixtures])] : fixtures); const selected = ids.filter((id) => trusses.some((t) => t.id === id)); setSelectedLayoutTrussIds(marquee.additive ? [...new Set([...selectedLayoutTrussIds, ...selected])] : selected); setSelectedPreviewTrussId(selected[0] ?? null); setMarquee(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return } if (trussDragRef.current) { const item = trussDragRef.current.current; trussDragRef.current = null; setTrussDraft(null); setPreviewTrusses(trusses.map((truss) => truss.id === item.id ? item : truss)); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); return } if (panRef.current) { const pan = panRef.current; panRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (!pan.moved && !editing) selectFixtures([]); return } if (!dragRef.current) return; const drag = dragRef.current; dragRef.current = null; setDragPositions(null); const tray = document.getElementById('fixture-storage-tray')?.getBoundingClientRect(); if (tray && event.clientX >= tray.left && event.clientX <= tray.right && event.clientY >= tray.top && event.clientY <= tray.bottom) { const state = useShowStore.getState(); state.beginHistoryGroup(); for (const id of drag.fixtureIds) state.updateFixture(id, { inStorage: true }); state.endHistoryGroup(); selectFixtures([]); return } setFixtureInstancePositions(Object.fromEntries(Object.entries(drag.positions).map(([key, position]) => [key, snapFixtureToTruss(position, trusses)]))); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onPointerCancel={() => { if (fixtureHandleRef.current) { const f = fixtureHandleRef.current.fixture; useShowStore.getState().updateFixture(f.id, { iconSize: f.iconSize, rotation: f.rotation }); fixtureHandleRef.current = null; useShowStore.getState().endHistoryGroup() } setMarquee(null); panRef.current = null; dragRef.current = null; setDragPositions(null); trussDragRef.current = null; setTrussDraft(null) }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Blueprint grid (LightKey's edit-mode Preview, Guide p.53:
            "While the Preview is in edit mode, a grid is shown in the
            background which helps you to align objects"). Colours sampled
            from Jake's LightKey screenshot (19 Nov 2026): background
            #496077, minor lines #64788b every 60 units, major lines
            #8090a0 every 240. The default stage background (glow, deck,
            silhouettes, demo arc) is gone — preview mode is just a blank
            window. The rects cover twice the viewBox, not just the
            viewBox: with preserveAspectRatio="meet" the viewBox maps to
            a centred band inside the element when the window aspect
            differs, and the extra margin paints the grid into those
            letterbox bands too, so the grid reaches the panel edges at
            any window size (Jake, 19 Nov 2026 — edge to edge). The
            rects are pointer-events none; the transparent hit rect
            below stays exactly the viewBox, so pan/marquee behaviour
            is unchanged. */}
        <defs>
          <pattern id="blueprintGrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <rect width="60" height="60" fill="#496077" />
            <path d="M 60 0 H 0 V 60" fill="none" stroke="#64788b" strokeWidth="1" />
          </pattern>
          <pattern id="blueprintGridMajor" width="240" height="240" patternUnits="userSpaceOnUse">
            <path d="M 240 0 H 0 V 240" fill="none" stroke="#8090a0" strokeWidth="1" />
          </pattern>
        </defs>
        {editing && <rect x={viewCentre.x - 800 / zoom} y={viewCentre.y - 340 / zoom} width={1600 / zoom} height={680 / zoom} fill="url(#blueprintGrid)" pointerEvents="none" />}
        {editing && <rect x={viewCentre.x - 800 / zoom} y={viewCentre.y - 340 / zoom} width={1600 / zoom} height={680 / zoom} fill="url(#blueprintGridMajor)" pointerEvents="none" />}
        <rect x={viewCentre.x - 400 / zoom} y={viewCentre.y - 170 / zoom} width={800 / zoom} height={340 / zoom} fill="transparent" onPointerDown={(event) => {
          // Blank drag: in edit mode without Space this is marquee
          // selection (LightKey Guide p.53); with Space held it pans,
          // and outside edit mode — where there is no marquee — a blank
          // drag always pans. See NOTES.md for the resolution.
          if (previewSpacePan.held && editing) {
            event.preventDefault()
            panRef.current = { startClient: { x: event.clientX, y: event.clientY }, startCentre: viewCentre, moved: false }
            svgRef.current?.setPointerCapture(event.pointerId)
            return
          }
          if (!editing) {
            event.preventDefault()
            panRef.current = { startClient: { x: event.clientX, y: event.clientY }, startCentre: viewCentre, moved: false }
            svgRef.current?.setPointerCapture(event.pointerId)
            return
          }
          const start = pointAt(event); if (!start) return
          event.preventDefault()
          setMarquee({ start, current: start, additive: event.shiftKey })
          svgRef.current?.setPointerCapture(event.pointerId)
        }} />
        {trusses.map((savedTruss) => { const truss = trussDraft?.id === savedTruss.id ? trussDraft : savedTruss; return <g key={truss.id} transform={`translate(${truss.x} ${truss.y}) rotate(${truss.rotation})`} onPointerDown={(event) => { if (!editing) return; event.preventDefault(); event.stopPropagation(); const start = pointAt(event); if (!start) return; setSelectedPreviewTrussId(truss.id); trussDragRef.current = { mode: 'move', start, original: truss, current: truss }; svgRef.current?.setPointerCapture(event.pointerId) }} style={{ cursor: editing ? 'grab' : 'default', touchAction: 'none' }}>
          {(() => { const isArc = truss.shape === 'curved' || truss.shape === 'circular'; const path = isArc ? trussArcPath(truss) : truss.shape === 'u' ? `M ${-truss.width / 2} ${truss.height / 2} V ${-truss.height / 2} H ${truss.width / 2} V ${truss.height / 2}` : `M ${-truss.width / 2} 0 H ${truss.width / 2}`; return <>
            <path d={path} fill="none" stroke={(selectedPreviewTrussId === truss.id || selectedLayoutTrussIds.includes(truss.id)) && editing ? 'var(--sel)' : 'var(--line)'} strokeWidth="8" strokeLinecap="round" />
            <path d={path} fill="none" stroke="var(--text)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="5 5" />
            {isArc && trussLatticeRungs(truss).map(([a, b], i) => <line key={`rung-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--text)" strokeOpacity="0.45" strokeWidth="1.5" pointerEvents="none" />)}
          </> })()}
          {editing && selectedPreviewTrussId === truss.id && <>
            <rect x={-truss.width / 2} y={truss.shape === 'straight' ? -6 : -truss.height / 2} width={truss.width} height={truss.shape === 'straight' ? 12 : truss.height} fill="none" stroke="var(--sel)" strokeWidth="1" strokeDasharray="4 3" pointerEvents="none" />
            {(truss.shape === 'curved' || truss.shape === 'circular') ? <>
              {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => <circle key={`${sx}${sy}`} cx={sx * truss.width / 2} cy={sy * truss.height / 2} r="5" fill="var(--accent)" stroke="var(--text)" strokeWidth="1.5" style={{ cursor: 'nwse-resize' }} aria-label={`Resize ${truss.name}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); const start = pointAt(event); if (!start) return; trussDragRef.current = { mode: 'resize', start, original: truss, current: truss }; svgRef.current?.setPointerCapture(event.pointerId) }} />)}
              {truss.shape === 'curved' && (() => { const { start, end } = trussArcAngles(truss); return (['start', 'end'] as const).map((which) => { const p = trussArcPoint(truss, which === 'start' ? start : end); return <circle key={which} cx={p.x} cy={p.y} r="6" fill="#22c55e" stroke="var(--text)" strokeWidth="1.5" style={{ cursor: 'grab' }} aria-label={`${which === 'start' ? 'Start' : 'End'} angle of ${truss.name}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); const startPoint = pointAt(event); if (!startPoint) return; trussDragRef.current = { mode: which === 'start' ? 'sweep-start' : 'sweep-end', start: startPoint, original: truss, current: truss }; svgRef.current?.setPointerCapture(event.pointerId) }}><title>Drag to change the {which} angle (Shift: 45°)</title></circle> }) })()}
              {(() => { const { end } = trussArcAngles(truss); const p = truss.shape === 'circular' ? trussArcPoint(truss, -90) : trussArcPoint(truss, end); const len = Math.hypot(p.x, p.y) || 1; const label = { x: p.x + p.x / len * 16, y: p.y + p.y / len * 16 }; return <text x={label.x} y={label.y} textAnchor="middle" fill="var(--text)" fontSize="10" pointerEvents="none">{`${Math.round(truss.rotation)}°`}</text> })()}
            </> : <>
              <rect x={truss.width / 2 - 6} y={(truss.shape === 'u' ? truss.height / 2 : 0) - 6} width="12" height="12" fill="var(--text)" stroke="var(--accent)" strokeWidth="2" style={{ cursor: 'nwse-resize' }} aria-label={`Resize ${truss.name}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); const start = pointAt(event); if (!start) return; trussDragRef.current = { mode: 'resize', start, original: truss, current: truss }; svgRef.current?.setPointerCapture(event.pointerId) }} />
            </>}
            <line x1="0" y1={truss.shape === 'straight' ? -6 : -truss.height / 2} x2="0" y2={(truss.shape === 'straight' ? -6 : -truss.height / 2) - 20} stroke="var(--sel)" strokeWidth="1.5" pointerEvents="none" />
            <circle cx="0" cy={(truss.shape === 'straight' ? -6 : -truss.height / 2) - 20} r="7" fill="var(--text)" stroke="var(--accent)" strokeWidth="2" style={{ cursor: 'grab' }} aria-label={`Rotate ${truss.name}`} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); const start = pointAt(event); if (!start) return; trussDragRef.current = { mode: 'rotate', start, original: truss, current: truss }; svgRef.current?.setPointerCapture(event.pointerId) }}><title>Drag to rotate (Shift: snap 45°)</title></circle>
          </>}
          {editing && <text x="0" y="-10" transform={`rotate(${-truss.rotation} 0 -10)`} textAnchor="middle" fill="var(--text)" fontSize="8">{truss.name}</text>}
        </g>})}

        <StageObjectLayer editing={editing} selectedId={selectedStageObjectId} select={(id) => { setSelectedStageObjectId(id); setSelectedPreviewTrussId(null); selectFixtures([]) }} />
        {/* Beams — one icon per Count instance (Guide p.30), each with
            its own stored position and draggable on its own. Dragging
            one instance moves only it, plus the icons of any other
            selected fixtures (which move as a group by the same delta);
            the dragged fixture's other instances stay put. */}
        {fixtureViews.map((f) => {
          const x = f.pos.x
          const y = f.pos.y
          const on = f.intensity > 0
          const op = Math.min(f.intensity / 255, 1)
          // Truss fixtures aim down at the deck; floor fixtures aim up.
          const appearance = previewBeamAppearance(f, f.pos, f.color)
          const top = y + 4
          const bottom = y + 150
          const selectable = fixtures.length > 0
          const selected = selectable && selectedFixtureIds.includes(f.id)
          return (
            <g
              key={f.key}
              data-context-menu="fixture"
              role={selectable ? 'button' : undefined}
              tabIndex={selectable ? 0 : undefined}
              aria-label={selectable ? f.name : undefined}
              aria-pressed={selectable ? selected : undefined}
              className={newFixtureIds.includes(f.id) ? 'fixture-appear' : undefined}
              style={selectable ? { cursor: editing ? 'grab' : 'pointer', touchAction: 'none' } : undefined}
              onPointerDown={selectable && editing ? (event) => { event.preventDefault(); event.stopPropagation(); if (event.shiftKey) { selectFixtures(selectedFixtureIds.includes(f.id) ? selectedFixtureIds.filter((id) => id !== f.id) : [...selectedFixtureIds, f.id]); return } const ids = selectedFixtureIds.includes(f.id) ? selectedFixtureIds : [f.id]; if (!selectedFixtureIds.includes(f.id)) selectFixtures(ids); const position = pointAt(event); if (position) { const originals = Object.fromEntries(fixtureViews.filter((view) => view.key === f.key || (ids.includes(view.id) && view.id !== f.id)).map((view) => [view.key, view.pos])); dragRef.current = { start: position, originals, positions: originals, fixtureIds: ids }; setDragPositions(originals); svgRef.current?.setPointerCapture(event.pointerId) } } : undefined}
              // Right-click selects the fixture first, so the fixture
              // shortcut menu (Highlight…) acts on the fixture that was
              // clicked, not on whatever was selected before.
              onContextMenu={selectable ? () => { if (!selectedFixtureIds.includes(f.id)) selectFixtures([f.id]) } : undefined}
              onClick={
                selectable
                  ? (event) => {
                      event.stopPropagation()
                      if (!editing) selectFixture(f.id, event.shiftKey)
                    }
                  : undefined
              }
              onKeyDown={
                selectable
                  ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      selectFixture(f.id, event.shiftKey)
                    }
                  : undefined
              }
            >
              {on && !f.hideBeam && (
                <polygon
                  pointerEvents="none"
                  points={`${x - 7},${top} ${x + 7},${top} ${x + 34},${bottom} ${x - 34},${bottom}`}
                  transform={`rotate(${appearance.direction} ${x} ${y})`}
                  fill={appearance.color}
                  fillOpacity={op * 0.28}
                  stroke={appearance.color}
                  strokeOpacity={op * 0.45}
                  strokeWidth="1"
                />
              )}
              {selectable && f.namePosition !== 'hidden' && <text x={x} y={f.namePosition === 'below' ? y + 20 : y - 13} textAnchor="middle" fill="var(--text)" fontSize="8" paintOrder="stroke" stroke="var(--bg)" strokeWidth="2">{f.shortName ?? f.name}</text>}
              {isCalibrationComplete(f) && <text x={x} y={f.namePosition === 'below' ? (setupWizardStep === 'directions' ? y + 48 : y + 32) : (setupWizardStep === 'directions' ? y + 36 : y + 20)} textAnchor="middle" fill="#22c55e" fontSize="10" fontWeight="700" paintOrder="stroke" stroke="var(--bg)" strokeWidth="2" pointerEvents="none"><title>Beam direction calibrated</title>✓</text>}
              {/* Wizard Light Beam Directions step (Piece 5, video 07:05):
                  every fixture gets a yellow Set… button below its icon;
                  clicking it opens the Piece 4 calibration dialog for that
                  fixture. A calibrated fixture's checkmark moves below the
                  button. */}
              {setupWizardStep === 'directions' && selectable && (() => { const setY = f.namePosition === 'below' ? y + 32 : y + 20; return (
                <g role="button" aria-label={`Set beam direction for ${f.name}`} style={{ cursor: 'pointer' }} onClick={(event) => { event.stopPropagation(); selectFixtures([f.id]); window.dispatchEvent(new Event('openlights-open-calibration')) }}>
                  <rect x={x - 22} y={setY - 10} width="44" height="13" rx="6" fill="#eab308" />
                  <text x={x} y={setY} textAnchor="middle" fontSize="8" fontWeight="700" fill="#000000">Set…</text>
                </g>
              ) })()}
              {fanDefined?.get(f.id) && <circle cx={x - 12} cy={y - 12} r="3" fill="#3b82f6" stroke="var(--bg)" strokeWidth="1" pointerEvents="none"><title>Defined fan value</title></circle>}
              <g transform={`translate(${x} ${y}) rotate(${f.rotation ?? 0}) scale(${(f.iconSize ?? 10) / 10}) translate(${-x} ${-y})`}>
              <line x1={x} y1={y} x2={x} y2={y - 8} stroke="var(--text)" strokeWidth="1.5" />
              {selected && (
                <circle
                  cx={x}
                  cy={y}
                  r="9"
                  fill="var(--accent)"
                  fillOpacity="0.22"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r="5"
                fill={on ? f.color : 'var(--panel2)'}
                stroke={selected ? 'var(--accent)' : 'var(--line)'}
                strokeWidth={selected ? '2' : '1.5'}
              />
              </g>
              <circle
                cx={x}
                cy={y}
                r="16"
                fill="transparent"
                pointerEvents="all"
                aria-hidden="true"
              />
              {fixtureBeams(f).map((beam, index) => <rect key={beam.id} x={x + (index - 1.5) * 9 - 3} y={y - 4} width="7" height="8" fill={useShowStore.getState().selectedBeams.some((b) => b.fixtureId === f.id && b.beamId === beam.id) ? 'var(--accent)' : f.color} stroke="var(--text)" role="button" tabIndex={0} aria-label={`${f.name} ${beam.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); useShowStore.getState().selectFixtureBeam(f.id, beam.id, event.shiftKey) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); useShowStore.getState().selectFixtureBeam(f.id, beam.id, event.shiftKey) } }} />)}
              {editing && selected && f.instance === 0 && (['resize', 'rotate'] as const).map((mode) => <rect key={mode} x={x + (mode === 'resize' ? 12 : -4)} y={y + (mode === 'resize' ? 8 : -28)} width="8" height="8" fill="var(--text)" stroke="var(--accent)" style={{ cursor: mode === 'resize' ? 'nwse-resize' : 'grab' }} aria-label={`${mode} ${f.name}`} onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); const start = pointAt(event); if (!start) return; useShowStore.getState().beginHistoryGroup(); fixtureHandleRef.current = { fixture: f, mode, centre: { x, y }, start }; svgRef.current?.setPointerCapture(event.pointerId) }} />)}
            </g>
          )
        })}

        {marquee && <rect x={Math.min(marquee.start.x, marquee.current.x)} y={Math.min(marquee.start.y, marquee.current.y)} width={Math.abs(marquee.current.x - marquee.start.x)} height={Math.abs(marquee.current.y - marquee.start.y)} fill="var(--sel)" fillOpacity="0.12" stroke="var(--sel)" strokeWidth="1" pointerEvents="none" />}
      </svg>
    </div>
  )
}

