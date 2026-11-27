import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { FadeCurve, FrameConfig, LiveControl, LiveObjectKind, LiveObjectStyle, LivePage } from '@shared/types'
import { clampModifier, clampLiveSize, snapCanvasValue, canvasSizeFor, DEFAULT_OBJECT_STYLES, frameConfigFor, LIVE_CUE_SIZE, LIVE_CUE_STEP, LIVE_LIST_SIZE, type LiveCanvasBounds } from '@shared/liveObjectDefaults'
import { isLiveWindow } from '../lib/liveWindowBridge'
import {
  decodeLiveDrop, dropLabel, LIVE_DROP_MIME, LEGACY_PRESET_MIME, type LiveDropPayload
} from '../lib/liveDrops'
import { formatTimingMs, parseTimingMs } from '../lib/liveTiming'
import { liveButtonBackground, liveButtonTextColor, liveControlButtonColor, DEFAULT_BUTTON_APPEARANCE_COLOR } from '../lib/liveButtonColor'
import { sequenceStepValues } from '../lib/sequenceClock'
import { frameForCue } from '../lib/liveFrames'
import { alignmentGuides, alignEdgeX, alignEdgeY } from '../lib/alignmentGuides'
import { useClampedMenuPosition } from '../lib/menuPosition'
import {
  isClipboardEmpty, newAnnotationObject, newCueObject, newWidgetObject, objectLabel, objectSize, positionedObjects,
  type PageObjectRef, type Rect
} from '../lib/livePageObjects'
import { useShowStore } from '../stores/showStore'
import { inspectorFields, type InspectorTarget } from '../lib/liveInspector'
import { editAdHocTarget } from '../lib/liveOverrideTargets'
import { CueListEditor } from './CueListEditor'
import { CueButtonMenu } from './CueButtonMenu'
import { XfadeSlider } from './XfadeSlider'

type Selection = PageObjectRef
const position = (index: number) => ({ x: 20 + (index % 4) * 180, y: 20 + Math.floor(index / 4) * 90 })
// New cue buttons land on the LightKey grid (LIVE_CUE_STEP): 130x50 pitch
// for the 120x40 buttons, so a row of fresh buttons sits with ~10px gaps
// the way LightKey's do. Cue-list widgets keep position() — at 240x150
// they need the wider pitch.
const cuePosition = (index: number) => ({ x: 20 + (index % 4) * LIVE_CUE_STEP.x, y: 20 + Math.floor(index / 4) * LIVE_CUE_STEP.y })
// Canvas object space (Jake, 25 Nov 2026): infinitely scrollable —
// there is no maximum. Positions snap to the 10px grid and never go
// below 0, but a point past the old 900x520 edge is kept as-is and the
// canvas grows to fit it (see canvasSizeFor), instead of being
// clamped back the way the old fixed 740/440 bounds did.
const snapCanvasPoint = (x: number, y: number) => ({
  x: snapCanvasValue(x),
  y: snapCanvasValue(y)
})

// LightKey button types (Guide ch.11, "Button", p.199): the model has three
// cue kinds, labelled the LightKey way. Push Button is the momentary
// (hold-to-flash) kind; Toggle latches; Fader is a level control.
const BUTTON_TYPE_LABELS: Record<LiveControl['type'], string> = {
  toggle: 'Toggle Button',
  flash: 'Push Button',
  fader: 'Fader'
}

// The eight resize handles (Video 2): four corners + four edge
// midpoints. The handle names the edges that move; the opposite edges
// stay put.
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/**
 * A fade time shown the LightKey way — mm:ss.t (e.g. 500ms is "00:00.5").
 * The text is committed on blur / Enter; an unparsable value restores the
 * stored time instead of inventing one.
 */
function TimingInput({ label, ms, onCommit }: { label: string; ms: number; onCommit: (ms: number) => void }) {
  const [text, setText] = useState(formatTimingMs(ms))
  useEffect(() => { setText(formatTimingMs(ms)) }, [ms])
  const commit = () => {
    const parsed = parseTimingMs(text)
    if (parsed !== null) onCommit(parsed)
    else setText(formatTimingMs(ms))
  }
  return <label className="text-dim">{label}<input aria-label={label} value={text} onChange={(event) => setText(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); else if (event.key === 'Escape') setText(formatTimingMs(ms)) }} className="ml-1 w-20 rounded bg-bg p-1" /></label>
}

export function LiveWorkspace({ masterOverlay = false, toolbarHost = null }: { masterOverlay?: boolean; toolbarHost?: HTMLElement | null } = {}) {
  const {
    locked, show, cues, presets, effects, activePresetIds, cueLists, setLivePages, selectLivePage, activeLivePageId,
    activeLiveValues, setLiveValue, manualOverrides, clearManualOverrides, activeCueListId,
    activeCueIndex, cuePlaying, goToCue, cueNext, cuePrev, stopCue, addCueList, addCueToList, liveEditing, setLiveEditing,
    editCueContents, editCueDefContents, promoteAdHocToPreset, setContentsPreview, setPaletteReveal,
    configureFramePrevNext, startEditingPreset, startEditingLiveEffect, stepLiveFrame,
    configureCueTiming, configureCueAppearance, configureCueModifiers,
    configureCuePriority, configureCueFrameStep, addOverridesToCues, startEditingCueAdHoc,
    selectedPageObjects, pageClipboard, setPageObjectSelection, togglePageObjectSelection,
    selectPageObjectsInRect, clearPageObjectSelection, moveSelectedPageObjects, deleteSelectedPageObjects,
    duplicateSelectedPageObjects, copySelectedPageObjects, pastePageObjects, resizePageObject, resizePageObjectTo, renamePageObject,
    attachPageObject, setPageObjectStyle, configureFrame, dropOnLivePage, liveAlignmentOff, setLiveAlignmentOff
  } = useShowStore()
  // Live Edit mode is store UI state (not show data, not undo history), so
  // the Shortcuts panel in App.tsx can show the LightKey edit shortcuts
  // while Edit is open. Firing is unaffected by the flag: cues fire the
  // same in Live and in Edit (see cueBody).
  const editing = liveEditing
  const [draft, setDraft] = useState<{ id: string; x: number; y: number } | null>(null)
  const drag = useRef<{ ref: Selection; startX: number; startY: number; x: number; y: number; scrollLeft0?: number; scrollTop0?: number } | null>(null)
  // Drag-anywhere (Jake, 22 Nov 2026): the whole button is the drag handle —
  // there is no drag bar any more. A press only arms a drag; the move
  // starts once the pointer has travelled past DRAG_THRESHOLD, so a plain
  // click/tap still fires the button. A drag that did move swallows the
  // click that follows its pointerup (see onControlClickCapture).
  const DRAG_THRESHOLD = 4
  const armedDrag = useRef<{ ref: Selection; startX: number; startY: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null)
  const marquee = useRef<{ startX: number; startY: number } | null>(null)
  const resize = useRef<{ ref: PageObjectRef; handle: ResizeHandle; startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null)
  const [resizeDraft, setResizeDraft] = useState<{ id: string; x: number; y: number; width: number; height: number } | null>(null)
  // Yellow alignment guides (Video 2): while a button is moved or
  // resized in Edit Mode, its edges snap to neighbours' edges and thin
  // yellow lines extend from the aligned edges.
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] })
  // The (+) flow (Video 2): the new button starts dashed with a name
  // input — "Enter a cue name and press Return" — instead of a
  // pre-named button. Return commits the typed name (or keeps the
  // default when empty); Escape keeps the default.
  const [namingControlId, setNamingControlId] = useState<string | null>(null)
  // Double-click properties popup (LightKey, Jake 18 Nov 2026): a small panel
  // that slides in from the right over the canvas. It opens only on
  // double-click; single-click only selects (move/resize). The popup itself
  // scrolls (overflow-y-auto) while the canvas behind it does not, so the
  // button stays visible while its properties are edited. Once open it
  // follows the single selection; close with X, Esc or Done.
  const [popupOpen, setPopupOpen] = useState(false)
  const pageCanvas = useRef<HTMLDivElement>(null)
  const canvasViewportRef = useRef<HTMLDivElement>(null)
  // Visible canvas size in page pixels (Jake, 25 Nov 2026): the scroll
  // viewport is measured live, content-box only (the Master overlay's
  // left inset is padding, not canvas), so the canvas is at least as
  // big as the monitor showing it. 0 until the first measure — the
  // canvas then falls back to the classic 900x520, exactly as before.
  const [viewportSize, setViewportSize] = useState<LiveCanvasBounds>({ width: 0, height: 0 })
  useEffect(() => {
    const el = canvasViewportRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const style = getComputedStyle(el)
      setViewportSize({
        width: Math.max(0,
          el.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')),
        height: Math.max(0,
          el.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0'))
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // Auto-scroll while dragging near the viewport edge (Jake, 25 Nov
  // 2026): the canvas is infinitely scrollable, so a drag that runs
  // past the visible edge scrolls the viewport along with the pointer
  // instead of stopping at the edge. The drag math in moveDrag counts
  // the scroll offset (scrollLeft0/scrollTop0) so the dragged button
  // stays glued to the pointer while the canvas slides underneath it.
  const autoScrollViewport = (clientX: number, clientY: number) => {
    const el = canvasViewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // No laid-out viewport (jsdom, or before first paint): there is
    // nothing visible to scroll, and a zero rect would read every
    // pointer as past the edge.
    if (rect.width <= 0 || rect.height <= 0) return
    const MARGIN = 48, STEP = 24
    if (clientX > rect.right - MARGIN) el.scrollLeft += STEP
    else if (clientX < rect.left + MARGIN) el.scrollLeft -= STEP
    if (clientY > rect.bottom - MARGIN) el.scrollTop += STEP
    else if (clientY < rect.top + MARGIN) el.scrollTop -= STEP
  }
  // LightKey-style context menu (Guide ch.11, p.176): right-click on the
  // canvas or a button in Edit mode. Each item wires to the existing store
  // actions the old bottom-strip buttons used.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; at: { x: number; y: number }; alt: boolean } | null>(null)
  // Right-click ON a button shows LightKey's button menu (Video 1)
  // instead of the canvas menu — see CueButtonMenu. The canvas menu
  // stays for right-clicks on empty canvas.
  const [buttonMenu, setButtonMenu] = useState<{ controlId: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Jake, 26 Nov 2026 — the canvas menu used to open at the raw click
  // point and run off the window near the bottom/right edge; it is
  // clamped into the viewport once mounted (see lib/menuPosition).
  const menuPos = useClampedMenuPosition(buttonMenu?.x ?? contextMenu?.x ?? 0, buttonMenu?.y ?? contextMenu?.y ?? 0, menuRef)
  useEffect(() => {
    if (!contextMenu && !buttonMenu) return
    const close = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setContextMenu(null); setButtonMenu(null) }
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [contextMenu, buttonMenu])

  // Edit Ad Hoc Properties for a standalone button (Guide ch.11, p.201)
  // opens its properties popup, where the captured ad-hoc values live.
  // The shortcut-menu path works from the plain Live view — the guide's
  // first route is "Control-click a button in the Live view … and choose
  // Edit Ad Hoc Properties", with no edit-mode qualifier (the edit-mode
  // route is the second one, via the Live menu). So this must NOT require
  // liveEditing: gating it here was why the item silently did nothing in
  // Live mode (Jake, 27 Nov 2026).
  useEffect(() => {
    const open = () => {
      const state = useShowStore.getState()
      if (state.locked) return
      const ref = state.selectedPageObjects[0]
      if (!ref || ref.type !== 'cue') return
      const control = state.show?.livePages?.flatMap((p) => p.controls).find((c) => c.id === ref.id)
      if (control && !control.cueId) setPopupOpen(true)
    }
    window.addEventListener('openlights-open-live-properties', open)
    return () => window.removeEventListener('openlights-open-live-properties', open)
  }, [])

  // Get Info / Show Properties (Video 1) opens the contents inspector
  // for the selected button — cue buttons included — without switching
  // to Design. Edit Ad Hoc Properties on a cue button is the one that
  // switches to Design (startEditingCueAdHoc, via App). The tab picks
  // which inspector tab opens: Contents for Get Info, Button for the
  // Color > Custom… submenu.
  useEffect(() => {
    const open = (event: Event) => {
      const state = useShowStore.getState()
      if (state.locked) return
      const detail = (event as CustomEvent<{ controlId?: string; tab?: 'contents' | 'options' | 'button' }>).detail
      const ref = detail?.controlId ? { type: 'cue' as const, id: detail.controlId } : state.selectedPageObjects[0]
      if (!ref || ref.type !== 'cue') return
      state.setPageObjectSelection([ref])
      setInspectorTab(detail?.tab ?? 'contents')
      setPopupOpen(true)
    }
    window.addEventListener('openlights-open-cue-info', open)
    return () => window.removeEventListener('openlights-open-cue-info', open)
  }, [])

  // Rename (Video 1) opens the name input on the button — the same
  // dashed-button input as the (+) flow. Renaming is an edit action,
  // so it enters Edit Mode when called from the plain Live view.
  useEffect(() => {
    const open = (event: Event) => {
      const state = useShowStore.getState()
      if (state.locked) return
      const detail = (event as CustomEvent<{ controlId?: string }>).detail
      const ref = detail?.controlId ? { type: 'cue' as const, id: detail.controlId } : state.selectedPageObjects[0]
      if (!ref || ref.type !== 'cue') return
      state.setLiveEditing(true)
      state.setPageObjectSelection([ref])
      setNamingControlId(ref.id)
    }
    window.addEventListener('openlights-rename-live-control', open)
    return () => window.removeEventListener('openlights-rename-live-control', open)
  }, [])

  // The inspector follows a single selection; multiple selected objects are
  // handled entirely by the store's multi-object commands.
  const selection: Selection | null = selectedPageObjects.length === 1 ? selectedPageObjects[0] : null
  const isSelected = (ref: Selection) => selectedPageObjects.some((item) => item.type === ref.type && item.id === ref.id)

  // Selection follows interaction in both Live and Live Edit: pressing a cue
  // or cue list selects it, so the inspector follows it when Edit is open.
  const selectRef = (ref: Selection) => { if (!isSelected(ref)) setPageObjectSelection([ref]) }

  const openPropertiesPopup = (ref: Selection) => {
    if (!editing || locked) return
    setPageObjectSelection([ref])
    setPopupOpen(true)
  }

  // Cue contents (Jake, 27 Nov 2026 — LightKey cue editing, Videos 1+2):
  // a button's Get Info list shows what the cue is made of — its presets
  // and sequences (by reference, so a preset edit reaches every cue that
  // uses it) plus its ad-hoc values — followed by the button's own
  // presets / sequences / effects / ad-hoc values. Each row knows its
  // source, so removing it edits the right place.
  type ContentRow = {
    key: string
    kind: 'preset' | 'sequence' | 'effect' | 'ad-hoc'
    id: string
    name: string
    source: 'cue' | 'control'
    values: Record<string, Record<string, number>>
  }
  const [inspectorTab, setInspectorTab] = useState<'contents' | 'options' | 'button'>('contents')
  const [selectedContentKey, setSelectedContentKey] = useState<string | null>(null)
  const [contentsMenu, setContentsMenu] = useState<{ x: number; y: number; row: ContentRow } | null>(null)
  const contentsMenuRef = useRef<HTMLDivElement>(null)
  const sequenceContentsValues = (sequenceId: string): Record<string, Record<string, number>> => {
    const sequence = show?.sequences?.find((s) => s.id === sequenceId)
    if (!sequence) return {}
    const values: Record<string, Record<string, number>> = {}
    for (const step of sequence.steps) {
      for (const [fixtureId, patch] of Object.entries(sequenceStepValues(step, presets, show?.fixtures ?? []))) {
        values[fixtureId] = { ...values[fixtureId], ...patch }
      }
    }
    return values
  }
  const contentsRows = (control: LiveControl): ContentRow[] => {
    const rows: ContentRow[] = []
    const cue = control.cueId ? cues.find((c) => c.id === control.cueId) : undefined
    if (cue) {
      for (const id of cue.presetIds ?? []) {
        const preset = presets.find((p) => p.id === id)
        if (preset) rows.push({ key: `cue:preset:${id}`, kind: 'preset', id, name: preset.name, source: 'cue', values: preset.fixtureValues ?? {} })
      }
      for (const id of cue.sequenceIds ?? []) {
        const sequence = show?.sequences?.find((s) => s.id === id)
        if (sequence) rows.push({ key: `cue:sequence:${id}`, kind: 'sequence', id, name: sequence.name, source: 'cue', values: sequenceContentsValues(id) })
      }
      if (Object.keys(cue.fixtureValues ?? {}).length) rows.push({ key: 'cue:ad-hoc', kind: 'ad-hoc', id: `cue:${cue.id}`, name: 'Ad hoc properties', source: 'cue', values: cue.fixtureValues ?? {} })
    }
    for (const id of control.presetIds ?? []) {
      const preset = presets.find((p) => p.id === id)
      if (preset) rows.push({ key: `control:preset:${id}`, kind: 'preset', id, name: preset.name, source: 'control', values: preset.fixtureValues ?? {} })
    }
    for (const id of control.sequenceIds ?? []) {
      const sequence = show?.sequences?.find((s) => s.id === id)
      if (sequence) rows.push({ key: `control:sequence:${id}`, kind: 'sequence', id, name: sequence.name, source: 'control', values: sequenceContentsValues(id) })
    }
    for (const id of control.effectIds ?? []) {
      const effect = effects.find((e) => e.id === id)
      if (effect) rows.push({ key: `control:effect:${id}`, kind: 'effect', id, name: effect.name, source: 'control', values: {} })
    }
    if (Object.keys(control.adHocValues ?? {}).length) rows.push({ key: 'control:ad-hoc', kind: 'ad-hoc', id: `control:${control.id}`, name: 'Ad hoc properties', source: 'control', values: control.adHocValues ?? {} })
    return rows
  }
  const clearContentSelection = () => { setSelectedContentKey(null); setContentsPreview(null) }
  // The inspector follows a single selection; a new selection clears the
  // contents highlight (the palette and the Preview follow the row).
  const selectedObjectId = selectedPageObjects[0]?.id
  useEffect(() => { clearContentSelection() }, [selectedObjectId])
  const selectContentRow = (row: ContentRow) => {
    setSelectedContentKey(row.key)
    setContentsPreview({ kind: row.kind, id: row.id, values: row.values })
  }
  const removeContentRow = (control: LiveControl, row: ContentRow) => {
    if (row.kind === 'ad-hoc') {
      if (row.source === 'cue' && control.cueId) editCueDefContents(control.cueId, { type: 'clear-ad-hoc' })
      else editCueContents(control.id, { type: 'clear-ad-hoc' })
    } else if (row.kind === 'effect') {
      patchControl(control.id, { effectIds: (control.effectIds ?? []).filter((id) => id !== row.id) })
    } else if (row.source === 'cue' && control.cueId) {
      editCueDefContents(control.cueId, { type: row.kind === 'preset' ? 'remove-preset' : 'remove-sequence', id: row.id })
    } else {
      editCueContents(control.id, { type: row.kind === 'preset' ? 'remove-preset' : 'remove-sequence', id: row.id })
    }
    if (selectedContentKey === row.key) clearContentSelection()
  }
  const dropOnContents = (event: React.DragEvent, control: LiveControl) => {
    if (!editing) return
    const payload = readDrop(event)
    if (!payload) return
    event.preventDefault(); event.stopPropagation()
    // Presets / sequences join the cue when the button carries one (the
    // store routes a 'cue' drop to the cue), else the button's own lists.
    // Effects cannot join a cue — on a standalone button they join its
    // effect list instead, so they are stripped from the drop payload.
    if (payload.effectIds.length && !control.cueId) {
      patchControl(control.id, { effectIds: [...new Set([...(control.effectIds ?? []), ...payload.effectIds])] })
    }
    dropOnLivePage({ ...payload, effectIds: [] }, { kind: 'cue', cueId: control.id })
  }
  useEffect(() => {
    if (!contentsMenu) return
    const close = (event: PointerEvent) => {
      if (contentsMenuRef.current && !contentsMenuRef.current.contains(event.target as Node)) setContentsMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [contentsMenu])

  const beginResize = (event: React.PointerEvent, ref: PageObjectRef, x: number, y: number, width: number, height: number, handle: ResizeHandle) => {
    if (!editing || locked || event.button !== 0) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    resize.current = { ref, handle, startX: event.clientX, startY: event.clientY, x, y, width, height }
    setPageObjectSelection([ref])
  }
  const moveResize = (event: React.PointerEvent) => {
    if (!resize.current) return
    const r = resize.current
    const dx = event.clientX - r.startX, dy = event.clientY - r.startY
    // The opposite edges stay put: a west/north handle moves the origin
    // as it shrinks the object; east/south handles only grow the size.
    let x = r.x, y = r.y
    let width = r.width, height = r.height
    if (r.handle.includes('e')) width = r.width + dx
    if (r.handle.includes('s')) height = r.height + dy
    if (r.handle.includes('w')) { width = r.width - dx; x = r.x + dx }
    if (r.handle.includes('n')) { height = r.height - dy; y = r.y + dy }
    // Clamp first (clampLiveSize snaps to the 10px grid), then re-anchor
    // the origin to the clamped size so the opposite edge does not drift.
    width = clampLiveSize(width); height = clampLiveSize(height)
    if (r.handle.includes('w')) x = r.x + (r.width - width)
    if (r.handle.includes('n')) y = r.y + (r.height - height)
    x = Math.max(0, snapCanvasValue(x)); y = Math.max(0, snapCanvasValue(y))
    const draft = { id: r.ref.id, x, y, width, height }
    // Edge guides while resizing: snap the edge being dragged to a
    // neighbour's edge (the far edge for east/south, the origin for
    // west/north — the opposite edge stays put in both cases).
    const vertical: number[] = []
    const horizontal: number[] = []
    if (page && !liveAlignmentOff) {
      if (r.handle.includes('e')) {
        const edge = alignEdgeX(page, r.ref.id, draft.x + draft.width)
        if (edge !== null) { draft.width = clampLiveSize(edge - draft.x); vertical.push(edge) }
      }
      if (r.handle.includes('w')) {
        const edge = alignEdgeX(page, r.ref.id, draft.x)
        if (edge !== null) { draft.width = clampLiveSize(r.x + r.width - edge); draft.x = edge; vertical.push(edge) }
      }
      if (r.handle.includes('s')) {
        const edge = alignEdgeY(page, r.ref.id, draft.y + draft.height)
        if (edge !== null) { draft.height = clampLiveSize(edge - draft.y); horizontal.push(edge) }
      }
      if (r.handle.includes('n')) {
        const edge = alignEdgeY(page, r.ref.id, draft.y)
        if (edge !== null) { draft.height = clampLiveSize(r.y + r.height - edge); draft.y = edge; horizontal.push(edge) }
      }
    }
    setGuides({ vertical, horizontal })
    setResizeDraft(draft)
  }
  const endResize = () => {
    const r = resize.current
    if (r && resizeDraft) resizePageObjectTo(r.ref, resizeDraft.x, resizeDraft.y, resizeDraft.width, resizeDraft.height)
    resize.current = null; setResizeDraft(null); setGuides({ vertical: [], horizontal: [] })
  }

  // Eight resize handles (Video 2): a selected button in Edit Mode gets
  // a yellow outline with small circular handles at its four corners
  // and four edge midpoints. Dragging a handle resizes from the
  // opposite edge; the top/left handles move the button as they shrink
  // it. The old single bottom-right handle is gone.
  const resizeHandle = (ref: PageObjectRef, x: number, y: number, width: number, height: number) => {
    if (!editing || locked || !isSelected(ref)) return null
    const handles: { handle: ResizeHandle; left: number; top: number; cursor: string }[] = [
      { handle: 'nw', left: 0, top: 0, cursor: 'nwse-resize' },
      { handle: 'n', left: width / 2, top: 0, cursor: 'ns-resize' },
      { handle: 'ne', left: width, top: 0, cursor: 'nesw-resize' },
      { handle: 'e', left: width, top: height / 2, cursor: 'ew-resize' },
      { handle: 'se', left: width, top: height, cursor: 'nwse-resize' },
      { handle: 's', left: width / 2, top: height, cursor: 'ns-resize' },
      { handle: 'sw', left: 0, top: height, cursor: 'nesw-resize' },
      { handle: 'w', left: 0, top: height / 2, cursor: 'ew-resize' },
    ]
    // The handles sit fully inside the object's box (centred on its
    // edges/corners, clamped 8px in): the control div has
    // overflow:hidden, so a handle centred exactly on the corner would
    // have its centre outside the box and never receive pointer events
    // (found by the real-app probe, 27 Nov 2026).
    return <>{handles.map(({ handle, left, top, cursor }) => (
      <div key={handle} role="button" aria-label={`Resize ${handle}`} className="absolute h-2 w-2 rounded-full border border-yellow-600 bg-yellow-400" style={{ left: Math.min(Math.max(0, left - 4), width - 8), top: Math.min(Math.max(0, top - 4), height - 8), cursor, pointerEvents: 'auto' }} onPointerDown={(e) => beginResize(e, ref, x, y, width, height, handle)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={() => { resize.current = null; setResizeDraft(null) }} />
    ))}</>
  }

  // The cue activation control is identical in Live and Live Edit: one code
  // path renders the toggle / flash / fader body, so a cue fires, flashes,
  // fades and shows its lit state the same way in both modes. In Edit mode
  // the whole button is the drag handle (drag-anywhere, Jake 22 Nov 2026):
  // a press arms a drag and only movement past the threshold starts it,
  // so a click still fires; the body itself carries no drag bar. The
  // button's own background is transparent — its colour lives on the
  // outer control div (see the controls map below) — so the old `.pad`
  // active accent never paints over the light colour, and the 44px
  // min-height from `.pad` is overridden to fit the 40px button.
  const cueBody = (control: LiveControl, level: number, textColor: string) => {
    // A frame Previous/Next button (guide p.188): it steps the frame's
    // buttons in location order instead of firing a cue of its own.
    if (control.frameStep) {
      const frameId = page ? frameForCue(page, control.id) : null
      return <button type="button" aria-label={control.frameStep === 'next' ? 'Next cue in frame' : 'Previous cue in frame'} style={{ ...css(control.style), color: textColor, backgroundColor: 'transparent', minHeight: 0, fontWeight: level ? 700 : 500 }} className="pad w-full flex-1 rounded px-2 py-1" onClick={() => { if (frameId) stepLiveFrame(frameId, control.frameStep === 'next' ? 1 : -1) }}>{control.name}</button>
    }
    // Sequence speed on the button (Video 2: "Rainbow 0.5x"): a button
    // whose only contents are a single sequence with a non-1 time scale
    // prints the speed after its name.
    const sequenceSpeed = (() => {
      const cue = control.cueId ? cues.find((c) => c.id === control.cueId) : undefined
      const presetCount = [...(cue?.presetIds ?? []), ...(control.presetIds ?? [])].length
      const sequenceIds = [...(cue?.sequenceIds ?? []), ...(control.sequenceIds ?? [])]
      if (presetCount > 0 || sequenceIds.length !== 1) return null
      const scale = show?.sequences?.find((s) => s.id === sequenceIds[0])?.timeScale
      return scale && scale !== 1 ? `${scale}x` : null
    })()
    return control.type === 'fader' ? <label className="block flex-1 p-1 text-center" style={{ ...css(control.style), color: textColor }}><span>{control.effectIds?.length ? '∿ ' : ''}{control.name}</span><input aria-label={control.name} type="range" min="0" max="255" value={level} onChange={(e) => setLiveValue(control.id, Number(e.target.value))} className="w-full accent-[var(--accent)]" /><span>{Math.round(level / 255 * 100)}%</span></label> : <button type="button" aria-pressed={level > 0} style={{ ...css(control.style), color: textColor, backgroundColor: 'transparent', minHeight: 0, fontWeight: level ? 700 : 500 }} className="pad w-full flex-1 rounded px-2 py-1" onClick={control.type === 'toggle' ? () => setLiveValue(control.id, level ? 0 : 255) : undefined} onPointerDown={control.type === 'flash' ? (e) => { if (!editing) e.currentTarget.setPointerCapture(e.pointerId); setLiveValue(control.id, 255) } : undefined} onPointerUp={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onPointerCancel={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onKeyDown={control.type === 'flash' ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setLiveValue(control.id, 255) } } : undefined} onKeyUp={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onBlur={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined}>{control.effectIds?.length ? '∿ ' : ''}{control.name}{sequenceSpeed ? ` ${sequenceSpeed}` : ''}{control.type === 'flash' && ' (hold)'}</button>
  }

  const attachmentSelect = (ref: PageObjectRef, current: string | undefined) =>
    <label className="text-dim">Attached to
      <select aria-label={`Attach ${ref.type} ${ref.id}`} value={current ?? ''} onChange={(e) => attachPageObject(ref, e.target.value || null)} className="block rounded bg-bg p-1">
        <option value="">None</option>
        {(page ? positionedObjects(page) : []).filter((o) => o.id !== ref.id).map((o) => <option key={`${o.type}:${o.id}`} value={o.id}>{objectLabel(page!, o)}</option>)}
      </select>
    </label>

  const css = (style: LiveObjectStyle | undefined): CSSProperties => ({
    fontSize: style?.fontSize,
    fontWeight: style?.bold ? 700 : undefined,
    fontStyle: style?.italic ? 'italic' : undefined,
    color: style?.color,
    textAlign: style?.align
  })

  const styleFields = (ref: PageObjectRef, kind: LiveObjectKind, style: LiveObjectStyle | undefined) => {
    const current = { ...DEFAULT_OBJECT_STYLES[kind], ...style }
    return <div className="flex flex-wrap items-end gap-2 rounded border border-line bg-bg/40 p-1">
      <label className="text-dim">Size<input aria-label={`${kind} font size`} type="number" min={6} max={96} value={current.fontSize ?? 12} onChange={(e) => setPageObjectStyle(ref, { fontSize: Math.max(6, Math.min(96, Number(e.target.value))) })} className="block w-16 rounded bg-bg p-1" /></label>
      <label className="text-dim">Color<input aria-label={`${kind} color`} type="color" value={current.color ?? '#e5e7eb'} onChange={(e) => setPageObjectStyle(ref, { color: e.target.value })} className="block h-7 w-10 rounded bg-bg p-1" /></label>
      <label className="text-dim">Align<select aria-label={`${kind} align`} value={current.align ?? 'left'} onChange={(e) => setPageObjectStyle(ref, { align: e.target.value as LiveObjectStyle['align'] })} className="block rounded bg-bg p-1"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label className="flex items-center gap-1 text-dim"><input type="checkbox" aria-label={`${kind} bold`} checked={current.bold === true} onChange={(e) => setPageObjectStyle(ref, { bold: e.target.checked })} />Bold</label>
      <label className="flex items-center gap-1 text-dim"><input type="checkbox" aria-label={`${kind} italic`} checked={current.italic === true} onChange={(e) => setPageObjectStyle(ref, { italic: e.target.checked })} />Italic</label>
    </div>
  }

  const frameConfigFields = (frameId: string, config: FrameConfig | undefined) => {
    const current = frameConfigFor(config)
    const update = (patch: Partial<FrameConfig>) => configureFrame(frameId, patch)
    // The frame's Previous/Next buttons (guide p.188: "In the
    // inspector, select 'Previous cue' or 'Next cue'"; Video 2's frame
    // popover has a "Show Previous/Next buttons" checkbox, which is
    // the 'both' value here). The current value is read back from the
    // frameStep buttons already on the page, so their position survives
    // re-selecting the same mode (configureFramePrevNext keeps them).
    const stepButtons = page ? page.controls.filter((c) => c.frameStep && frameForCue(page, c.id) === frameId) : []
    const prevNextMode = stepButtons.some((c) => c.frameStep === 'previous') && stepButtons.some((c) => c.frameStep === 'next') ? 'both' : stepButtons.some((c) => c.frameStep === 'previous') ? 'previous' : stepButtons.some((c) => c.frameStep === 'next') ? 'next' : 'none'
    return <div className="flex flex-wrap items-end gap-2 rounded border border-line bg-bg/40 p-1">
      <label className="flex items-center gap-1 text-dim"><input type="checkbox" aria-label="Frame exclusive" checked={current.exclusive} onChange={(e) => update({ exclusive: e.target.checked })} />Exclusive</label>
      <label className="text-dim">Intensity %<input aria-label="Frame intensity" type="number" min={0} max={200} step={5} value={current.intensity} onChange={(e) => update({ intensity: clampModifier(Number(e.target.value)) })} className="block w-20 rounded bg-bg p-1" /></label>
      <label className="text-dim">Speed %<input aria-label="Frame speed" type="number" min={0} max={200} step={5} value={current.speed} onChange={(e) => update({ speed: clampModifier(Number(e.target.value)) })} className="block w-20 rounded bg-bg p-1" /></label>
      <label className="text-dim">Previous/Next buttons<select aria-label="Frame Previous/Next buttons" value={prevNextMode} onChange={(e) => configureFramePrevNext(frameId, e.target.value as 'none' | 'previous' | 'next' | 'both')} className="block rounded bg-bg p-1"><option value="none">None</option><option value="previous">Previous cue</option><option value="next">Next cue</option><option value="both">Previous and Next</option></select></label>
    </div>
  }

  useEffect(() => () => {
    const state = useShowStore.getState()
    for (const page of state.show?.livePages ?? []) for (const control of page.controls) {
      if (control.type === 'flash' && state.activeLiveValues[control.id]) state.setLiveValue(control.id, 0)
    }
  }, [])
  const pages = show?.livePages ?? []
  const page = pages.find((item) => item.id === activeLivePageId) ?? pages[0]
  const savePage = (next: LivePage) => setLivePages(pages.map((item) => item.id === next.id ? next : item))
  const patchControl = (id: string, patch: Partial<LiveControl>) => {
    if (page) savePage({ ...page, controls: page.controls.map((item) => item.id === id ? { ...item, ...patch } : item) })
  }
  const toggleEditing = () => {
    if (editing) {
      setLiveEditing(false)
      setPopupOpen(false)
      clearPageObjectSelection()
      return
    }
    if (!page) {
      const next: LivePage = { id: crypto.randomUUID(), name: `Page ${pages.length + 1}`, controls: [] }
      setLivePages([...pages, next])
      selectLivePage(next.id)
    }
    setLiveEditing(true)
    clearPageObjectSelection()
  }
  const addControl = (at?: { x: number; y: number }) => {
    if (!page) return
    const point = at ?? cuePosition(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const control = newCueObject(crypto.randomUUID(), point.x, point.y, page.defaultStyles, {
      presetIds: [...activePresetIds],
      adHocValues: Object.fromEntries(Object.entries(manualOverrides).map(([id, values]) => [id, { ...values }]))
    })
    savePage({ ...page, controls: [...page.controls, control] }); setPageObjectSelection([{ type: 'cue', id: control.id }])
    // The (+) flow (Video 2): the new button starts dashed with a name
    // input instead of a pre-named button.
    setNamingControlId(control.id)
  }
  // Cue buttons are created the LightKey way: New Button, then pick a
  // cue in the inspector — or drag a preset / sequence from the Preset
  // Palette in the right sidebar onto the canvas.
  const hasDropData = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(LIVE_DROP_MIME) || event.dataTransfer.types.includes(LEGACY_PRESET_MIME)
  const readDrop = (event: React.DragEvent): LiveDropPayload | null => {
    const encoded = event.dataTransfer.getData(LIVE_DROP_MIME)
    if (encoded) return decodeLiveDrop(encoded)
    const legacy = event.dataTransfer.getData(LEGACY_PRESET_MIME)
    return legacy ? { presetIds: [legacy], sequenceIds: [], effectIds: [] } : null
  }
  const pagePoint = (event: React.DragEvent) => {
    const rect = pageCanvas.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }
  const allowDrop = (event: React.DragEvent) => {
    if (editing && hasDropData(event)) {
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy'
      // A palette drag near the edge scrolls the viewport along, so a
      // button can be dropped past the visible edge and the canvas
      // grows to hold it (Jake, 25 Nov 2026).
      autoScrollViewport(event.clientX, event.clientY)
    }
  }
  const dropAt = (event: React.DragEvent, frameId?: string) => {
    if (!editing) return
    const payload = readDrop(event)
    if (!payload) return
    event.preventDefault(); event.stopPropagation()
    const point = pagePoint(event)
    dropOnLivePage(payload, frameId ? { kind: 'frame', frameId, ...point } : { kind: 'page', ...point }, event.ctrlKey)
  }
  const dropOnCue = (event: React.DragEvent, cueId: string) => {
    if (!editing) return
    const payload = readDrop(event)
    if (!payload) return
    event.preventDefault(); event.stopPropagation()
    dropOnLivePage(payload, { kind: 'cue', cueId })
  }
  // Dropping presets/sequences onto a cuelist widget mints a cue holding
  // them and appends it to that list (LightKey, Guide ch.11 p.192: drag
  // presets to a blank part of the cuelist and a new cue is created
  // containing them). The widget has no row list, so the step always
  // lands at the end. stopPropagation keeps the canvas drop from also
  // minting a Live button for the same drag; an NDI Ambience drop is a
  // standalone button, never a cue, so it is ignored here.
  const dropOnList = (event: React.DragEvent, listId: string | undefined) => {
    if (!editing || !listId) return
    const payload = readDrop(event)
    if (!payload || (!payload.presetIds.length && !payload.sequenceIds.length)) return
    event.preventDefault(); event.stopPropagation()
    addCueToList(listId, { presetIds: payload.presetIds, sequenceIds: payload.sequenceIds }, dropLabel(payload))
  }
  const addList = (at?: { x: number; y: number }) => {
    if (!page || !cueLists[0]) return
    const point = at ?? position(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const widget = newWidgetObject(crypto.randomUUID(), cueLists[0].id, point.x, point.y, page.defaultStyles)
    savePage({ ...page, cueListWidgets: [...(page.cueListWidgets ?? []), widget] }); setPageObjectSelection([{ type: 'list', id: widget.id }])
  }
  // There was no UI to create a cue list at all (Jake, 26 Nov 2026 —
  // Option 2): addCueList existed in the store with no callers, so
  // "Insert Cuelist" stayed disabled in a fresh project and a cuelist
  // could only arrive inside a loaded show file. "New Cue List" creates
  // the list and places its widget on the page in one go, LightKey's way
  // (Guide ch.11 p.189: a cuelist is an object placed on the page).
  const addNewList = (at?: { x: number; y: number }) => {
    if (!page) return
    const listId = addCueList()
    const point = at ?? position(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const widget = newWidgetObject(crypto.randomUUID(), listId, point.x, point.y, page.defaultStyles)
    savePage({ ...page, cueListWidgets: [...(page.cueListWidgets ?? []), widget] }); setPageObjectSelection([{ type: 'list', id: widget.id }])
  }
  const addAnnotation = (type: 'label' | 'frame', at?: { x: number; y: number }) => {
    if (!page) return
    const point = at ?? { x: 20, y: 20 }
    const item = newAnnotationObject(crypto.randomUUID(), type, point.x, point.y, page.defaultStyles)
    savePage({ ...page, annotations: [...(page.annotations ?? []), item] }); setPageObjectSelection([{ type: 'annotation', id: item.id }])
  }
  // Right-click menu (LightKey, Guide ch.11 p.176). Only in Edit mode: in
  // Live mode the global page context menu still applies. stopPropagation
  // keeps the global menu from opening on top of this one.
  const openContextMenu = (event: React.MouseEvent) => {
    if (!editing || locked) return
    event.preventDefault(); event.stopPropagation()
    // Right-click ON a button shows LightKey's button menu (Video 1);
    // the canvas menu is only for empty canvas. The button is already
    // selected: its pointerdown selects before this event fires.
    const buttonEl = (event.target as HTMLElement).closest?.('[data-project-id]')
    if (buttonEl) { setButtonMenu({ controlId: buttonEl.getAttribute('data-project-id')!, x: event.clientX, y: event.clientY }); setContextMenu(null); return }
    const rect = pageCanvas.current?.getBoundingClientRect()
    const at = snapCanvasPoint(event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0))
    setButtonMenu(null)
    setContextMenu({ x: event.clientX, y: event.clientY, at, alt: event.altKey })
  }
  const cutSelected = () => {
    copySelectedPageObjects()
    deleteSelectedPageObjects()
  }
  const beginDrag = (event: React.PointerEvent, ref: Selection, x: number, y: number) => {
    if (!editing || event.button !== 0) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    if (event.shiftKey) { togglePageObjectSelection(ref); return }
    // Keep an existing group selection so the whole group moves together.
    if (!isSelected(ref)) setPageObjectSelection([ref])
    drag.current = { ref, startX: event.clientX, startY: event.clientY, x, y }
  }
  const moveDrag = (event: React.PointerEvent) => {
    if (!drag.current) return
    const d = drag.current
    const viewport = canvasViewportRef.current
    // Baseline the scroll offset on the first move: the canvas may
    // auto-scroll under the pointer mid-drag, and the scroll delta is
    // added back below so the button stays glued to the pointer.
    if (viewport && d.scrollLeft0 === undefined) { d.scrollLeft0 = viewport.scrollLeft; d.scrollTop0 = viewport.scrollTop }
    const scrollDx = viewport ? viewport.scrollLeft - (d.scrollLeft0 ?? viewport.scrollLeft) : 0
    const scrollDy = viewport ? viewport.scrollTop - (d.scrollTop0 ?? viewport.scrollTop) : 0
    const size = objectSize(page, d.ref)
    let next = { x: snapCanvasValue(d.x + event.clientX - d.startX + scrollDx), y: snapCanvasValue(d.y + event.clientY - d.startY + scrollDy) }
    // Edge guides while dragging (Video 2): the button snaps to a
    // neighbour's edge and the yellow lines show where.
    if (page && !liveAlignmentOff) {
      const aligned = alignmentGuides(page, d.ref.id, { ...next, width: size.width, height: size.height })
      next = { x: aligned.x, y: aligned.y }
      setGuides({ vertical: aligned.vertical, horizontal: aligned.horizontal })
    } else setGuides({ vertical: [], horizontal: [] })
    setDraft({ id: d.ref.id, x: next.x, y: next.y })
    autoScrollViewport(event.clientX, event.clientY)
  }
  const endDrag = () => {
    const d = drag.current
    if (d && draft) {
      const dx = draft.x - d.x, dy = draft.y - d.y
      if (dx || dy) moveSelectedPageObjects(dx, dy)
    }
    drag.current = null; setDraft(null); setGuides({ vertical: [], horizontal: [] })
  }

  // Video 2 Shortcuts panel: A disables alignment in Edit Mode. B is
  // Blackout in this app, so it is NOT the horizontal-drag key and NOT
  // the beat key — both stay parked (see the Shortcuts panel notes).
  useEffect(() => {
    if (!editing) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key.toLowerCase() === 'a' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !event.repeat) {
        const state = useShowStore.getState()
        state.setLiveAlignmentOff(!state.liveAlignmentOff)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  // Drag-anywhere for cue buttons (Jake, 22 Nov 2026): the whole button is
  // the handle — there is no drag bar. A press arms a drag; only movement
  // past DRAG_THRESHOLD starts one, so a click (no movement) still fires
  // the button, and a drag swallows the click that follows its pointerup.
  // Pointer capture is taken only once the drag starts: taking it on press
  // would retarget the pointerup/click to this div and break firing, and
  // the press must never preventDefault either (that cancels the click).
  // Inputs inside a button (the fader slider) keep their own behaviour —
  // a press on one never arms a drag.
  const onControlPointerDown = (event: React.PointerEvent, ref: Selection, x: number, y: number) => {
    if (event.shiftKey && editing && !locked) { togglePageObjectSelection(ref); return }
    selectRef(ref)
    if (!editing || locked || event.button !== 0) return
    if ((event.target as HTMLElement).closest('input, select, textarea')) return
    armedDrag.current = { ref, startX: event.clientX, startY: event.clientY, x, y }
  }
  const onControlPointerMove = (event: React.PointerEvent) => {
    if (drag.current) { moveDrag(event); return }
    const armed = armedDrag.current
    if (!armed) return
    if (Math.hypot(event.clientX - armed.startX, event.clientY - armed.startY) <= DRAG_THRESHOLD) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = armed
    armedDrag.current = null
    // A flash button pressed to start this drag was already lit by its own
    // pointerdown — release it now that the press has become a move.
    const control = page?.controls.find((item) => item.id === armed.ref.id)
    if (control?.type === 'flash' && (activeLiveValues[control.id] ?? 0) > 0) setLiveValue(control.id, 0)
    moveDrag(event)
  }
  const onControlPointerUp = () => {
    if (drag.current) { endDrag(); suppressClick.current = true }
    armedDrag.current = null
  }
  const onControlPointerCancel = () => {
    armedDrag.current = null
    drag.current = null
    setDraft(null)
  }
  const onControlClickCapture = (event: React.MouseEvent) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const beginMarquee = (event: React.PointerEvent) => {
    if (!editing || locked || event.button !== 0 || event.target !== event.currentTarget) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left, y = event.clientY - rect.top
    marquee.current = { startX: x, startY: y }
    setMarqueeRect({ x, y, width: 0, height: 0 })
  }
  const moveMarquee = (event: React.PointerEvent) => {
    if (!marquee.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left, y = event.clientY - rect.top
    setMarqueeRect({ x: marquee.current.startX, y: marquee.current.startY, width: x - marquee.current.startX, height: y - marquee.current.startY })
  }
  const endMarquee = () => {
    if (marquee.current) {
      if (marqueeRect && (Math.abs(marqueeRect.width) > 4 || Math.abs(marqueeRect.height) > 4)) selectPageObjectsInRect(marqueeRect)
      else clearPageObjectSelection()
    }
    marquee.current = null; setMarqueeRect(null)
  }

  useEffect(() => {
    if (!editing || locked) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      // LightKey edit shortcuts: arrow keys nudge the selection (10px, or
      // 1px with Shift) and Esc clears it. Swallow them here so the global
      // handlers do not also advance a cue (arrows) or stop one (Esc) while
      // a selection is being edited.
      if (selectedPageObjects.length && event.key.startsWith('Arrow')) {
        event.preventDefault(); event.stopImmediatePropagation()
        const step = event.shiftKey ? 1 : 10
        moveSelectedPageObjects(
          event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        )
        return
      }
      if (key === 'escape' && selectedPageObjects.length) {
        event.preventDefault(); event.stopImmediatePropagation()
        setPopupOpen(false)
        clearPageObjectSelection()
        return
      }
      if (key === 'delete' || key === 'backspace') {
        if (selectedPageObjects.length) { event.preventDefault(); deleteSelectedPageObjects() }
      } else if (mod && key === 'c') {
        if (selectedPageObjects.length) { event.preventDefault(); copySelectedPageObjects() }
      } else if (mod && key === 'v') {
        event.preventDefault(); pastePageObjects()
      } else if (mod && key === 'd') {
        event.preventDefault(); duplicateSelectedPageObjects()
      } else if (key === 'escape') {
        setPopupOpen(false)
        clearPageObjectSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, locked, selectedPageObjects, deleteSelectedPageObjects, copySelectedPageObjects, pastePageObjects, duplicateSelectedPageObjects, clearPageObjectSelection, moveSelectedPageObjects])
  const selectedControl = selection?.type === 'cue' ? page?.controls.find((item) => item.id === selection.id) : undefined
  const selectedList = selection?.type === 'list' ? page?.cueListWidgets?.find((item) => item.id === selection.id) : undefined
  const selectedAnnotation = selection?.type === 'annotation' ? page?.annotations?.find((item) => item.id === selection.id) : undefined
  const inspectorTarget: InspectorTarget = selectedControl ? 'cue' : selectedList ? 'cuelist' : selectedAnnotation?.type === 'frame' ? 'frame' : selectedAnnotation ? 'label' : 'page'
  // An NDI Ambience button carries no cue, presets or sequences and is
  // always a toggle — the inspector sections for those (Type, Cue
  // select, Presets, Sequences) are irrelevant for it (Jake, 23 Nov
  // 2026) and stay hidden; name, timing, colour and Remove stay.
  const isAmbienceControl = selectedControl?.ndiAmbience === true
  const inspectorFieldList = isAmbienceControl
    ? inspectorFields(inspectorTarget).filter((field) => !['controlType', 'cue', 'presets', 'sequences'].includes(field))
    : inspectorFields(inspectorTarget)
  const overrideCount = Object.values(manualOverrides).reduce((sum, attrs) => sum + Object.keys(attrs).length, 0)
  const cueTiming = selectedControl ? { fadeInMs: 0, fadeOutMs: 0, delayMs: 0, curve: 'linear' as FadeCurve, ...selectedControl.timing } : null
  // The canvas is at least as big as the visible viewport and grows
  // past it whenever an object approaches an edge (Jake, 25 Nov 2026):
  // the dotted grid and the scrollable area always cover the full
  // extent, and the canvas keeps growing — there is no maximum. The
  // in-flight drag draft counts too, so the canvas already extends
  // while a button is being dragged past the edge, not only after it
  // is dropped. Saved pages keep their positions: everything already
  // on a page sits within the old 900-wide bounds, so growing never
  // shifts an object.
  const positioned = page ? positionedObjects(page) : []
  const draftRect = draft ? (() => {
    const item = positioned.find((o) => o.id === draft.id)
    return item ? { x: draft.x, y: draft.y, width: item.width, height: item.height } : null
  })() : null
  const canvasSize = page ? canvasSizeFor(viewportSize, [...positioned, ...(draftRect ? [draftRect] : [])]) : null
  const canvasContentWidth = canvasSize?.width ?? 1
  // The canvas renders h-full unless its content runs past the visible
  // panel — only then does it take an explicit taller height, so the
  // viewport scrolls down to it instead of cutting objects off.
  const canvasContentHeight = canvasSize && canvasSize.height > viewportSize.height ? canvasSize.height : undefined
  // LightKey's Live view has no bordered boxes around the page: the
  // panel and canvas borders only render in Live Edit mode, so the
  // editable area is still clearly delineated while editing, and the
  // page sits directly on the background otherwise. border-transparent
  // (not no border at all) keeps the layout from shifting between modes.
  // The section itself has no background of its own (Jake, 25 Nov 2026):
  // it sits directly on the bottom panel's background, so the Design /
  // Live header above and the canvas below read as one continuous
  // canvas, like LightKey — the old bg-bg/30 darkened the whole section
  // and left a visible seam under the header.
  const panelBorder = editing ? 'border border-line' : 'border border-transparent'
  const editToolbar = <div className={`flex flex-wrap items-center gap-2${!toolbarHost && masterOverlay ? ' master-overlay-inset' : ''}`}>
    {editing && !locked && <>
      <div className="ml-auto flex items-center gap-1" role="toolbar" aria-label="Live edit tools">
        <button type="button" aria-label="New button" title="New button" className="btn-theme px-2 text-base leading-none" onClick={() => addControl()}>+</button>
        <button type="button" aria-label="New frame" title="New frame" className="btn-theme px-2 text-base leading-none" onClick={() => addAnnotation('frame')}>▣</button>
        <button type="button" aria-label="Insert text" title="Insert text" className="btn-theme px-2 text-base leading-none" onClick={() => addAnnotation('label')}>T</button>
      </div>
      <button type="button" className="live-page-edit rounded px-3 py-1 text-xs font-semibold" style={{ backgroundColor: '#22c55e', color: '#111' }} onClick={toggleEditing}>Done</button>
    </>}
    {!editing && !locked && !isLiveWindow() && <button type="button" className="live-page-edit btn-theme ml-auto text-xs" onClick={toggleEditing}>Edit</button>}
  </div>
  // The section is exactly the visible panel body's height (h-full, not
  // min-h-full): the canvas scroll container below shrinks to fit and
  // scrolls internally, so the section never grows taller than the panel.
  // That matters for the properties popup further down, whose top-2 /
  // bottom-2 insets are against this section — with a definite section
  // height they span the visible panel, so the popup can never run off
  // the page (Jake, 18 Nov 2026).
  return <section data-context-menu="page" aria-label="Live page canvas" className={`relative flex h-full flex-col gap-2 rounded ${panelBorder} p-3`} onContextMenu={openContextMenu}>
    {/* LightKey-style edit toolbar: the Design / Live switch sits in the
        bottom panel above this workspace (ViewSwitch, rendered by App);
        the toolbar below it holds New Button (+), New Frame, Insert Text
        (T) and the green Done button, as in LightKey's bottom panel.
        When the Master fader overlays this workspace (masterOverlay, set
        by App — the column sits on top of the panel's left edge), the
        header, the overrides banner and the canvas scroll container all
        take the master-overlay inset so their content starts clear of the
        column at rest and only slides underneath it when scrolled. */}
    {toolbarHost ? createPortal(editToolbar, toolbarHost) : editToolbar}
    {overrideCount > 0 && <div className={`flex justify-between rounded border border-amber-500/60 bg-amber-900/30 p-2 text-xs text-amber-100${masterOverlay ? ' master-overlay-inset' : ''}`}><span>{overrideCount} manual properties overriding output</span><button type="button" className="underline" onClick={clearManualOverrides}>Release overrides</button></div>}
    <div className="flex min-h-0 flex-1 gap-2">
      {!page ? <div className={`flex min-h-32 flex-1 items-center justify-center rounded ${panelBorder} bg-panel text-xs text-dim`}>This Live page is blank. Select Edit to start arranging controls.</div> : <>
      <div ref={canvasViewportRef} aria-label="Live canvas viewport" className={`min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto rounded ${panelBorder}${masterOverlay ? ' master-overlay-inset' : ''}`}><div ref={pageCanvas} className="relative h-full min-w-full bg-panel" style={{ width: canvasContentWidth, height: canvasContentHeight, backgroundImage: editing ? 'radial-gradient(var(--line) 1px, transparent 1px)' : undefined, backgroundSize: '10px 10px' }} onPointerDown={beginMarquee} onPointerMove={moveMarquee} onPointerUp={endMarquee} onPointerCancel={() => { marquee.current = null; setMarqueeRect(null) }} onDragOver={allowDrop} onDrop={(event) => dropAt(event)}>
        {marqueeRect && <div className="pointer-events-none absolute border border-dashed border-[var(--accent)] bg-[var(--accent)]/10" style={{ left: Math.min(marqueeRect.x, marqueeRect.x + marqueeRect.width), top: Math.min(marqueeRect.y, marqueeRect.y + marqueeRect.height), width: Math.abs(marqueeRect.width), height: Math.abs(marqueeRect.height) }} />}
        {/* Yellow alignment guides (Video 2): thin lines extending
            from the moving/resizing object's aligned edges across the
            canvas while a drag or resize is in progress. */}
        {guides.vertical.map((gx) => <div key={`guide-v-${gx}`} className="pointer-events-none absolute top-0 z-10 w-px bg-yellow-400" style={{ left: gx, height: canvasSize?.height ?? '100%' }} />)}
        {guides.horizontal.map((gy) => <div key={`guide-h-${gy}`} className="pointer-events-none absolute left-0 z-10 h-px bg-yellow-400" style={{ top: gy, width: canvasSize?.width ?? '100%' }} />)}
        {(page.annotations ?? []).map((item) => {
          const ref: PageObjectRef = { type: 'annotation', id: item.id }
          const rx = resizeDraft?.id === item.id ? resizeDraft.x : draft?.id === item.id ? draft.x : item.x
          const ry = resizeDraft?.id === item.id ? resizeDraft.y : draft?.id === item.id ? draft.y : item.y
          const w = resizeDraft?.id === item.id ? resizeDraft.width : item.width
          const h = resizeDraft?.id === item.id ? resizeDraft.height : item.height
          return <div key={item.id} className={`absolute ${item.type === 'frame' ? 'border border-line rounded' : ''} ${editing && !locked && isSelected(ref) ? 'outline outline-1 outline-[var(--accent)]' : ''}`} style={{ left: rx, top: ry, width: w, height: h, pointerEvents: item.type === 'frame' && editing && !locked ? 'auto' : 'none' }} onDragOver={item.type === 'frame' ? allowDrop : undefined} onDrop={item.type === 'frame' ? (event) => dropAt(event, item.id) : undefined}>
            <div className={`px-2 py-1 text-xs ${editing ? 'cursor-grab bg-panel2' : ''}`} style={{ pointerEvents: editing ? 'auto' : 'none', ...css(item.style) }} onPointerDown={(e) => beginDrag(e, ref, rx, ry)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }} onDoubleClick={() => openPropertiesPopup(ref)}>{item.text}</div>
            {resizeHandle(ref, rx, ry, w, h)}
          </div>
        })}
        {page.controls.map((control, index) => {
          const p = position(index), x = resizeDraft?.id === control.id ? resizeDraft.x : draft?.id === control.id ? draft.x : control.x ?? p.x, y = resizeDraft?.id === control.id ? resizeDraft.y : draft?.id === control.id ? draft.y : control.y ?? p.y
          const ref: PageObjectRef = { type: 'cue', id: control.id }
          const cw = control.width ?? LIVE_CUE_SIZE.width, ch = control.height ?? LIVE_CUE_SIZE.height
          const w = resizeDraft?.id === control.id ? resizeDraft.width : cw, h = resizeDraft?.id === control.id ? resizeDraft.height : ch
          const level = activeLiveValues[control.id] ?? 0
          // A button takes on its light colour (Jake, 22 Nov 2026): a colour
          // preset colours it, a dimmer-only button is white. Off it is a
          // translucent tint (the LightKey look); lit it is solid. An
          // explicit text colour on the object wins over the
          // contrast-derived one; the selection border still wins over
          // the colour border. The whole button is the drag handle — the
          // press arms a drag, movement past the threshold starts it, and
          // a plain click still fires (see onControlPointerDown).
          // Double-click opens the properties popup; it does not fire the
          // cue: a toggle cue is clicked twice (on then off — or off then
          // on), a flash cue is momentary, and a fader ignores double-click,
          // so the cue's level is unchanged by opening the popup.
          const buttonColor = liveControlButtonColor(control, presets, cues) ?? '#ffffff'
          const buttonActive = level > 0
          const textColor = control.style?.color && control.style.color.toLowerCase() !== '#e5e7eb' ? control.style.color : liveButtonTextColor(buttonColor, buttonActive)
          return <div key={control.id} data-project-id={control.id} className={`absolute select-none rounded border p-1 text-xs ${editing && !locked ? 'cursor-grab' : ''}`} style={{ left: x, top: y, width: w, height: h, overflow: 'hidden', backgroundColor: liveButtonBackground(buttonColor, buttonActive), borderColor: isSelected(ref) ? (editing ? '#facc15' : 'var(--accent)') : buttonColor, borderStyle: namingControlId === control.id ? 'dashed' : undefined, color: textColor }} onPointerDown={(e) => onControlPointerDown(e, ref, x, y)} onPointerMove={onControlPointerMove} onPointerUp={onControlPointerUp} onPointerCancel={onControlPointerCancel} onClickCapture={onControlClickCapture} onDoubleClick={() => openPropertiesPopup(ref)} onDragOver={allowDrop} onDrop={(event) => dropOnCue(event, control.id)}>
            {namingControlId === control.id ? <input autoFocus aria-label="Cue name" title="Enter a cue name and press Return" placeholder="Enter a cue name and press Return" defaultValue={control.name} className="w-full rounded bg-bg p-1 text-xs" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const value = (e.target as HTMLInputElement).value.trim(); if (value) patchControl(control.id, { name: value }); setNamingControlId(null) } else if (e.key === 'Escape') setNamingControlId(null) }} onBlur={(e) => { const value = e.target.value.trim(); if (value) patchControl(control.id, { name: value }); setNamingControlId(null) }} /> : <div className="flex h-full flex-col">{cueBody(control, level, textColor)}</div>}
            {resizeHandle(ref, x, y, w, h)}
          </div>
        })}
        {(page.cueListWidgets ?? []).map((widget) => {
          const list = cueLists.find((item) => item.id === widget.cueListId), x = resizeDraft?.id === widget.id ? resizeDraft.x : draft?.id === widget.id ? draft.x : widget.x, y = resizeDraft?.id === widget.id ? resizeDraft.y : draft?.id === widget.id ? draft.y : widget.y, current = activeCueListId === list?.id ? activeCueIndex : -1, next = list?.steps[current + 1] ?? (list?.loop ? list.steps[0] : undefined)
          const ref: PageObjectRef = { type: 'list', id: widget.id }
          const lw = widget.width ?? LIVE_LIST_SIZE.width, lh = widget.height ?? LIVE_LIST_SIZE.height
          const w = resizeDraft?.id === widget.id ? resizeDraft.width : lw, h = resizeDraft?.id === widget.id ? resizeDraft.height : lh
          return <div key={widget.id} className={`absolute rounded border ${isSelected(ref) ? 'border-accent' : 'border-line'} bg-panel2 p-2 text-xs`} style={{ left: x, top: y, width: w, height: h, overflow: 'hidden' }} onDragOver={allowDrop} onDrop={(event) => dropOnList(event, list?.id)}>
            <div className={editing ? 'cursor-grab rounded bg-bg p-1' : 'font-semibold'} style={css(widget.style)} onPointerDown={(e) => { selectRef(ref); beginDrag(e, ref, x, y) }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }} onDoubleClick={() => openPropertiesPopup(ref)}>{editing && !locked && '↕ '}{list?.name ?? 'Missing cue list'}</div>
            <p className="mt-1 text-dim">Current: {current >= 0 ? cues.find((s) => s.id === list?.steps[current]?.cueId)?.name ?? 'Missing cue' : 'Not started'}</p><p className="text-dim">Next: {next ? cues.find((s) => s.id === next.cueId)?.name ?? 'Missing cue' : 'End of list'}</p>
            {list && <div className="mt-2 flex gap-1"><button className="btn-theme" onClick={() => stopCue()} disabled={current < 0 || !cuePlaying}>Stop</button><button className="btn-theme" onClick={() => cuePrev()} disabled={current < 0}>Back</button><button className="btn-theme on" disabled={!list.steps.length} onClick={() => current >= 0 ? cueNext() : goToCue(list.id, 0)}>Go</button></div>}
            {list && <div className="mt-2"><XfadeSlider listId={list.id} /></div>}
            {resizeHandle(ref, x, y, w, h)}
          </div>
        })}
      </div></div>
      {/* Button properties popup: slides in from the right over the canvas
          on double-click (Jake, 18 Nov 2026). It scrolls on its own
          (overflow-y-auto) while the canvas behind it does not scroll, so
          the selected button stays visible while its properties are edited.
          Its top-2/bottom-2 insets are against this section, and the section
          is exactly the visible panel body's height (h-full, see above), so
          the popup always fits entirely inside the visible panel — its
          bottom never runs off the page, and reaching the bottom of the
          properties list needs only the popup's own scroll, never the
          canvas scroll that would hide the button being edited. It follows
          the single selection while open; close with X, Esc or Done. The
          same inspector fields as the old fixed sidebar, moved here
          verbatim — Ad hoc properties, Timing mm:ss.t, Button Type,
          Presets/Sequences, More, style, attachment. */}
      {!locked && popupOpen && selection && <div role="dialog" aria-label={`${inspectorTarget} properties`} data-fields={inspectorFieldList.join(',')} className="live-properties-popup absolute bottom-2 right-2 top-2 z-50 w-[300px] overflow-y-auto rounded border border-line bg-panel2 p-2 text-xs shadow-2xl">
        <div className="mb-1 flex items-center justify-between"><strong className="capitalize">{inspectorTarget} properties</strong><button type="button" aria-label="Close properties popup" title="Close properties popup" onClick={() => setPopupOpen(false)}>×</button></div>
        {selectedControl && cueTiming && <div className="space-y-3">
          <div className="flex items-center justify-between"><strong>{selectedControl.name}</strong></div>
          <label className="block">Name<input aria-label="Cue name" value={selectedControl.name} onChange={(e) => patchControl(selectedControl.id, { name: e.target.value })} className="ml-1 rounded bg-bg p-1" /></label>
          {isAmbienceControl ? <>
            <div>
              <h4 className="font-semibold text-text">Timing</h4>
              <div className="flex flex-wrap items-end gap-2">
                <TimingInput label="Fade In" ms={cueTiming.fadeInMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeInMs: ms })} />
                <TimingInput label="Fade Out" ms={cueTiming.fadeOutMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeOutMs: ms })} />
                <label className="text-dim">Curve<select aria-label="Fade curve" value={cueTiming.curve} onChange={(event) => configureCueTiming(selectedControl.id, { curve: event.target.value as FadeCurve })} className="ml-1 rounded bg-bg p-1">{['linear', 'ease-in', 'ease-out', 'ease-in-out', 's-curve'].map((curve) => <option key={curve}>{curve}</option>)}</select></label>
              </div>
            </div>
            <details><summary className="cursor-pointer">More</summary>
              <div className="mt-1 flex flex-wrap items-end gap-2">
                <label className="text-dim">Colour<input aria-label="Cue colour" type="color" value={selectedControl.appearance?.color ?? '#47235a'} className="ml-1" onChange={(event) => configureCueAppearance(selectedControl.id, { color: event.target.value })} /></label>
                <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.appearance?.releaseOthers === true} onChange={(event) => configureCueAppearance(selectedControl.id, { releaseOthers: event.target.checked })} /> Release other buttons</label>
                <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.activateAtStartup === true} onChange={(event) => patchControl(selectedControl.id, { activateAtStartup: event.target.checked })} /> Activate at startup</label>
                <label className="text-dim">Frame action<select aria-label="Frame step action" value={selectedControl.frameStep ?? ''} onChange={(event) => configureCueFrameStep(selectedControl.id, event.target.value ? event.target.value as 'next' | 'previous' : undefined)} className="ml-1 rounded bg-bg p-1"><option value="">Normal cue</option><option value="next">Next button</option><option value="previous">Previous button</option></select></label>
                {(['intensity', 'speed', 'size'] as const).map((key) => <label key={key} className="capitalize text-dim">{key} %<input aria-label={`Cue ${key}`} type="number" min="0" max="200" value={selectedControl.modifiers?.[key] ?? 100} className="ml-1 w-16 rounded bg-bg p-1" onChange={(event) => configureCueModifiers(selectedControl.id, { [key]: Number(event.target.value) })} /></label>)}
                <label className="text-dim">Priority<input aria-label="Cue priority" type="number" value={selectedControl.priority ?? 0} className="ml-1 w-16 rounded bg-bg p-1" onChange={(event) => configureCuePriority(selectedControl.id, Number(event.target.value))} /></label>
              </div>
            </details>
            {styleFields({ type: 'cue', id: selectedControl.id }, 'cue', selectedControl.style)}
            {attachmentSelect({ type: 'cue', id: selectedControl.id }, selectedControl.attachedTo)}
          </> : <>
            {/* Video 2's tabbed inspector (Jake, 27 Nov 2026): Contents /
                Options / Button. "Get Info" and "Show Properties" both
                open this same inspector — the guide uses Get Info for
                Live objects and Show Properties for Design objects, and
                no source shows a second panel for a button. */}
            <div role="tablist" aria-label="Inspector tabs" className="flex gap-1 border-b border-line pb-1">
              {(['contents', 'options', 'button'] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={inspectorTab === tab} onClick={() => setInspectorTab(tab)} className={`rounded px-2 py-1 text-xs capitalize ${inspectorTab === tab ? 'bg-panel font-semibold' : 'text-dim hover:bg-panel'}`}>{tab}</button>
              ))}
            </div>
            {inspectorTab === 'contents' && <div className="space-y-2">
              <h4 className="font-semibold text-text">Contents</h4>
              <div role="list" aria-label="Cue contents" onDragOver={allowDrop} onDrop={(event) => dropOnContents(event, selectedControl)}>
                {contentsRows(selectedControl).map((row) => (
                  <div key={row.key} role="listitem" aria-selected={selectedContentKey === row.key} className={`flex items-center gap-1 rounded px-1 py-0.5 ${selectedContentKey === row.key ? 'bg-panel font-semibold' : 'hover:bg-panel'}`} onClick={() => selectContentRow(row)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); selectContentRow(row); setContentsMenu({ x: event.clientX, y: event.clientY, row }) }}>
                    <span aria-hidden="true">{row.kind === 'preset' ? '●' : row.kind === 'sequence' ? '↻' : row.kind === 'effect' ? '∿' : '✎'}</span>
                    <span className={`min-w-0 flex-1 truncate ${row.kind === 'ad-hoc' ? 'italic' : ''}`}>{row.name}</span>
                    {row.source === 'cue' && <span className="text-dim" title="Stored in the cue">cue</span>}
                    <button type="button" aria-label={`Remove ${row.name} from cue`} title={`Remove ${row.name} from cue`} onClick={(event) => { event.stopPropagation(); removeContentRow(selectedControl, row) }}>×</button>
                  </div>
                ))}
                {!contentsRows(selectedControl).length && <span className="text-dim">Empty — drag presets or sequences here</span>}
              </div>
              {!contentsRows(selectedControl).some((row) => row.kind === 'ad-hoc') && <span className="text-dim">Ad hoc properties — none</span>}
              {(() => {
                const row = contentsRows(selectedControl).find((item) => item.key === selectedContentKey && item.kind === 'ad-hoc')
                if (!row) return null
                return <div>
                  <h4 className="font-semibold text-text">Ad hoc properties</h4>
                  {Object.entries(row.values).flatMap(([fixtureId, values]) => Object.entries(values).map(([property, value]) => <label key={`${fixtureId}:${property}`} className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate">{fixtureId} · {property}</span><input aria-label={`${fixtureId} ${property}`} type="number" min="0" max="255" value={value} className="w-16 rounded bg-bg p-1" onChange={(event) => row.source === 'cue' && selectedControl.cueId ? editCueDefContents(selectedControl.cueId, { type: 'set-ad-hoc', fixtureId, property, value: Number(event.target.value) }) : editCueContents(selectedControl.id, { type: 'set-ad-hoc', fixtureId, property, value: Number(event.target.value) })} /><button type="button" aria-label={`Remove ${fixtureId} ${property}`} onClick={() => row.source === 'cue' && selectedControl.cueId ? editCueDefContents(selectedControl.cueId, { type: 'remove-ad-hoc', fixtureId, property }) : editCueContents(selectedControl.id, { type: 'remove-ad-hoc', fixtureId, property })}>×</button></label>))}
                </div>
              })()}
              <details><summary className="cursor-pointer">Presets ({(selectedControl.presetIds ?? []).length})</summary>{presets.map((p) => <label key={p.id} className="block"><input type="checkbox" checked={(selectedControl.presetIds ?? []).includes(p.id)} onChange={(e) => patchControl(selectedControl.id, { presetIds: e.target.checked ? [...(selectedControl.presetIds ?? []), p.id] : (selectedControl.presetIds ?? []).filter((id) => id !== p.id) })} /> {p.name}</label>)}</details>
              <details><summary className="cursor-pointer">Sequences ({(selectedControl.sequenceIds ?? []).length})</summary>{(show?.sequences ?? []).map((s) => <label key={s.id} className="block"><input type="checkbox" checked={(selectedControl.sequenceIds ?? []).includes(s.id)} onChange={(e) => patchControl(selectedControl.id, { sequenceIds: e.target.checked ? [...(selectedControl.sequenceIds ?? []), s.id] : (selectedControl.sequenceIds ?? []).filter((id) => id !== s.id) })} /> {s.name}</label>)}</details>
              <details><summary className="cursor-pointer">Effects ({(selectedControl.effectIds ?? []).length})</summary>{effects.map((e) => <label key={e.id} className="block"><input type="checkbox" checked={(selectedControl.effectIds ?? []).includes(e.id)} onChange={(event) => patchControl(selectedControl.id, { effectIds: event.target.checked ? [...(selectedControl.effectIds ?? []), e.id] : (selectedControl.effectIds ?? []).filter((id) => id !== e.id) })} /> {e.name}</label>)}</details>
            </div>}
            {inspectorTab === 'options' && <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-text">Timing</h4>
                <div className="flex flex-wrap items-end gap-2">
                  <TimingInput label="Fade In" ms={cueTiming.fadeInMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeInMs: ms })} />
                  <TimingInput label="Fade Out" ms={cueTiming.fadeOutMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeOutMs: ms })} />
                  <label className="text-dim">Curve<select aria-label="Fade curve" value={cueTiming.curve} onChange={(event) => configureCueTiming(selectedControl.id, { curve: event.target.value as FadeCurve })} className="ml-1 rounded bg-bg p-1">{['linear', 'ease-in', 'ease-out', 'ease-in-out', 's-curve'].map((curve) => <option key={curve}>{curve}</option>)}</select></label>
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-text">Modifiers</h4>
                <div className="flex flex-wrap items-end gap-2">
                  {(['intensity', 'speed', 'size'] as const).map((key) => <label key={key} className="capitalize text-dim">{key} %<input aria-label={`Cue ${key}`} type="number" min="0" max="200" value={selectedControl.modifiers?.[key] ?? 100} className="ml-1 w-16 rounded bg-bg p-1" onChange={(event) => configureCueModifiers(selectedControl.id, { [key]: Number(event.target.value) })} /></label>)}
                </div>
              </div>
              <label className="text-dim">Priority<input aria-label="Cue priority" type="number" value={selectedControl.priority ?? 0} className="ml-1 w-16 rounded bg-bg p-1" onChange={(event) => configureCuePriority(selectedControl.id, Number(event.target.value))} /></label>
              <label className="text-dim">Frame action<select aria-label="Frame step action" value={selectedControl.frameStep ?? ''} onChange={(event) => configureCueFrameStep(selectedControl.id, event.target.value ? event.target.value as 'next' | 'previous' : undefined)} className="ml-1 rounded bg-bg p-1"><option value="">Normal cue</option><option value="next">Next button</option><option value="previous">Previous button</option></select></label>
            </div>}
            {inspectorTab === 'button' && <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-text">Button</h4>
                <label className="text-dim">Type<select aria-label="Cue control type" value={selectedControl.type} onChange={(e) => { setLiveValue(selectedControl.id, 0); patchControl(selectedControl.id, { type: e.target.value as LiveControl['type'] }) }} className="ml-1 rounded bg-bg p-1">{(Object.keys(BUTTON_TYPE_LABELS) as LiveControl['type'][]).map((type) => <option key={type} value={type}>{BUTTON_TYPE_LABELS[type]}</option>)}</select></label>
                {selectedControl.type === 'flash' && <label className="mt-1 block text-dim">Behavior<select aria-label="Push button behavior" value="flash" onChange={(e) => { if (e.target.value === 'toggle') { setLiveValue(selectedControl.id, 0); patchControl(selectedControl.id, { type: 'toggle' }) } }} className="ml-1 rounded bg-bg p-1"><option value="flash">Flash</option><option value="toggle">Toggle</option></select></label>}
                <label className="mt-1 block text-dim">Cue<select aria-label="Cue" value={selectedControl.cueId ?? ''} onChange={(e) => patchControl(selectedControl.id, { cueId: e.target.value || undefined })} className="ml-1 rounded bg-bg p-1"><option value="">No cue</option>{cues.filter((s) => !s.blackout).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-dim">Colour<input aria-label="Cue colour" type="color" value={selectedControl.appearance?.color ?? DEFAULT_BUTTON_APPEARANCE_COLOR} className="ml-1" onChange={(event) => configureCueAppearance(selectedControl.id, { color: event.target.value })} /></label>
                <button type="button" aria-label="Automatic colour" title="Automatic — the colour follows the cue contents" disabled={!selectedControl.appearance?.color || selectedControl.appearance.color.toLowerCase() === DEFAULT_BUTTON_APPEARANCE_COLOR} onClick={() => configureCueAppearance(selectedControl.id, { color: DEFAULT_BUTTON_APPEARANCE_COLOR })} className="rounded bg-panel px-2 py-1 text-xs disabled:opacity-40">Automatic</button>
                <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.appearance?.releaseOthers === true} onChange={(event) => configureCueAppearance(selectedControl.id, { releaseOthers: event.target.checked })} /> Release other buttons</label>
                <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.activateAtStartup === true} onChange={(event) => patchControl(selectedControl.id, { activateAtStartup: event.target.checked })} /> Activate at startup</label>
                <label className="flex items-center gap-1 text-dim" title="Attached buttons only: one of the attached buttons stays active at any time (Guide ch.11, p.204)"><input type="checkbox" checked={selectedControl.alwaysActive === true} onChange={(event) => patchControl(selectedControl.id, { alwaysActive: event.target.checked })} /> Always active</label>
              </div>
              {styleFields({ type: 'cue', id: selectedControl.id }, 'cue', selectedControl.style)}
              {attachmentSelect({ type: 'cue', id: selectedControl.id }, selectedControl.attachedTo)}
            </div>}
            {contentsMenu && <div ref={contentsMenuRef} role="menu" aria-label="Contents item actions" className="fixed z-[310] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: contentsMenu.x, top: contentsMenu.y }}>
              <button type="button" role="menuitem" disabled={contentsMenu.row.kind === 'ad-hoc'} title={contentsMenu.row.kind === 'ad-hoc' ? 'Ad hoc values are not in the palette' : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { if (contentsMenu.row.kind !== 'ad-hoc') setPaletteReveal(contentsMenu.row.kind, contentsMenu.row.id); setContentsMenu(null) }}>Show in Palette</button>
              <button type="button" role="menuitem" disabled={contentsMenu.row.kind !== 'ad-hoc'} title={contentsMenu.row.kind !== 'ad-hoc' ? 'Already in the palette' : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { if (contentsMenu.row.kind === 'ad-hoc') promoteAdHocToPreset(contentsMenu.row.source === 'cue' && selectedControl.cueId ? { cueId: selectedControl.cueId } : { controlId: selectedControl.id }); setContentsMenu(null) }}>Add to Palette</button>
              <button type="button" role="menuitem" disabled={contentsMenu.row.kind === 'ad-hoc' && contentsMenu.row.source === 'control'} title={contentsMenu.row.kind === 'ad-hoc' && contentsMenu.row.source === 'control' ? 'Select the row to edit its values in place below' : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => {
                const row = contentsMenu.row
                if (row.kind === 'preset') startEditingPreset(row.id)
                else if (row.kind === 'sequence') window.dispatchEvent(new CustomEvent('openlights-edit-sequence', { detail: row.id }))
                else if (row.kind === 'effect') startEditingLiveEffect(row.id)
                else if (row.source === 'cue' && selectedControl.cueId) startEditingCueAdHoc(selectedControl.cueId)
                setContentsMenu(null)
              }}>Edit</button>
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { removeContentRow(selectedControl, contentsMenu.row); setContentsMenu(null) }}>Remove From Cue</button>
            </div>}
          </>}
          <button type="button" className="text-red-300" onClick={() => { setLiveValue(selectedControl.id, 0); savePage({ ...page, controls: page.controls.filter((c) => c.id !== selectedControl.id) }); clearPageObjectSelection() }}>Remove</button>
        </div>}
        {selectedList && <div className="space-y-2">
          <CueListEditor listId={selectedList.cueListId} />
          <label>Cue list <select aria-label="Widget cue list" value={selectedList.cueListId} onChange={(e) => savePage({ ...page, cueListWidgets: (page.cueListWidgets ?? []).map((w) => w.id === selectedList.id ? { ...w, cueListId: e.target.value } : w) })} className="rounded bg-bg p-1">{cueLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
          {styleFields({ type: 'list', id: selectedList.id }, 'list', selectedList.style)}
          {attachmentSelect({ type: 'list', id: selectedList.id }, selectedList.attachedTo)}
          <button type="button" className="text-red-300" onClick={() => { savePage({ ...page, cueListWidgets: (page.cueListWidgets ?? []).filter((w) => w.id !== selectedList.id) }); clearPageObjectSelection() }}>Remove</button>
        </div>}
        {selectedAnnotation && <div className="space-y-2">
          <strong className="block capitalize">{selectedAnnotation.type} inspector</strong>
          <div className="flex flex-wrap items-end gap-2">{(['text', 'width', 'height'] as const).map((key) => <label key={key} className="capitalize text-dim">{key}<input aria-label={`${selectedAnnotation.type} ${key}`} type={key === 'text' ? 'text' : 'number'} min={key === 'text' ? undefined : 20} value={selectedAnnotation[key]} onChange={(e) => { const ref: PageObjectRef = { type: 'annotation', id: selectedAnnotation.id }; if (key === 'text') renamePageObject(ref, e.target.value); else { const other = key === 'width' ? selectedAnnotation.height : selectedAnnotation.width; resizePageObject(ref, key === 'width' ? Number(e.target.value) : other, key === 'height' ? Number(e.target.value) : other) } }} className="block w-32 rounded bg-bg p-1" /></label>)}</div>
          {styleFields({ type: 'annotation', id: selectedAnnotation.id }, selectedAnnotation.type, selectedAnnotation.style)}
          {selectedAnnotation.type === 'frame' && frameConfigFields(selectedAnnotation.id, selectedAnnotation.frame)}
          {attachmentSelect({ type: 'annotation', id: selectedAnnotation.id }, selectedAnnotation.attachedTo)}
          <button type="button" className="text-red-300" onClick={() => { savePage({ ...page, annotations: (page.annotations ?? []).filter((a) => a.id !== selectedAnnotation.id) }); clearPageObjectSelection() }}>Remove</button>
        </div>}
      </div>}
      </>}
    </div>
    {buttonMenu && <div ref={menuRef} role="menu" aria-label="Cue button actions" className="fixed z-[300] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: menuPos.left, top: menuPos.top }}>
      <CueButtonMenu controlId={buttonMenu.controlId} onClose={() => setButtonMenu(null)} />
    </div>}
    {contextMenu && <div ref={menuRef} role="menu" aria-label="Live edit actions" className="fixed z-[300] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: menuPos.left, top: menuPos.top }}>
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { addControl(contextMenu.at); setContextMenu(null) }}>New Button</button>
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { addNewList(contextMenu.at); setContextMenu(null) }}>New Cue List</button>
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { addAnnotation('label', contextMenu.at); setContextMenu(null) }}>Insert Text</button>
      <button type="button" role="menuitem" disabled={!cueLists.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { addList(contextMenu.at); setContextMenu(null) }}>Insert Cuelist</button>
      <div className="my-1 border-t border-line" />
      <button type="button" role="menuitem" disabled={!selectedPageObjects.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { cutSelected(); setContextMenu(null) }}>Cut</button>
      <button type="button" role="menuitem" disabled={!selectedPageObjects.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { copySelectedPageObjects(); setContextMenu(null) }}>Copy</button>
      <button type="button" role="menuitem" disabled={isClipboardEmpty(pageClipboard)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { pastePageObjects(); setContextMenu(null) }}>Paste</button>
      <button type="button" role="menuitem" disabled={!selectedPageObjects.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { duplicateSelectedPageObjects(); setContextMenu(null) }}>Duplicate</button>
      <button type="button" role="menuitem" disabled={!selectedPageObjects.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { deleteSelectedPageObjects(); setContextMenu(null) }}>Delete</button>
      <div className="my-1 border-t border-line" />
      <button type="button" role="menuitem" disabled={!selectedPageObjects.some((r) => r.type === 'cue' || r.type === 'list') || !Object.keys(manualOverrides).length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { addOverridesToCues(undefined, contextMenu.alt); setContextMenu(null) }}>{contextMenu.alt ? 'Add Overrides for Selected Fixtures' : 'Add Overrides'}</button>
      <button type="button" role="menuitem" disabled={selectedPageObjects.length !== 1 || !(selectedPageObjects[0].type === 'cue' || selectedPageObjects[0].type === 'list')} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => {
        const target = editAdHocTarget(useShowStore.getState())
        if (target && 'cueId' in target) startEditingCueAdHoc(target.cueId)
        else if (target && 'popup' in target) setPopupOpen(true)
        setContextMenu(null)
      }}>Edit Ad Hoc Properties</button>
      <div className="my-1 border-t border-line" />
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { setContextMenu(null); toggleEditing() }}>{editing ? '✓ Return to Live' : 'Edit Live View'}</button>
    </div>}
  </section>
}
