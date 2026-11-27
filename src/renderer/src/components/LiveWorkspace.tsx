import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { CueDef, FaderControlProperty, FrameConfig, LiveControl, LiveObjectKind, LiveObjectStyle, LivePage } from '@shared/types'
import { clampModifier, clampLiveSize, snapCanvasValue, canvasSizeFor, DEFAULT_OBJECT_STYLES, frameConfigFor, LIVE_CUE_SIZE, LIVE_CUE_STEP, LIVE_LIST_SIZE, type LiveCanvasBounds } from '@shared/liveObjectDefaults'
import { isLiveWindow } from '../lib/liveWindowBridge'
import {
  decodeLiveDrop, dropLabel, LIVE_DROP_MIME, LEGACY_PRESET_MIME, type LiveDropPayload
} from '../lib/liveDrops'
import { formatTimingMs, parseTimingMs } from '../lib/liveTiming'
import { resolveCueValues } from '@shared/cueResolution'
import { manualCrossfadeProgress } from '../lib/cueListPlayback'
import { orderedCuelistItems } from '../lib/cueListEditing'
import { liveButtonBackground, liveButtonTextColor, liveControlButtonColor, LIGHTKEY_BUTTON_COLORS, DEFAULT_BUTTON_APPEARANCE_COLOR } from '../lib/liveButtonColor'
import { controlBehavior, isFaderControl, isFlashControl, isLatchingControl } from '../lib/liveControlBehavior'
import { DEFAULT_CUE_PRIORITY, cuePriorityLabel } from '../lib/cuePriority'
import { faderControlsDropdownOptions, faderControlsValue } from '../lib/liveFaderControls'
import { applicableModifiers, applicableSpeedOptions, LIGHTKEY_MODIFIERS, SPEED_MODIFIER_OPTIONS } from '../lib/liveModifiers'
import { sequenceStepValues } from '../lib/sequenceClock'
import { frameForCue } from '../lib/liveFrames'
import { presetRootFolder } from '../lib/presetGroups'
import { clampPanelSize } from '../lib/panelSizes'
import { alignmentGuides, alignEdgeX, alignEdgeY } from '../lib/alignmentGuides'
import { useClampedMenuPosition } from '../lib/menuPosition'
import {
  isClipboardEmpty, newAnnotationObject, newCueObject, newWidgetObject, objectSize, positionedObjects,
  type PageObjectRef, type Rect
} from '../lib/livePageObjects'
import { useShowStore, activeCueId as getActiveCueId, collectInlineCues, findInlineCue } from '../stores/showStore'
import { inspectorFields, type InspectorTarget } from '../lib/liveInspector'
import { editAdHocTarget } from '../lib/liveOverrideTargets'
import { CueButtonMenu } from './CueButtonMenu'
import { CueListWidgetMenu } from './CueListWidgetMenu'
import { XfadeSlider } from './XfadeSlider'
import { LiveFader } from './LiveFader'

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

// LightKey button types (Guide ch.11, "Button", p.199; Jake's
// screenshots, 27 Nov 2026): Type and Behaviour are separate axes —
// a Push Button with Toggle behaviour latches (click on, click off),
// with Flash behaviour it is active only while held. A fader has no
// behaviour; its type is its track direction.
const BUTTON_TYPE_LABELS: Record<LiveControl['type'], string> = {
  push: 'Push Button',
  faderHorizontal: 'Fader Horizontal',
  faderVertical: 'Fader Vertical'
}

// The eight resize handles (Video 2): four corners + four edge
// midpoints. The handle names the edges that move; the opposite edges
// stay put.
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/**
 * A fade time shown the LightKey way — mm:ss.t (e.g. 500ms is "00:00.5").
 * The text is committed on blur / Enter; an unparsable value restores the
 * stored time instead of inventing one. The steppers nudge ±0.1s.
 */
function TimingInput({ label, ms, direction, onCommit }: { label: string; ms: number; direction: 'in' | 'out'; onCommit: (ms: number) => void }) {
  const [text, setText] = useState(formatTimingMs(ms))
  useEffect(() => { setText(formatTimingMs(ms)) }, [ms])
  const commit = () => {
    const parsed = parseTimingMs(text)
    if (parsed !== null) onCommit(parsed)
    else setText(formatTimingMs(ms))
  }
  const step = (delta: number) => onCommit(Math.max(0, ms + delta))
  return <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-0.5">
    <span className="text-right text-dim">{label}:</span>
    <div className="flex min-w-0 items-center gap-1">
      {/* LightKey's fade ramp (Jake's screenshot, 27 Nov 2026): a filled
          lavender chip with a white diagonal — ascending for Fade In,
          descending for Fade Out. The old glyph drew the same ascending
          slope for both, so Fade Out was wrong. */}
      <span aria-hidden="true" title={direction === 'in' ? 'Fade in' : 'Fade out'} className="shrink-0"><svg width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="4" fill="#807d9f" />{direction === 'in' ? <line x1="4.5" y1="13.5" x2="13.5" y2="4.5" stroke="#fff" strokeWidth="1.4" /> : <line x1="4.5" y1="4.5" x2="13.5" y2="13.5" stroke="#fff" strokeWidth="1.4" />}</svg></span>
      <input aria-label={label} value={text} onChange={(event) => setText(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); else if (event.key === 'Escape') setText(formatTimingMs(ms)) }} className="w-20 rounded bg-line p-1 text-center" />
      <span className="flex shrink-0 flex-col gap-px">
        <button type="button" aria-label={`Increase ${label}`} title={`Increase ${label}`} onClick={() => step(100)} className="rounded-sm bg-panel px-1 text-[8px] leading-[9px] hover:bg-panel2">▲</button>
        <button type="button" aria-label={`Decrease ${label}`} title={`Decrease ${label}`} onClick={() => step(-100)} className="rounded-sm bg-panel px-1 text-[8px] leading-[9px] hover:bg-panel2">▼</button>
      </span>
    </div>
  </div>
}

// A hold time shown the LightKey way: EMPTY when unset (manual
// advance — Guide ch.11, p.194: "leave hold empty for manual
// advance"), mm:ss.t once set. Otherwise TimingInput's twin — the
// text commits on blur / Enter, the steppers nudge ±0.1s.
function HoldTimeInput({ label, ms, onCommit }: { label: string; ms: number; onCommit: (ms: number) => void }) {
  const [text, setText] = useState(ms > 0 ? formatTimingMs(ms) : '')
  useEffect(() => { setText(ms > 0 ? formatTimingMs(ms) : '') }, [ms])
  const commit = () => {
    if (text.trim() === '') { onCommit(0); return }
    const parsed = parseTimingMs(text)
    if (parsed !== null) onCommit(parsed)
    else setText(ms > 0 ? formatTimingMs(ms) : '')
  }
  const step = (delta: number) => onCommit(Math.max(0, ms + delta))
  return <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-0.5">
    <span className="text-right text-dim">{label}:</span>
    <div className="flex min-w-0 items-center gap-1">
      <input aria-label={label} value={text} placeholder="—" onChange={(event) => setText(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); else if (event.key === 'Escape') setText(ms > 0 ? formatTimingMs(ms) : '') }} className="w-20 rounded bg-line p-1 text-center" />
      <span className="flex shrink-0 flex-col gap-px">
        <button type="button" aria-label={`Increase ${label}`} title={`Increase ${label}`} onClick={() => step(100)} className="rounded-sm bg-panel px-1 text-[8px] leading-[9px] hover:bg-panel2">▲</button>
        <button type="button" aria-label={`Decrease ${label}`} title={`Decrease ${label}`} onClick={() => step(-100)} className="rounded-sm bg-panel px-1 text-[8px] leading-[9px] hover:bg-panel2">▼</button>
      </span>
    </div>
  </div>
}

// A Hold / Fade value inside a cuelist step row (Guide ch.11, p.194):
// click the value and type a new one; an empty Hold commits as manual
// (0). The fade value carries LightKey's slope glyph.
function StepTimeCell({ value, emptyLabel, ariaLabel, showSlope, onCommit }: { value: number; emptyLabel: string; ariaLabel: string; showSlope?: boolean; onCommit: (ms: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  if (!editing) {
    return <button type="button" aria-label={ariaLabel} title="Click to edit" onClick={(event) => { event.stopPropagation(); setText(value > 0 ? formatTimingMs(value) : ''); setEditing(true) }} className="flex min-w-0 items-center gap-0.5 rounded px-0.5 text-left hover:bg-panel">
      {showSlope && <span aria-hidden="true" className="shrink-0 text-dim"><svg width="12" height="12" viewBox="0 0 18 18"><line x1="4.5" y1="13.5" x2="13.5" y2="4.5" stroke="currentColor" strokeWidth="1.6" /></svg></span>}
      <span className={`truncate ${value > 0 ? 'text-[#7dd3fc]' : 'text-dim'}`}>{value > 0 ? formatTimingMs(value) : emptyLabel}</span>
    </button>
  }
  return <input autoFocus aria-label={ariaLabel} value={text} onChange={(event) => setText(event.target.value)} onBlur={() => { const parsed = text.trim() === '' ? 0 : parseTimingMs(text); if (parsed !== null) onCommit(parsed); setEditing(false) }} onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); else if (event.key === 'Escape') setEditing(false) }} onClick={(event) => event.stopPropagation()} className="w-16 rounded bg-bg p-0.5 text-center" />
}

// LightKey's inspector rows (Jake's screenshots, 27 Nov 2026): a
// two-column form — label right-aligned, one self-contained mini
// dropdown (or toggle) on the right. Nothing opens a submenu, a
// fly-out or a separate dialog; every setting is edited in place.
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-0.5">
    <span className="text-right text-dim">{label}:</span>
    <div className="min-w-0">{children}</div>
  </div>
}

// LightKey's compact dropdown: a native select styled as a pill with
// a blue up/down chevron at the right edge, exactly as in his
// screenshots. The pill is LightKey's own lavender-grey (#807d9f,
// measured from his 3.32.50 screenshot) with white text — the app's
// dark pills blended into the panel and did not read as controls. A
// native select opens the OS list in place — it is not a submenu.
function MiniSelect({ label, value, onChange, options, disabled }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; disabled?: boolean }[]
  disabled?: boolean
}) {
  return <span className="relative block">
    <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full appearance-none rounded bg-[#807d9f] py-1 pl-2 pr-7 text-[13px] text-white disabled:opacity-40">
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    <span aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 flex-col items-center rounded bg-[#0a84ff] px-1 py-px leading-none text-white"><span className="text-[7px] leading-[6px]">⌃</span><span className="text-[7px] leading-[6px]">⌄</span></span>
  </span>
}

// LightKey's Color control (guide p.204): Automatic, or one of the
// twelve swatches. A colour that is neither is "Custom" — the small
// swatch beside the dropdown picks it with the native colour input,
// so a custom colour never needs a submenu.
function ButtonColorField({ color, onChange }: { color: string | undefined; onChange: (color: string) => void }) {
  const current = color ?? DEFAULT_BUTTON_APPEARANCE_COLOR
  const isAuto = !color || current.toLowerCase() === DEFAULT_BUTTON_APPEARANCE_COLOR
  const match = LIGHTKEY_BUTTON_COLORS.find((c) => c.hex.toLowerCase() === current.toLowerCase())
  const value = isAuto ? 'automatic' : match ? match.hex : 'custom'
  return <span className="flex items-center gap-1">
    <MiniSelect label="Cue colour" value={value} onChange={(next) => { if (next === 'automatic') onChange(DEFAULT_BUTTON_APPEARANCE_COLOR); else if (next !== 'custom') onChange(next) }} options={[{ value: 'automatic', label: 'Automatic' }, ...LIGHTKEY_BUTTON_COLORS.map((c) => ({ value: c.hex, label: c.name })), ...(value === 'custom' ? [{ value: 'custom', label: 'Custom' }] : [])]} />
    <input type="color" aria-label="Custom cue colour" title="Custom colour" value={isAuto ? '#ffffff' : current} onChange={(event) => onChange(event.target.value)} className="h-7 w-8 shrink-0 cursor-pointer rounded bg-bg p-0.5" />
  </span>
}

// One collapsible section of the inspector, in LightKey's order —
// contents, Timing, Button, Modifiers, Live Triggers. (Cuelist and
// annotation targets add their own Font section — the only font UI
// for labels; the button inspector has none, font lives in the
// right-click menu, Jake 27 Nov 2026.)
// A section collapses/expands in place; nothing leaves the panel.
function InspectorSection({ id, title, open, onToggle, children, sectionRef }: {
  id: string
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  sectionRef?: (el: HTMLElement | null) => void
}) {
  return <section ref={sectionRef as never} data-section={id} aria-label={`${title} section`} className="border-b border-line pb-2">
    <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center justify-between py-1 text-left">
      <span className="text-[15px] font-semibold text-text">{title}</span>
      <span aria-hidden="true" className="text-dim">{open ? '⌄' : '›'}</span>
    </button>
    {open && <div className="pt-0.5">{children}</div>}
  </section>
}

export function LiveWorkspace({ masterOverlay = false, toolbarHost = null, inspectorWidth = 340, onInspectorWidthChange }: { masterOverlay?: boolean; toolbarHost?: HTMLElement | null; inspectorWidth?: number; onInspectorWidthChange?: (width: number) => void } = {}) {
  const {
    locked, show, presets, effects, activePresetIds, cueLists, setLivePages, setControlCue, selectLivePage, activeLivePageId,
    activeLiveValues, setLiveValue, manualOverrides, clearManualOverrides, activeCueListId, activeCueRef,
    activeCueIndex, cuePlaying, cuePaused, setCuePaused, goToCue, cueNext, cuePrev, stopCue, deactivateCue, manualCrossfade, manualCrossfadeAnchor, addCueList, updateCueList, renameCueList, addCueToList, addCueToListAt, updateCue, updateCueStep, removeCueStep, renumberCueList, addCueListGroup, addCueListGroupFromSelection, renameCueListGroup, removeCueListGroup, liveEditing, setLiveEditing,
    editCueContents, editCueDefContents, promoteAdHocToPreset, setContentsPreview, setPaletteReveal,
    configureFramePrevNext, startEditingPreset, startEditingLiveEffect, stepLiveFrame,
    configureCueTiming, configureCueAppearance, configureCueModifiers, toggleCueModifier,
    configureFaderControls, configureSpeedModifierOptions,
    configureCuePriority, addOverridesToCues, startEditingCueAdHoc,
    configureControlType, configureControlBehavior,
    selectedPageObjects, pageClipboard, setPageObjectSelection, togglePageObjectSelection,
    selectPageObjectsInRect, clearPageObjectSelection, moveSelectedPageObjects, deleteSelectedPageObjects,
    duplicateSelectedPageObjects, copySelectedPageObjects, pastePageObjects, resizePageObject, resizePageObjectTo, renamePageObject,
    setPageObjectStyle, configureFrame, dropOnLivePage, liveAlignmentOff, setLiveAlignmentOff
  } = useShowStore()
  // Inline cues (Jake, 27 Nov 2026): there is no project-wide cue
  // list any more — `cues` here is the collected view over the Live
  // buttons' inline cues and the cuelist steps' cues, for the call
  // sites that still take a cue list (modifiers, fader controls,
  // button colour); button/step reads below use the holder directly.
  const cues = collectInlineCues(show, cueLists)
  const activeCueId = getActiveCueId({ show, cueLists, activeCueRef })
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
  // Double-click properties popup (LightKey, Jake 18 Nov 2026): a panel
  // EMBEDDED in the Design/Live section beside the canvas (Jake, 28 Nov
  // 2026 — it used to be an absolute overlay sliding in over the canvas;
  // LightKey's sits beside the content, and the canvas keeps scrolling
  // underneath it). Opening it shrinks the canvas area; closing it gives
  // the canvas the full width back. It opens only on double-click;
  // single-click only selects (move/resize). The popup itself scrolls
  // (overflow-y-auto) while the canvas beside it scrolls too, so the
  // button stays visible while its properties are edited. Once open it
  // follows the single selection; close with X, Esc or Done. Its width
  // drags from the left edge (280–520px, default 340) and persists in
  // app preferences like the other panel sizes.
  const [popupOpen, setPopupOpen] = useState(false)
  // Inspector width drag (Jake, 28 Nov 2026): pointer capture on the
  // divider routes the moves to the handle, and window listeners keep
  // the drag alive even where capture is unavailable — the move target
  // is the element under the pointer once it leaves the 6px handle, so
  // capture alone would strand the drag a few pixels in. Dragging left
  // widens the panel (new width = start + startX − clientX). The width
  // commits live through onInspectorWidthChange, which App persists.
  // The click that follows a drag ends up over the canvas (not the
  // handle), so it is suppressed for a beat — otherwise the
  // click-outside handler below would close the inspector the moment
  // the user finishes resizing it.
  const inspectorResize = useRef<{ startX: number; startWidth: number } | null>(null)
  const inspectorResizeEnd = useRef(0)
  const moveInspectorResizeWindow = (event: PointerEvent) => {
    const r = inspectorResize.current
    if (!r || !onInspectorWidthChange) return
    onInspectorWidthChange(clampPanelSize('inspectorWidth', r.startWidth + (r.startX - event.clientX)))
  }
  const endInspectorResizeWindow = () => {
    window.removeEventListener('pointermove', moveInspectorResizeWindow)
    inspectorResize.current = null
    inspectorResizeEnd.current = Date.now()
  }
  const beginInspectorResize = (event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation()
    inspectorResize.current = { startX: event.clientX, startWidth: inspectorWidth }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* jsdom has no pointer capture; the window listeners below still fire. */ }
    window.addEventListener('pointermove', moveInspectorResizeWindow)
    window.addEventListener('pointerup', endInspectorResizeWindow, { once: true })
  }
  const moveInspectorResize = (event: React.PointerEvent) => {
    const r = inspectorResize.current
    if (!r || !onInspectorWidthChange) return
    onInspectorWidthChange(clampPanelSize('inspectorWidth', r.startWidth + (r.startX - event.clientX)))
  }
  const endInspectorResize = () => { endInspectorResizeWindow() }
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
  // Cuelist widget state (Jake, 27 Nov 2026 — LightKey cuelist
  // walkthrough): the cue step whose inspector is open, the steps
  // selected in a widget, the widget's right-click menu, collapsed cue
  // groups, the About Cuelists paragraph, inline renames, and the Hold
  // / Fade cell being typed in — all session-only, never persisted.
  const [inspectorStep, setInspectorStep] = useState<{ listId: string; stepId: string } | null>(null)
  const [selectedSteps, setSelectedSteps] = useState<{ listId: string; stepIds: string[] } | null>(null)
  const [listWidgetMenu, setListWidgetMenu] = useState<{ widgetId: string; listId: string; stepId: string | null; x: number; y: number } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [aboutCuelists, setAboutCuelists] = useState<string | null>(null)
  const [renamingStep, setRenamingStep] = useState<{ listId: string; stepId: string } | null>(null)
  const [renamingList, setRenamingList] = useState<string | null>(null)
  const [renamingGroup, setRenamingGroup] = useState<{ listId: string; groupId: string } | null>(null)
  const [editingCell, setEditingCell] = useState<{ listId: string; stepId: string; field: 'hold' | 'fade' } | null>(null)
  const listMenuRef = useRef<HTMLDivElement>(null)
  const listMenuPos = useClampedMenuPosition(listWidgetMenu?.x ?? 0, listWidgetMenu?.y ?? 0, listMenuRef)
  // While a palette drag hovers the step inspector's contents, LightKey
  // draws a white box around the drop zone (Jake's screenshot 5.20.43).
  const [stepContentsDragOver, setStepContentsDragOver] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Jake, 26 Nov 2026 — the canvas menu used to open at the raw click
  // point and run off the window near the bottom/right edge; it is
  // clamped into the viewport once mounted (see lib/menuPosition).
  const menuPos = useClampedMenuPosition(buttonMenu?.x ?? contextMenu?.x ?? 0, buttonMenu?.y ?? contextMenu?.y ?? 0, menuRef)
  useEffect(() => {
    if (!contextMenu && !buttonMenu && !listWidgetMenu) return
    const close = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setContextMenu(null); setButtonMenu(null) }
      if (listMenuRef.current && !listMenuRef.current.contains(event.target as Node)) setListWidgetMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [contextMenu, buttonMenu, listWidgetMenu])

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
      if (control && !control.cue) setPopupOpen(true)
    }
    window.addEventListener('openlights-open-live-properties', open)
    return () => window.removeEventListener('openlights-open-live-properties', open)
  }, [])

  // Get Info / Show Properties (Video 1) opens the contents inspector
  // for the selected button — cue buttons included — without switching
  // to Design. Edit Ad Hoc Properties on a cue button is the one that
  // switches to Design (startEditingCueAdHoc, via App). The tab in the
  // event detail is the old tabbed inspector's target; with no tabs it
  // now picks which section the panel scrolls to (contents → Contents,
  // options → Timing, button → Button).
  useEffect(() => {
    const open = (event: Event) => {
      const state = useShowStore.getState()
      if (state.locked) return
      const detail = (event as CustomEvent<{ controlId?: string; tab?: 'contents' | 'options' | 'button' }>).detail
      const ref = detail?.controlId ? { type: 'cue' as const, id: detail.controlId } : state.selectedPageObjects[0]
      if (!ref || ref.type !== 'cue') return
      state.setPageObjectSelection([ref])
      const section = detail?.tab === 'options' ? 'timing' : detail?.tab === 'button' ? 'button' : 'contents'
      openSection(section)
      setScrollSection(section)
      setPopupOpen(true)
    }
    window.addEventListener('openlights-open-cue-info', open)
    return () => window.removeEventListener('openlights-open-cue-info', open)
  }, [])

  // The cuelist widget menu (Jake, 27 Nov 2026) opens the step or
  // list inspector and the inline renames through window events, the
  // same decoupling as the button menu's openlights-open-cue-info.
  useEffect(() => {
    const openStep = (event: Event) => {
      const detail = (event as CustomEvent<{ listId?: string; stepId?: string }>).detail
      if (detail?.listId && detail?.stepId) openStepInspector(detail.listId, detail.stepId)
    }
    const openList = (event: Event) => {
      const detail = (event as CustomEvent<{ widgetId?: string }>).detail
      if (detail?.widgetId) openListInspector(detail.widgetId)
    }
    const renameStep = (event: Event) => {
      const detail = (event as CustomEvent<{ listId?: string; stepId?: string }>).detail
      if (!detail?.listId || !detail?.stepId) return
      setRenamingStep({ listId: detail.listId, stepId: detail.stepId })
    }
    const renameList = (event: Event) => {
      const detail = (event as CustomEvent<{ widgetId?: string }>).detail
      if (detail?.widgetId) setRenamingList(detail.widgetId)
    }
    const renameGroup = (event: Event) => {
      const detail = (event as CustomEvent<{ listId?: string; groupId?: string }>).detail
      if (detail?.listId && detail?.groupId) setRenamingGroup({ listId: detail.listId, groupId: detail.groupId })
    }
    window.addEventListener('openlights-open-step-info', openStep)
    window.addEventListener('openlights-open-list-info', openList)
    window.addEventListener('openlights-rename-cue-step', renameStep)
    window.addEventListener('openlights-rename-cuelist', renameList)
    window.addEventListener('openlights-rename-cue-group', renameGroup)
    return () => {
      window.removeEventListener('openlights-open-step-info', openStep)
      window.removeEventListener('openlights-open-list-info', openList)
      window.removeEventListener('openlights-rename-cue-step', renameStep)
      window.removeEventListener('openlights-rename-cuelist', renameList)
      window.removeEventListener('openlights-rename-cue-group', renameGroup)
    }
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
    setInspectorStep(null)
    setPopupOpen(true)
  }

  // Get Info on a cue step (Jake, 27 Nov 2026 — LightKey cuelist
  // walkthrough, screenshot 5.22.16): the floating inspector opens on
  // the step's cue, anchored to the cuelist widget — LightKey shows the
  // cue inspector "to the right of the cuelist" (Guide ch.11, p.191).
  // The widget stays the page-object selection, so the panel anchors
  // to it; the step branch is what the panel renders.
  const openStepInspector = (listId: string, stepId: string) => {
    // Read the widget from the store, not the render's `page`: the
    // window-event listener that calls this keeps the first render's
    // closure, and the page may have changed since.
    const widget = useShowStore.getState().show?.livePages?.flatMap((p) => p.cueListWidgets ?? []).find((w) => w.cueListId === listId)
    if (!widget) return
    setPageObjectSelection([{ type: 'list', id: widget.id }])
    setInspectorStep({ listId, stepId })
    openSection('contents')
    setScrollSection('contents')
    setPopupOpen(true)
  }

  // Get Info on the cuelist widget itself opens the cuelist options
  // (Priority, Size, + – buttons, Xfade slider, Loops — Guide ch.11,
  // p.190), not a step.
  const openListInspector = (widgetId: string) => {
    setPageObjectSelection([{ type: 'list', id: widgetId }])
    setInspectorStep(null)
    openSection('cuelist')
    setScrollSection('cuelist')
    setPopupOpen(true)
  }

  // Deleting a cuelist widget (Jake, 27 Nov 2026 — the widget-scoped
  // lifecycle): select it, then the store's Delete path removes the
  // widget — and the list with it when no other widget shows it. Cut
  // is safe: the clipboard holds the widget, so the list survives a
  // paste. The inspector closes with the widget.
  const removeListWidget = (widgetId: string) => {
    setPageObjectSelection([{ type: 'list', id: widgetId }])
    deleteSelectedPageObjects()
    setInspectorStep(null)
    setPopupOpen(false)
  }

  // Cue contents (Jake, 27 Nov 2026 — LightKey cue editing, Videos 1+2):
  // a button's Get Info list shows what the cue is made of — its presets
  // and sequences (by reference, so a preset edit reaches every cue that
  // uses it) plus its ad-hoc values — followed by the button's own
  // presets / sequences / effects / ad-hoc values. Each row knows its
  // source, so removing it edits the right place.
  type ContentRow = {
    key: string
    kind: 'preset' | 'sequence' | 'effect' | 'ad-hoc' | 'folder'
    id: string
    name: string
    source: 'cue' | 'control'
    values: Record<string, Record<string, number>>
  }
  // LightKey's inspector sections (Jake's screenshots, 27 Nov 2026):
  // one scrollable list of collapsible sections — Contents, Timing,
  // Button, Modifiers, Live Triggers. Activate is the tail of the
  // Button section and Group a label row, not sections (his 5.19.17 /
  // 3.32.58 screenshots). All open by default. The Font section survives
  // only for cuelist/annotation targets, where it is the only font UI.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ contents: true, timing: true, button: true, group: true, modifiers: true, triggers: true, font: false, cuelist: true })
  const toggleSection = (id: string) => setOpenSections((prev) => ({ ...prev, [id]: prev[id] !== false ? false : true }))
  const openSection = (id: string) => setOpenSections((prev) => ({ ...prev, [id]: true }))
  // Which section to scroll to when the inspector opens from a menu
  // item (Get Info → contents; the old Options tab → timing; the old
  // Button tab → button). Consumed once by the scroll effect below.
  const [scrollSection, setScrollSection] = useState<string | null>(null)
  const sectionEls = useRef<Record<string, HTMLElement | null>>({})
  const sectionRef = (id: string) => (el: HTMLElement | null) => { sectionEls.current[id] = el }
  // Closing the popup always clears the step branch, whichever close
  // path ran (×, Escape, blank canvas, Done) — the next open sets it
  // again explicitly.
  useEffect(() => { if (!popupOpen) setInspectorStep(null) }, [popupOpen])

  const workspaceSectionRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
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
    // The contents sub-heading (Jake, 28 Nov 2026 — LightKey's Demo
    // Project "Deep Blue" screenshot): preset rows sit under their ROOT
    // palette folder ("Inner Arc", not "Colors", not the fixture group).
    // One heading per folder, deduped in cue order, only before preset
    // rows — sequences, effects and ad-hoc rows get none, and a preset
    // in no group gets none (no invented "Ungrouped" heading).
    const folderHeading = (presetId: string, source: 'cue' | 'control') => {
      const folder = presetRootFolder(show?.presetGroups ?? [], presetId)
      if (folder && !rows.some((row) => row.kind === 'folder' && row.id === folder.id)) rows.push({ key: `folder:${folder.id}`, kind: 'folder', id: folder.id, name: folder.name, source, values: {} })
    }
    const cue = control.cue
    if (cue) {
      for (const id of cue.presetIds ?? []) {
        const preset = presets.find((p) => p.id === id)
        if (preset) { folderHeading(id, 'cue'); rows.push({ key: `cue:preset:${id}`, kind: 'preset', id, name: preset.name, source: 'cue', values: preset.fixtureValues ?? {} }) }
      }
      for (const id of cue.sequenceIds ?? []) {
        const sequence = show?.sequences?.find((s) => s.id === id)
        if (sequence) rows.push({ key: `cue:sequence:${id}`, kind: 'sequence', id, name: sequence.name, source: 'cue', values: sequenceContentsValues(id) })
      }
      if (Object.keys(cue.fixtureValues ?? {}).length) rows.push({ key: 'cue:ad-hoc', kind: 'ad-hoc', id: `cue:${cue.id}`, name: 'Ad hoc properties', source: 'cue', values: cue.fixtureValues ?? {} })
    }
    for (const id of control.presetIds ?? []) {
      const preset = presets.find((p) => p.id === id)
      if (preset) { folderHeading(id, 'control'); rows.push({ key: `control:preset:${id}`, kind: 'preset', id, name: preset.name, source: 'control', values: preset.fixtureValues ?? {} }) }
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
  // contents highlight (the palette and the Preview follow the row) and
  // the step inspector, unless the new selection is still the widget
  // that owns the open step.
  const selectedObjectId = selectedPageObjects[0]?.id
  useEffect(() => {
    clearContentSelection()
    setSelectedSteps(null)
    if (inspectorStep) {
      const ref = selectedPageObjects[0]
      const stillThere = ref?.type === 'list' && page?.cueListWidgets?.find((w) => w.id === ref.id)?.cueListId === inspectorStep.listId
      if (!stillThere) setInspectorStep(null)
    }
  }, [selectedObjectId])
  const selectContentRow = (row: ContentRow) => {
    // Folder headings are plain labels — they never select or preview.
    if (row.kind === 'folder') return
    setSelectedContentKey(row.key)
    setContentsPreview({ kind: row.kind, id: row.id, values: row.values })
  }
  const removeContentRow = (control: LiveControl, row: ContentRow) => {
    if (row.kind === 'ad-hoc') {
      if (row.source === 'cue' && control.cue) editCueDefContents(control.cue.id, { type: 'clear-ad-hoc' })
      else editCueContents(control.id, { type: 'clear-ad-hoc' })
    } else if (row.kind === 'effect') {
      patchControl(control.id, { effectIds: (control.effectIds ?? []).filter((id) => id !== row.id) })
    } else if (row.source === 'cue' && control.cue) {
      editCueDefContents(control.cue.id, { type: row.kind === 'preset' ? 'remove-preset' : 'remove-sequence', id: row.id })
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
    if (payload.effectIds.length && !control.cue) {
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

  // A cue step's contents (Jake, 27 Nov 2026 — screenshots 5.20.50 /
  // 5.21.53; Jake, 28 Nov 2026 — the "Deep Blue" correction): the
  // preset's ROOT palette folder ("Inner Arc", not the immediate parent
  // "Colors" and NOT the fixture group — the 27 Nov build read the
  // fixture group, which only coincided with the folder in the Demo
  // Project), then one row per property the preset writes — a dimmer row
  // ("☀ 100%") when it writes intensity, a colour row ("● Violet") when
  // it writes colour — then sequences ("↻ name") and the ad-hoc row. A
  // preset in no group gets no heading row. The rows carry the preset
  // id, so the per-row × removes that whole preset from the cue (the
  // reference model has no per-property removal — a preset is one
  // ingredient).
  type StepContentRow = { key: string; kind: 'group' | 'dimmer' | 'colour' | 'preset' | 'sequence' | 'ad-hoc'; label: string; presetId?: string; sequenceId?: string }
  const stepContentsRows = (cue: CueDef): StepContentRow[] => {
    const rows: StepContentRow[] = []
    const fixtures = show?.fixtures ?? []
    for (const presetId of cue.presetIds ?? []) {
      const preset = presets.find((p) => p.id === presetId)
      if (!preset) continue
      const folder = presetRootFolder(show?.presetGroups ?? [], presetId)
      if (folder && !rows.some((row) => row.kind === 'group' && row.label === folder.name)) rows.push({ key: `group:${folder.id}`, kind: 'group', label: folder.name })
      const values = resolveCueValues({ ...cue, presetIds: [presetId], sequenceIds: [], fixtureValues: {} }, presets, fixtures)
      const intensities = Object.values(values).map((patch) => patch.intensity ?? 0)
      const maxIntensity = Math.max(0, ...intensities)
      const hasColour = Object.values(values).some((patch) => (patch.red ?? patch.green ?? patch.blue ?? patch.cyan ?? patch.magenta ?? patch.yellow ?? 0) !== 0)
      if (maxIntensity > 0) rows.push({ key: `preset:${presetId}:dimmer`, kind: 'dimmer', label: `${Math.round((maxIntensity / 255) * 100)}%`, presetId })
      if (hasColour) rows.push({ key: `preset:${presetId}:colour`, kind: 'colour', label: preset.name, presetId })
      if (maxIntensity <= 0 && !hasColour) rows.push({ key: `preset:${presetId}`, kind: 'preset', label: preset.name, presetId })
    }
    for (const sequenceId of cue.sequenceIds ?? []) {
      const sequence = show?.sequences?.find((s) => s.id === sequenceId)
      if (sequence) rows.push({ key: `sequence:${sequenceId}`, kind: 'sequence', label: sequence.name, sequenceId })
    }
    if (Object.keys(cue.fixtureValues ?? {}).length) rows.push({ key: 'ad-hoc', kind: 'ad-hoc', label: 'Ad hoc properties' })
    return rows
  }
  const removeStepContentRow = (cueId: string, row: StepContentRow) => {
    if (row.kind === 'ad-hoc') editCueDefContents(cueId, { type: 'clear-ad-hoc' })
    else if (row.presetId) editCueDefContents(cueId, { type: 'remove-preset', id: row.presetId })
    else if (row.sequenceId) editCueDefContents(cueId, { type: 'remove-sequence', id: row.sequenceId })
  }

  // Dragging presets / sequences into a cue step's contents (Jake's
  // screenshots 5.21.59 / 5.20.43): unlike the button inspector's
  // drop, this is a LIVE-mode flow in LightKey — "Before you can add
  // cues to a cuelist you need to exit the Live view's edit mode"
  // (Guide ch.11, p.191) — so there is no edit-mode gate here. The
  // store's drop has none either; the gate lives only in the button
  // inspector's wrapper, which stays as it is. The contents div's own
  // drag-over must preventDefault in Live mode too — the shared
  // allowDrop only does so while editing, and without a cancelled
  // drag-over the browser never fires the drop (found by the real-app
  // probe, 27 Nov 2026: the drag silently did nothing in Live mode).
  const dropOnStepContents = (event: React.DragEvent, cueId: string) => {
    const payload = readDrop(event)
    if (!payload) return
    event.preventDefault(); event.stopPropagation()
    dropOnLivePage({ ...payload, effectIds: [] }, { kind: 'cue', cueId })
  }

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
      const cue = control.cue
      const presetCount = [...(cue?.presetIds ?? []), ...(control.presetIds ?? [])].length
      const sequenceIds = [...(cue?.sequenceIds ?? []), ...(control.sequenceIds ?? [])]
      if (presetCount > 0 || sequenceIds.length !== 1) return null
      const scale = show?.sequences?.find((s) => s.id === sequenceIds[0])?.timeScale
      return scale && scale !== 1 ? `${scale}x` : null
    })()
    // A Push Button with Toggle behaviour latches (click once on, click
    // again off — guide p.204, Jake 27 Nov 2026); with Flash behaviour
    // it is active only while held. A fader renders as its own track
    // (LightKey guide ch.11, pp.179, 215–216; Jake's screenshots,
    // 27 Nov 2026 — the Spots Left/Right faders): vertical track with
    // tick marks and the name at the end, horizontal track with the name
    // and % below it. Dragging it writes the assigned property live
    // through setLiveValue (the same 0–255 level a push button's fader
    // level uses).
    const latching = isLatchingControl(control)
    const flash = isFlashControl(control)
    if (isFaderControl(control)) {
      return <LiveFader control={control} level={level} onChange={(value) => setLiveValue(control.id, value)} textColor={textColor} />
    }
    return <button type="button" aria-pressed={level > 0} style={{ ...css(control.style), color: textColor, backgroundColor: 'transparent', minHeight: 0, fontWeight: level ? 700 : 500 }} className="pad w-full flex-1 rounded px-2 py-1" onClick={latching ? () => setLiveValue(control.id, level ? 0 : 255) : undefined} onPointerDown={flash ? (e) => { if (!editing) e.currentTarget.setPointerCapture(e.pointerId); setLiveValue(control.id, 255) } : undefined} onPointerUp={flash ? () => setLiveValue(control.id, 0) : undefined} onPointerCancel={flash ? () => setLiveValue(control.id, 0) : undefined} onKeyDown={flash ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setLiveValue(control.id, 255) } } : undefined} onKeyUp={flash ? () => setLiveValue(control.id, 0) : undefined} onBlur={flash ? () => setLiveValue(control.id, 0) : undefined}>{control.effectIds?.length ? '∿ ' : ''}{control.name}{sequenceSpeed ? ` ${sequenceSpeed}` : ''}{flash && ' (hold)'}</button>
  }

  // No attach dropdown: buttons attach by touching (Guide
  // ch.11, pp.183–184) — the exclusive behaviour is derived from
  // positions by touchingGroupSiblings, not from a stored link (Jake,
  // 27 Nov 2026). The attachedTo field, the attachPageObject store
  // action and the Always-active guard's use of it stay for existing
  // show files; there is just no UI to set it anymore.

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
      if (isFlashControl(control) && state.activeLiveValues[control.id]) state.setLiveValue(control.id, 0)
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
  // "Insert Cuelist" creates the list and places its widget on the
  // page in one go, LightKey's way (Guide ch.11 p.189: a cuelist is an
  // object placed on the page). There used to be two menu items — "New
  // Cue List" (create + place) and "Insert Cuelist" (place the first
  // existing list, disabled when the project had none) — but Jake's
  // screenshot 5.20.12 shows LightKey's canvas menu with only "Insert
  // Cuelist", and on his fresh page that one item produced the empty
  // widget. So Insert Cuelist IS the create path now; placing an
  // existing list on another page is done from the list inspector's
  // Cue list picker. One cuelist widget per page (LightKey: a page
  // can't contain more than one cuelist).
  const addNewList = (at?: { x: number; y: number }) => {
    if (!page) return
    if ((page.cueListWidgets ?? []).length > 0) return
    const listId = addCueList()
    const point = at ?? position(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const widget = { ...newWidgetObject(crypto.randomUUID(), listId, point.x, point.y, page.defaultStyles), width: 480, height: 300 }
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
  // Inputs inside a button (the fader track) keep their own behaviour —
  // a press on one never arms a drag. The fader track is a div, not an
  // input, so it is excluded by its data-fader-track marker.
  const onControlPointerDown = (event: React.PointerEvent, ref: Selection, x: number, y: number) => {
    if (event.shiftKey && editing && !locked) { togglePageObjectSelection(ref); return }
    selectRef(ref)
    if (!editing || locked || event.button !== 0) return
    if ((event.target as HTMLElement).closest('input, select, textarea, [data-fader-track]')) return
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
    if (control && isFlashControl(control) && (activeLiveValues[control.id] ?? 0) > 0) setLiveValue(control.id, 0)
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
  const cueTiming = selectedControl ? { fadeInMs: 0, fadeOutMs: 0, delayMs: 0, ...selectedControl.timing } : null
  // Scroll the requested section into view once when the inspector
  // opens from a menu item (Get Info → Contents, and so on).
  useEffect(() => {
    if (!popupOpen || !scrollSection) return
    // jsdom has no scrollIntoView; the optional call keeps the rendered
    // tests (and any headless host) from throwing — in the real app
    // Chromium always provides it.
    sectionEls.current[scrollSection]?.scrollIntoView?.({ block: 'nearest' })
    setScrollSection(null)
  }, [popupOpen, scrollSection])
  // Close the inspector with Escape in Live mode (Edit mode's own
  // keydown handler already closes it there) and by clicking blank
  // canvas. A click on another control only re-targets the inspector
  // (it follows the selection); clicks on menus, toolbar buttons and
  // anything outside the workspace leave it open, so a palette drag
  // into the contents list keeps working — a drag never produces the
  // click that would close it.
  useEffect(() => {
    if (!popupOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (editing) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key === 'Escape') setPopupOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || panelRef.current?.contains(target)) return
      // The click that ends an inspector-width drag lands on the canvas
      // (Jake, 28 Nov 2026 — found by the real-app probe): it must not
      // close the panel the user just resized.
      if (Date.now() - inspectorResizeEnd.current < 200) return
      if (target.closest('[data-project-id], [data-page-object], [role="menu"], button')) return
      if (workspaceSectionRef.current?.contains(target)) setPopupOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('click', onClick) }
  }, [popupOpen, editing])
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
  // The floating inspector's title is the selected object's name,
  // centred like LightKey's panel — no "properties" header, no Name
  // field (renaming stays in the Rename menu item).
  // The step inspector's title is the step's cue name (LightKey's
  // inspector is titled with the cue — Jake's screenshot 5.22.16,
  // "002 New Cue"); otherwise the selected object's name.
  const inspectorStepDef = inspectorStep
    ? cueLists.find((l) => l.id === inspectorStep.listId)?.steps.find((s) => s.id === inspectorStep.stepId)
    : undefined
  const inspectorStepCue = inspectorStepDef ? inspectorStepDef.cue : undefined
  const panelTitle = inspectorStepCue?.name ?? selectedControl?.name ?? (selectedList ? cueLists.find((l) => l.id === selectedList.cueListId)?.name ?? 'Cue List' : selectedAnnotation?.text ?? 'Properties')
  return <section ref={workspaceSectionRef as never} data-context-menu="page" aria-label="Live page canvas" className={`relative flex h-full flex-col gap-2 rounded ${panelBorder} p-3`} onContextMenu={openContextMenu}>
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
          return <div key={item.id} data-page-object={`annotation:${item.id}`} className={`absolute ${item.type === 'frame' ? 'border border-line rounded' : ''} ${editing && !locked && isSelected(ref) ? 'outline outline-1 outline-[var(--accent)]' : ''}`} style={{ left: rx, top: ry, width: w, height: h, pointerEvents: item.type === 'frame' && editing && !locked ? 'auto' : 'none' }} onDragOver={item.type === 'frame' ? allowDrop : undefined} onDrop={item.type === 'frame' ? (event) => dropAt(event, item.id) : undefined}>
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
          const buttonColor = liveControlButtonColor(control, presets) ?? '#ffffff'
          const buttonActive = level > 0
          const textColor = control.style?.color && control.style.color.toLowerCase() !== '#e5e7eb' ? control.style.color : liveButtonTextColor(buttonColor, buttonActive)
          return <div key={control.id} data-project-id={control.id} data-page-object={`cue:${control.id}`} className={`absolute select-none rounded border p-1 text-xs ${editing && !locked ? 'cursor-grab' : ''}`} style={{ left: x, top: y, width: w, height: h, overflow: 'hidden', backgroundColor: liveButtonBackground(buttonColor, buttonActive), borderColor: isSelected(ref) ? (editing ? '#facc15' : 'var(--accent)') : buttonColor, borderStyle: namingControlId === control.id ? 'dashed' : undefined, color: textColor }} onPointerDown={(e) => onControlPointerDown(e, ref, x, y)} onPointerMove={onControlPointerMove} onPointerUp={onControlPointerUp} onPointerCancel={onControlPointerCancel} onClickCapture={onControlClickCapture} onDoubleClick={() => openPropertiesPopup(ref)} onDragOver={allowDrop} onDrop={(event) => dropOnCue(event, control.id)}>
            {namingControlId === control.id ? <input autoFocus aria-label="Cue name" title="Enter a cue name and press Return" placeholder="Enter a cue name and press Return" defaultValue={control.name} className="w-full rounded bg-bg p-1 text-xs" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const value = (e.target as HTMLInputElement).value.trim(); if (value) patchControl(control.id, { name: value }); setNamingControlId(null) } else if (e.key === 'Escape') setNamingControlId(null) }} onBlur={(e) => { const value = e.target.value.trim(); if (value) patchControl(control.id, { name: value }); setNamingControlId(null) }} /> : <div className="flex h-full flex-col">{cueBody(control, level, textColor)}</div>}
            {resizeHandle(ref, x, y, w, h)}
          </div>
        })}
        {(page.cueListWidgets ?? []).map((widget) => {
          const list = cueLists.find((item) => item.id === widget.cueListId), x = resizeDraft?.id === widget.id ? resizeDraft.x : draft?.id === widget.id ? draft.x : widget.x, y = resizeDraft?.id === widget.id ? resizeDraft.y : draft?.id === widget.id ? draft.y : widget.y, current = activeCueListId === list?.id ? activeCueIndex : -1
          const ref: PageObjectRef = { type: 'list', id: widget.id }
          const lw = widget.width ?? LIVE_LIST_SIZE.width, lh = widget.height ?? LIVE_LIST_SIZE.height
          const w = resizeDraft?.id === widget.id ? resizeDraft.width : lw, h = resizeDraft?.id === widget.id ? resizeDraft.height : lh
          // Transport state (Guide ch.11, p.218 + Jake's screenshots
          // 5.22.44 / 5.22.25 / 5.22.11 / 5.20.25): Go shows ▶ when
          // stopped and ■ when playing; Pause is dimmed when stopped.
          // The third button is the guide's Next button (click = next
          // cue, Shift+click = previous cue, p.218) — but its GLYPH
          // mirrors the manual-crossfade direction: » while a crossfade
          // is in progress, « at rest. In all four screenshots it is «
          // at rest, even with a next cue available (5.22.11: 001
          // current, 002 next, still «), and » only mid-crossfade
          // (5.22.44: Xfade 58%). The glyph is the crossfade state,
          // not the click's direction — that reading is the guide's
          // function + the screenshots' icon, and Jake can settle it
          // in one tap (see the report).
          const playing = cuePlaying && activeCueListId === list?.id && current >= 0
          // Go restarts from the first enabled cue (Jake, 28 Nov 2026:
          // in LightKey the Play button starts from cue 1 again when
          // the list is stopped or finished) — not from the current
          // step, and not by advancing past the end (which does
          // nothing once the list has finished).
          const firstIndex = list?.steps.findIndex((s) => !s.disabled) ?? -1
          const xfadeProgress = activeCueListId === list?.id && current >= 0 ? manualCrossfadeProgress(manualCrossfadeAnchor, manualCrossfade) : 0
          const goingForward = xfadeProgress > 0
          const items = list ? orderedCuelistItems(list) : []
          const widgetSelectedSteps = selectedSteps && selectedSteps.listId === list?.id ? selectedSteps.stepIds : []
          const selectStep = (stepId: string, additive: boolean) => {
            if (!list) return
            setSelectedSteps((prev) => {
              const ids = prev?.listId === list.id ? prev.stepIds : []
              if (additive) return { listId: list.id, stepIds: ids.includes(stepId) ? ids.filter((id) => id !== stepId) : [...ids, stepId] }
              return { listId: list.id, stepIds: [stepId] }
            })
          }
          const openWidgetMenu = (event: React.MouseEvent, stepId: string | null) => {
            // The cuelist menu is a LIVE-mode menu (Jake, 28 Nov 2026 —
            // correction: new cues are NOT added in Edit mode; the
            // earlier change opening it in Edit mode was wrong and has
            // been reverted). In Edit mode the click falls through to
            // the blank-canvas menu, which is the menu for moving,
            // duplicating and deleting page objects.
            if (editing || locked) return
            event.preventDefault(); event.stopPropagation()
            selectRef(ref)
            if (stepId) selectStep(stepId, false)
            setListWidgetMenu({ widgetId: widget.id, listId: list?.id ?? '', stepId, x: event.clientX, y: event.clientY })
          }
          return <div key={widget.id} data-page-object={`list:${widget.id}`} data-cuelist-widget={list?.id} className={`absolute flex flex-col rounded border ${isSelected(ref) ? 'border-accent' : 'border-line'} bg-panel2 p-2 ${list?.textSize === 'large' ? 'text-sm' : 'text-xs'}`} style={{ left: x, top: y, width: w, height: h, overflow: 'hidden' }} onDragOver={allowDrop} onDrop={(event) => dropOnList(event, list?.id)} onContextMenu={(event) => openWidgetMenu(event, null)}>
            <div className={editing ? 'flex cursor-grab items-center justify-between gap-2 rounded bg-bg p-1' : 'flex items-center justify-between gap-2'} style={css(widget.style)} onPointerDown={(e) => { selectRef(ref); beginDrag(e, ref, x, y) }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }}>
              {renamingList === widget.id ? <input autoFocus aria-label="Cuelist name" defaultValue={list?.name ?? ''} className="min-w-0 flex-1 rounded bg-bg p-1 text-xs" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const value = (e.target as HTMLInputElement).value.trim(); if (value && list) renameCueList(list.id, value); setRenamingList(null) } else if (e.key === 'Escape') setRenamingList(null) }} onBlur={(e) => { const value = e.target.value.trim(); if (value && list) renameCueList(list.id, value); setRenamingList(null) }} /> : <span className="min-w-0 truncate font-semibold">{editing && !locked && '↕ '}{list?.name ?? 'Missing cue list'}</span>}
              {/* No Edit button on the widget (Jake, 28 Nov 2026):
                  LightKey's cuelist has none — the "Edit" in his
                  screenshot was the Live view's Edit button, not the
                  widget's. The earlier button here (which opened the
                  list inspector) was an approximation read from that
                  screenshot and has been removed; the list inspector
                  opens via right-click → Get Info. */}
            </div>
            {list ? (
              <div className="mt-1 flex min-h-0 flex-1 gap-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="grid grid-cols-[16px_14px_minmax(0,1fr)_64px_72px_36px] gap-1 border-b border-line pb-0.5 text-dim">
                    <span />
                    <span />
                    <span>Name</span>
                    <span className="whitespace-nowrap">Hold Time</span>
                    <span className="whitespace-nowrap">Fade Time</span>
                    {/* No heading here: this column is the step +/−
                        buttons, not Xfade — the Xfade heading sits over
                        the slider at the widget's right edge (Jake, 28
                        Nov 2026). */}
                    <span />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto" aria-label={`${list.name} cues`}>
                    {list.steps.length === 0 ? (
                      // LightKey's empty cuelist (Jake's screenshot
                      // 5.20.25): the columns, transport and Xfade still
                      // show — the placeholder lives in the steps area:
                      // "Cuelist / Use cuelists to recall lighting cues
                      // in a predefined order / [About Cuelists]".
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <p className="font-semibold">Cuelist</p>
                        <p className="text-dim">Use cuelists to recall lighting cues in a predefined order</p>
                        <button type="button" className="rounded border border-line px-2 py-1 hover:bg-panel" onClick={() => setAboutCuelists(aboutCuelists === list.id ? null : list.id)}>About Cuelists</button>
                        {aboutCuelists === list.id && <p className="text-dim">A cuelist recalls lighting cues in a predefined order. Right-click the cuelist and choose New Cue, then drag presets and sequences into the cue to build it (Guide ch.11, pp.189–191).</p>}
                      </div>
                    ) : items.map((item) => {
                      if (item.kind === 'group') {
                        const group = item.group
                        const collapsed = collapsedGroups[group.id] === true
                        const memberIds = list.steps.filter((s) => s.groupId === group.id).map((s) => s.id)
                        const allSelected = memberIds.length > 0 && memberIds.every((id) => widgetSelectedSteps.includes(id))
                        return <div key={`group:${group.id}`} className="flex items-center gap-1 py-1" style={{ paddingLeft: item.depth * 12 }}>
                          <button type="button" aria-label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`} title={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`} onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group.id]: !collapsed }))} className="w-4 shrink-0 rounded text-dim hover:bg-panel">{collapsed ? '▸' : '▾'}</button>
                          <span aria-hidden="true" className="shrink-0 text-dim">📁</span>
                          {renamingGroup?.groupId === group.id && renamingGroup.listId === list.id ? <input autoFocus aria-label="Group name" defaultValue={group.name} className="min-w-0 flex-1 rounded bg-bg p-0.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const value = (e.target as HTMLInputElement).value.trim(); if (value) renameCueListGroup(list.id, group.id, value); setRenamingGroup(null) } else if (e.key === 'Escape') setRenamingGroup(null) }} onBlur={(e) => { const value = e.target.value.trim(); if (value) renameCueListGroup(list.id, group.id, value); setRenamingGroup(null) }} /> : <button type="button" aria-label={`Select ${group.name} cues`} title="Select this group's cues" onClick={() => setSelectedSteps({ listId: list.id, stepIds: allSelected ? [] : memberIds })} onDoubleClick={() => setRenamingGroup({ listId: list.id, groupId: group.id })} className="min-w-0 flex-1 truncate text-left font-semibold hover:bg-panel">{group.name}</button>}
                          <button type="button" aria-label={`Delete group ${group.name}`} title="Delete group (its cues stay, ungrouped)" onClick={() => removeCueListGroup(list.id, group.id)} className="shrink-0 rounded px-1 text-dim hover:bg-panel">×</button>
                        </div>
                      }
                      const step = item.step
                      const index = list.steps.indexOf(step)
                      const stepCue = step.cue
                      const group = list.groups?.find((g) => g.id === step.groupId)
                      if (group && collapsedGroups[group.id] === true) return null
                      // Active means this step's cue is the one playing —
                      // the list position alone is not enough:
                      // deactivateCue keeps the index, so a deactivated
                      // step would otherwise still read as active.
                      const active = activeCueListId === list.id && current === index && cuePlaying && activeCueId === step.cue.id
                      const selected = widgetSelectedSteps.includes(step.id)
                      return (
                        <div key={step.id} aria-label={stepCue?.name ?? 'Missing cue'} className={`grid cursor-default grid-cols-[16px_14px_minmax(0,1fr)_64px_72px_36px] items-center gap-1 rounded py-1 ${active ? 'bg-accent/20' : selected ? 'bg-panel' : ''}`} style={{ paddingLeft: item.depth * 12 }} onClick={(event) => selectStep(step.id, event.shiftKey || event.metaKey || event.ctrlKey)} onDoubleClick={() => goToCue(list.id, index)} onContextMenu={(event) => openWidgetMenu(event, step.id)}>
                          <input type="checkbox" aria-label={`Include ${stepCue?.name ?? 'cue'} in playback`} title={step.disabled ? 'Skipped during playback — check to include' : 'Included in playback — uncheck to skip'} checked={!step.disabled} onChange={() => updateCueStep(list.id, step.id, { disabled: !step.disabled ? true : undefined })} onClick={(event) => event.stopPropagation()} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                          <span aria-hidden="true" className="w-3.5 text-center text-[10px] leading-none text-[#38bdf8]">{active ? '▶' : ''}</span>
                          {renamingStep?.stepId === step.id && renamingStep.listId === list.id ? <input autoFocus aria-label="Cue name" defaultValue={stepCue?.name ?? ''} className="min-w-0 rounded bg-bg p-0.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { const value = (e.target as HTMLInputElement).value.trim(); if (value && stepCue) updateCue(stepCue.id, { name: value }); setRenamingStep(null) } else if (e.key === 'Escape') setRenamingStep(null) }} onBlur={(e) => { const value = e.target.value.trim(); if (value && stepCue) updateCue(stepCue.id, { name: value }); setRenamingStep(null) }} /> : <span className={`min-w-0 truncate ${active ? 'font-semibold text-[#7dd3fc]' : ''}`}>{stepCue?.name ?? 'Missing cue'}</span>}
                          <StepTimeCell value={step.holdMs} emptyLabel="—" ariaLabel={`Hold time for ${stepCue?.name ?? 'cue'}`} onCommit={(ms) => updateCueStep(list.id, step.id, { holdMs: ms })} />
                          <StepTimeCell value={step.fadeMs} emptyLabel="—" ariaLabel={`Fade time for ${stepCue?.name ?? 'cue'}`} showSlope onCommit={(ms) => updateCueStep(list.id, step.id, { fadeMs: ms })} />
                          {list.showStepButtons !== false ? <span className="flex shrink-0 items-center gap-0.5">
                            <button type="button" aria-label={`Add cue below ${stepCue?.name ?? 'cue'}`} title="Add cue below (Shift-click: above)" onClick={(event) => { event.stopPropagation(); const cueId = addCueToListAt(list.id, event.shiftKey ? index : index + 1); const created = useShowStore.getState().cueLists.find((l) => l.id === list.id)?.steps.find((s) => s.cue.id === cueId); if (created) openStepInspector(list.id, created.id) }} className="rounded px-1 hover:bg-panel">+</button>
                            <button type="button" aria-label={`Remove ${stepCue?.name ?? 'cue'}`} title="Remove cue" onClick={(event) => { event.stopPropagation(); removeCueStep(list.id, step.id) }} className="rounded px-1 hover:bg-panel">−</button>
                          </span> : <span />}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {/* Transport (Guide ch.11, p.218): Go / Stop, Pause,
                    Next / Previous — big pill buttons, the way LightKey
                    draws them, stacked between the steps and the Xfade
                    fader. Go starts from the first enabled cue when the
                    list is stopped or finished (Jake, 28 Nov 2026:
                    LightKey's Play button restarts from cue 1); while
                    playing it is Stop. Shift-click on the third
                    button reverses it. */}
                <div className="flex w-14 shrink-0 flex-col gap-2 pt-5">
                  <button type="button" aria-label={playing ? 'Stop cuelist' : 'Go'} title={playing ? 'Stop — deactivate the cuelist' : 'Go — start playback'} onClick={() => { if (playing) stopCue(); else if (firstIndex >= 0) goToCue(list.id, firstIndex) }} className="rounded-lg bg-panel py-2 text-base hover:bg-panel2 disabled:opacity-40">{playing ? '■' : '▶'}</button>
                  <button type="button" aria-label={cuePaused ? 'Resume cuelist' : 'Pause cuelist'} title={cuePaused ? 'Resume — the hold time runs again' : 'Pause — the hold time stops running'} onClick={() => setCuePaused(!cuePaused)} disabled={!playing} className="rounded-lg bg-panel py-2 text-base hover:bg-panel2 disabled:opacity-40">❚❚</button>
                  <button type="button" aria-label="Next cue" title="Next cue (Shift-click: previous cue)" onClick={(event) => { if (event.shiftKey) cuePrev(); else cueNext() }} className="rounded-lg bg-panel py-2 text-base hover:bg-panel2 disabled:opacity-40">{goingForward ? '»' : '«'}</button>
                </div>
                {list.showXfade !== false && <div className="flex w-8 shrink-0 flex-col">
                  {/* The "Xfade" heading sits over the slider itself
                      (Jake, 28 Nov 2026) — it used to label the step
                      +/− column in the header grid, ~190px left of the
                      slider. The label replaces the pt-5 the column
                      used to clear the header row, so the slider starts
                      where the steps start. */}
                  <span className="shrink-0 whitespace-nowrap border-b border-line pb-0.5 text-center text-dim">Xfade</span>
                  <XfadeSlider vertical listId={list.id} />
                </div>}
              </div>
            ) : null}
            {resizeHandle(ref, x, y, w, h)}
          </div>
        })}
      </div></div>
      {/* Button properties inspector — LightKey's panel (Jake, 27 Nov
          2026; embedded Jake, 28 Nov 2026): a flex sibling of the canvas
          viewport in the same row, NOT an overlay — opening it shrinks
          the canvas area (the canvas keeps scrolling beside it) and
          closing it gives the canvas the full width back. Title centred,
          × top-left, one scrollable list of collapsible sections
          (Contents, Timing, Button, Modifiers, Live Triggers). Activate
          is the tail of the Button section and Group a label row, not
          sections. No tabs, no Name field, no Font section, no attach
          dropdown — font lives in the right-click menu and buttons attach
          by touching (Guide ch.11, pp.183–184). It follows the single
          selection while open; close with X, Esc, Done or a click on
          blank canvas. The thin divider on its left edge drags to resize
          it (280–520px, persisted in app preferences). No slide-in
          animation any more — an in-flow panel has nothing to slide over. */}
      {!locked && popupOpen && selection && <div className="flex min-h-0 shrink-0">
        <div role="separator" aria-label="Resize properties panel" aria-orientation="vertical" title="Drag to resize the properties panel" className="w-1.5 shrink-0 cursor-ew-resize touch-none rounded hover:bg-accent/40" onPointerDown={beginInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={endInspectorResize} onPointerCancel={endInspectorResize} />
        <div ref={panelRef} role="dialog" aria-label={`${panelTitle} inspector`} data-fields={inspectorFieldList.join(',')} style={{ width: inspectorWidth }} className="live-properties-popup min-h-0 overflow-y-auto rounded-xl border border-line bg-panel2 p-3 text-[13px] shadow-2xl">
        <div className="relative mb-1">
          <button type="button" aria-label="Close properties popup" title="Close properties popup" onClick={() => setPopupOpen(false)} className="absolute left-0 top-0 rounded px-1.5 text-lg leading-none hover:bg-panel">×</button>
          <h3 className="text-center text-[15px] font-semibold">{panelTitle}</h3>
        </div>
        {selectedControl && cueTiming && <div className="space-y-1">
          {isAmbienceControl ? <>
            <InspectorSection id="timing" title="Timing" open={openSections.timing !== false} onToggle={() => toggleSection('timing')} sectionRef={sectionRef('timing')}>
              <TimingInput label="Fade In" direction="in" ms={cueTiming.fadeInMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeInMs: ms })} />
              <TimingInput label="Fade Out" direction="out" ms={cueTiming.fadeOutMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeOutMs: ms })} />
            </InspectorSection>
            <InspectorSection id="button" title="Button" open={openSections.button !== false} onToggle={() => toggleSection('button')} sectionRef={sectionRef('button')}>
              <FieldRow label="Color"><ButtonColorField color={selectedControl.appearance?.color} onChange={(color) => configureCueAppearance(selectedControl.id, { color })} /></FieldRow>
              <FieldRow label="Priority"><MiniSelect label="Cue priority" value={String(selectedControl.priority ?? DEFAULT_CUE_PRIORITY)} onChange={(value) => configureCuePriority(selectedControl.id, Number(value))} options={[9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) => ({ value: String(v), label: cuePriorityLabel(v) }))} /></FieldRow>
              <label className="flex items-center gap-1 py-0.5 text-dim"><input type="checkbox" checked={selectedControl.appearance?.releaseOthers === true} onChange={(event) => configureCueAppearance(selectedControl.id, { releaseOthers: event.target.checked })} /> Release other buttons</label>
              {/* Activate is the tail of LightKey's Button section, not
                  its own section (Jake's screenshots 5.19.17 / 3.32.50). */}
              <FieldRow label="Activate"><span className="flex flex-col gap-0.5">
                <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.activateAtStartup === true} onChange={(event) => patchControl(selectedControl.id, { activateAtStartup: event.target.checked })} /> At startup</label>
                <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.activateBeforeQuitting === true} onChange={(event) => patchControl(selectedControl.id, { activateBeforeQuitting: event.target.checked })} /> Before quitting</label>
              </span></FieldRow>
            </InspectorSection>
          </> : <>
            {/* LightKey's sections (Jake, 27 Nov 2026): one scrollable
                list — Contents, Timing, Button, Modifiers, Live
                Triggers; Activate is the tail of the Button section and
                Group a label row after it. "Get Info" and "Show
                Properties" both open this same inspector — the guide
                uses Get Info for Live objects and Show Properties for
                Design objects, and no source shows a second panel for a
                button. No Font section: font lives in the right-click
                menu (Jake, 27 Nov 2026). No attach dropdown: buttons
                attach by touching (Guide ch.11, pp.183–184). */}
            <InspectorSection id="contents" title="Contents" open={openSections.contents !== false} onToggle={() => toggleSection('contents')} sectionRef={sectionRef('contents')}>
              {(() => {
                // The contents line (Jake's screenshot, 27 Nov 2026 —
                // "Spots / Dimmer FS1"): the frame the button sits in,
                // then the first preset in the cue. No frame, no prefix.
                const frameId = page ? frameForCue(page, selectedControl.id) : null
                const frameName = frameId ? page?.annotations?.find((a) => a.id === frameId)?.text : undefined
                const firstPreset = contentsRows(selectedControl).find((row) => row.kind === 'preset')
                return <div className="text-dim">{frameName ? `${frameName} / ` : ''}{firstPreset?.name ?? selectedControl.name}</div>
              })()}
              <div role="list" aria-label="Cue contents" onDragOver={allowDrop} onDrop={(event) => dropOnContents(event, selectedControl)}>
                {contentsRows(selectedControl).map((row) => {
                  // The folder sub-heading is a plain label row (Jake,
                  // 28 Nov 2026) — no ×, no selection, the same dim
                  // style as the step inspector's group rows.
                  if (row.kind === 'folder') return <p key={row.key} className="px-1 py-0.5 text-dim">{row.name}</p>
                  return (
                  <div key={row.key} role="listitem" aria-selected={selectedContentKey === row.key} className={`flex items-center gap-1 rounded px-1 py-0.5 ${selectedContentKey === row.key ? 'bg-panel font-semibold' : 'hover:bg-panel'}`} onClick={() => selectContentRow(row)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); selectContentRow(row); setContentsMenu({ x: event.clientX, y: event.clientY, row }) }}>
                    <span aria-hidden="true">{row.kind === 'preset' ? '●' : row.kind === 'sequence' ? '↻' : row.kind === 'effect' ? '∿' : '✎'}</span>
                    <span className={`min-w-0 flex-1 truncate ${row.kind === 'ad-hoc' ? 'italic' : ''}`}>{row.name}</span>
                    {row.source === 'cue' && <span className="text-dim" title="Stored in the cue">cue</span>}
                    <button type="button" aria-label={`Remove ${row.name} from cue`} title={`Remove ${row.name} from cue`} onClick={(event) => { event.stopPropagation(); removeContentRow(selectedControl, row) }}>×</button>
                  </div>
                  )
                })}
                {!contentsRows(selectedControl).length && <span className="text-dim">Empty — drag presets or sequences here</span>}
              </div>
              {!contentsRows(selectedControl).some((row) => row.kind === 'ad-hoc') && <span className="text-dim">Ad hoc properties — none</span>}
              {(() => {
                const row = contentsRows(selectedControl).find((item) => item.key === selectedContentKey && item.kind === 'ad-hoc')
                if (!row) return null
                return <div>
                  <h4 className="font-semibold text-text">Ad hoc properties</h4>
                  {Object.entries(row.values).flatMap(([fixtureId, values]) => Object.entries(values).map(([property, value]) => <label key={`${fixtureId}:${property}`} className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate">{fixtureId} · {property}</span><input aria-label={`${fixtureId} ${property}`} type="number" min="0" max="255" value={value} className="w-16 rounded bg-bg p-1" onChange={(event) => row.source === 'cue' && selectedControl.cue ? editCueDefContents(selectedControl.cue.id, { type: 'set-ad-hoc', fixtureId, property, value: Number(event.target.value) }) : editCueContents(selectedControl.id, { type: 'set-ad-hoc', fixtureId, property, value: Number(event.target.value) })} /><button type="button" aria-label={`Remove ${fixtureId} ${property}`} onClick={() => row.source === 'cue' && selectedControl.cue ? editCueDefContents(selectedControl.cue.id, { type: 'remove-ad-hoc', fixtureId, property }) : editCueContents(selectedControl.id, { type: 'remove-ad-hoc', fixtureId, property })}>×</button></label>))}
                </div>
              })()}
            </InspectorSection>
            <InspectorSection id="timing" title="Timing" open={openSections.timing !== false} onToggle={() => toggleSection('timing')} sectionRef={sectionRef('timing')}>
              <TimingInput label="Fade In" direction="in" ms={cueTiming.fadeInMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeInMs: ms })} />
              <TimingInput label="Fade Out" direction="out" ms={cueTiming.fadeOutMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeOutMs: ms })} />
            </InspectorSection>
            <InspectorSection id="button" title="Button" open={openSections.button !== false} onToggle={() => toggleSection('button')} sectionRef={sectionRef('button')}>
              <FieldRow label="Type"><MiniSelect label="Cue control type" value={selectedControl.type} onChange={(value) => configureControlType(selectedControl.id, value as LiveControl['type'])} options={(Object.keys(BUTTON_TYPE_LABELS) as LiveControl['type'][]).map((type) => ({ value: type, label: BUTTON_TYPE_LABELS[type] }))} /></FieldRow>
              {selectedControl.type === 'push' && <FieldRow label="Behavior"><MiniSelect label="Push button behavior" value={controlBehavior(selectedControl)} onChange={(value) => configureControlBehavior(selectedControl.id, value as 'toggle' | 'flash')} options={[{ value: 'toggle', label: 'Toggle' }, { value: 'flash', label: 'Flash' }]} /></FieldRow>}
              {isFaderControl(selectedControl) && <FieldRow label="Controls"><MiniSelect label="Fader controls" value={faderControlsValue(selectedControl)} onChange={(value) => configureFaderControls(selectedControl.id, value as 'all' | FaderControlProperty)} options={faderControlsDropdownOptions(selectedControl, presets, show?.fixtures ?? []).map((option) => ({ value: option.value, label: option.label, disabled: !option.enabled }))} /></FieldRow>}
              <FieldRow label="Priority"><MiniSelect label="Cue priority" value={String(selectedControl.priority ?? DEFAULT_CUE_PRIORITY)} onChange={(value) => configureCuePriority(selectedControl.id, Number(value))} options={[9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) => ({ value: String(v), label: cuePriorityLabel(v) }))} /></FieldRow>
              <FieldRow label="Color"><ButtonColorField color={selectedControl.appearance?.color} onChange={(color) => configureCueAppearance(selectedControl.id, { color })} /></FieldRow>
              <FieldRow label="Alignment"><MiniSelect label="Cue title alignment" value={{ ...DEFAULT_OBJECT_STYLES.cue, ...selectedControl.style }.align ?? 'center'} onChange={(value) => setPageObjectStyle({ type: 'cue', id: selectedControl.id }, { align: value as LiveObjectStyle['align'] })} options={[{ value: 'left', label: 'Align Left' }, { value: 'center', label: 'Align Center' }, { value: 'right', label: 'Align Right' }]} /></FieldRow>
              {/* No show-fonts button here: font lives in the
                  right-click menu's Font submenu (Jake, 27 Nov 2026) —
                  LightKey's inspector has no Font section. */}
              {/* Activate (guide p.204) is the tail of LightKey's Button
                  section — a label row, not its own section (Jake's
                  screenshots 5.19.17 / 3.32.50): "Activate:" with the
                  two checkboxes stacked to its right. */}
              <FieldRow label="Activate"><span className="flex flex-col gap-0.5">
                <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.activateAtStartup === true} onChange={(event) => patchControl(selectedControl.id, { activateAtStartup: event.target.checked })} /> At startup</label>
                {/* Activate before quitting: LightKey activates these
                    cues for 0.5s on quit. Stored only — the quit-flow
                    wiring is a separate piece, not built yet (parked
                    27 Nov 2026). */}
                <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.activateBeforeQuitting === true} onChange={(event) => patchControl(selectedControl.id, { activateBeforeQuitting: event.target.checked })} /> Before quitting</label>
              </span></FieldRow>
              <label className="flex items-center gap-1 py-0.5 text-dim"><input type="checkbox" checked={selectedControl.appearance?.releaseOthers === true} onChange={(event) => configureCueAppearance(selectedControl.id, { releaseOthers: event.target.checked })} /> Release other buttons</label>
              {/* The Cue select has no LightKey equivalent — LightKey's
                  button IS its cue — but this app's buttons hold their
                  cue inline, and picking another cue here copies that
                  cue into the button (the store re-ids the copy when
                  the cue is already held elsewhere, so two holders
                  never share one cue id); picking No cue drops the
                  button's cue outright. */}
              <FieldRow label="Cue"><MiniSelect label="Cue" value={selectedControl.cue?.id ?? ''} onChange={(value) => setControlCue(selectedControl.id, value ? findInlineCue(show, cueLists, value)?.cue : undefined)} options={[{ value: '', label: 'No cue' }, ...cues.filter((s) => !s.blackout).map((s) => ({ value: s.id, label: s.name }))]} /></FieldRow>
            </InspectorSection>
            {/* Group (Jake's screenshot 3.32.58) is a label row like
                Activate — "Group:" with Always active — not its own
                collapsible section. Buttons attach by touching (Guide
                ch.11, pp.183–184); there is no attach dropdown. */}
            <FieldRow label="Group"><label className="flex items-center gap-1 text-dim" title="Attached buttons only: one of the attached buttons stays active at any time (Guide ch.11, p.204)"><input type="checkbox" checked={selectedControl.alwaysActive === true} onChange={(event) => patchControl(selectedControl.id, { alwaysActive: event.target.checked })} /> Always active</label></FieldRow>
            <InspectorSection id="modifiers" title="Modifiers" open={openSections.modifiers !== false} onToggle={() => toggleSection('modifiers')} sectionRef={sectionRef('modifiers')}>
                {/* LightKey's checklist (guide ch.11, pp.205–207; Jake's
                    screenshot, 27 Nov 2026 — "Select the modifiers you
                    would like to control"): only modifiers which apply
                    to the cue are enabled, the rest are greyed. The old
                    intensity/speed/size % inputs are gone — LightKey has
                    no such model; the stored % values still apply via
                    effectiveLiveLevel for compat. The value control in
                    the Live view (dragging a modifier's icon) and
                    applying values to output are NOT built yet — the
                    checklist is selection only, the same open question
                    as the previous commit. */}
                {(() => {
                  const applicable = applicableModifiers(selectedControl, cues, presets, show?.fixtures ?? [], show?.sequences ?? [], effects)
                  const selected = selectedControl.selectedModifiers ?? []
                  return <div className="space-y-0.5">
                    {LIGHTKEY_MODIFIERS.map(({ key, label }) => {
                      const applies = applicable.has(key)
                      return <label key={key} className={`flex items-center gap-1 ${applies ? '' : 'text-dim opacity-50'}`} title={applies ? undefined : 'Does not apply to this cue'}>
                        <input type="checkbox" aria-label={`Modifier ${label}`} disabled={!applies} checked={selected.includes(key)} onChange={() => toggleCueModifier(selectedControl.id, key)} /> {label}
                      </label>
                    })}
                  </div>
                })()}
                {/* Speed Options (guide pp.206–207): which aspects the
                    Speed modifier affects. Only shown while Speed is
                    selected; absent = every applicable aspect. */}
                {(selectedControl.selectedModifiers ?? []).includes('speed') && (() => {
                  const applicable = applicableSpeedOptions(selectedControl, cues, presets, show?.fixtures ?? [], show?.sequences ?? [], effects)
                  const chosen = selectedControl.speedModifierOptions
                  return <div className="mt-2">
                    <h5 className="font-semibold text-text">Speed Options</h5>
                    <div className="space-y-0.5">
                      {SPEED_MODIFIER_OPTIONS.map(({ key, label }) => {
                        const applies = applicable.has(key)
                        const checked = chosen ? chosen.includes(key) : applies
                        return <label key={key} className={`flex items-center gap-1 ${applies ? '' : 'text-dim opacity-50'}`} title={applies ? undefined : 'Does not apply to this cue'}>
                          <input type="checkbox" aria-label={`Speed option ${label}`} disabled={!applies} checked={checked} onChange={(event) => {
                            const next = (chosen ?? SPEED_MODIFIER_OPTIONS.filter((opt) => applicable.has(opt.key)).map((opt) => opt.key)).filter((item) => item !== key)
                            if (event.target.checked) next.push(key)
                            configureSpeedModifierOptions(selectedControl.id, next)
                          }} /> {label}
                        </label>
                      })}
                    </div>
                  </div>
                })()}
            </InspectorSection>
            <InspectorSection id="triggers" title="Live Triggers" open={openSections.triggers !== false} onToggle={() => toggleSection('triggers')} sectionRef={sectionRef('triggers')}>
                {/* Ableton Live triggering (guide ch. "Live Triggers",
                    p.294): cues fired from an Ableton Live timeline.
                    This app has no Ableton integration, so the trigger
                    wiring itself is not built — the exclusion is stored
                    so it survives until it is. */}
                <label className="flex items-center gap-1 py-0.5 text-dim"><input type="checkbox" checked={selectedControl.excludeFromLiveTriggers === true} onChange={(event) => patchControl(selectedControl.id, { excludeFromLiveTriggers: event.target.checked })} /> Exclude from Live Triggers</label>
            </InspectorSection>
            {contentsMenu && <div ref={contentsMenuRef} role="menu" aria-label="Contents item actions" className="fixed z-[310] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: contentsMenu.x, top: contentsMenu.y }}>
              <button type="button" role="menuitem" disabled={contentsMenu.row.kind === 'ad-hoc'} title={contentsMenu.row.kind === 'ad-hoc' ? 'Ad hoc values are not in the palette' : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { if (contentsMenu.row.kind !== 'ad-hoc' && contentsMenu.row.kind !== 'folder') setPaletteReveal(contentsMenu.row.kind, contentsMenu.row.id); setContentsMenu(null) }}>Show in Palette</button>
              <button type="button" role="menuitem" disabled={contentsMenu.row.kind !== 'ad-hoc'} title={contentsMenu.row.kind !== 'ad-hoc' ? 'Already in the palette' : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { if (contentsMenu.row.kind === 'ad-hoc') promoteAdHocToPreset(contentsMenu.row.source === 'cue' && selectedControl.cue ? { cueId: selectedControl.cue.id } : { controlId: selectedControl.id }); setContentsMenu(null) }}>Add to Palette</button>
              <button type="button" role="menuitem" disabled={contentsMenu.row.kind === 'ad-hoc' && contentsMenu.row.source === 'control'} title={contentsMenu.row.kind === 'ad-hoc' && contentsMenu.row.source === 'control' ? 'Select the row to edit its values in place below' : undefined} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => {
                const row = contentsMenu.row
                if (row.kind === 'preset') startEditingPreset(row.id)
                else if (row.kind === 'sequence') window.dispatchEvent(new CustomEvent('openlights-edit-sequence', { detail: row.id }))
                else if (row.kind === 'effect') startEditingLiveEffect(row.id)
                else if (row.source === 'cue' && selectedControl.cue) startEditingCueAdHoc(selectedControl.cue.id)
                setContentsMenu(null)
              }}>Edit</button>
              <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { removeContentRow(selectedControl, contentsMenu.row); setContentsMenu(null) }}>Remove From Cue</button>
            </div>}
          </>}
          <button type="button" className="text-red-300" onClick={() => { setLiveValue(selectedControl.id, 0); savePage({ ...page, controls: page.controls.filter((c) => c.id !== selectedControl.id) }); clearPageObjectSelection() }}>Remove</button>
        </div>}
        {inspectorStep && inspectorStepDef && inspectorStepCue && <div className="space-y-1">
          {/* A cue step's inspector (Jake, 27 Nov 2026 — screenshots
              5.22.16 / 5.20.50 / 5.21.53): Contents (the cue's
              ingredients, per property), Timing (Hold + Fade for the
              STEP — not the button's Fade In/Out), Modifiers, Live
              Triggers. No Button section: a cue step has no button of
              its own. */}
          <InspectorSection id="contents" title="Contents" open={openSections.contents !== false} onToggle={() => toggleSection('contents')} sectionRef={sectionRef('contents')}>
            <div role="list" aria-label="Cue contents" onDragOver={(event) => { if (hasDropData(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } setStepContentsDragOver(true) }} onDragLeave={() => setStepContentsDragOver(false)} onDrop={(event) => { setStepContentsDragOver(false); dropOnStepContents(event, inspectorStepCue.id) }} className={stepContentsDragOver ? 'rounded border-2 border-white p-1' : 'rounded border-2 border-transparent p-1'}>
              {(() => {
                const rows = stepContentsRows(inspectorStepCue)
                if (!rows.length) return <div className="py-2 text-center">
                  <p className="font-semibold">Empty Cue</p>
                  <p className="text-dim">Drag presets and sequences here</p>
                </div>
                return rows.map((row) => {
                  if (row.kind === 'group') return <p key={row.key} className="px-1 py-0.5 text-dim">{row.label}</p>
                  const icon = row.kind === 'dimmer' ? '☀' : row.kind === 'colour' ? '●' : row.kind === 'sequence' ? '↻' : row.kind === 'ad-hoc' ? '✎' : '✛'
                  const contentRow: ContentRow = row.kind === 'ad-hoc'
                    ? { key: `step:ad-hoc`, kind: 'ad-hoc', id: `cue:${inspectorStepCue.id}`, name: 'Ad hoc properties', source: 'cue', values: inspectorStepCue.fixtureValues ?? {} }
                    : row.presetId
                      ? { key: `step:preset:${row.presetId}`, kind: 'preset', id: row.presetId, name: presets.find((p) => p.id === row.presetId)?.name ?? row.label, source: 'cue', values: presets.find((p) => p.id === row.presetId)?.fixtureValues ?? {} }
                      : { key: `step:sequence:${row.sequenceId}`, kind: 'sequence', id: row.sequenceId!, name: row.label, source: 'cue', values: sequenceContentsValues(row.sequenceId!) }
                  const dotColor = row.kind === 'colour' && row.presetId ? (() => {
                    const values = resolveCueValues({ ...inspectorStepCue, presetIds: [row.presetId], sequenceIds: [], fixtureValues: {} }, presets, show?.fixtures ?? [])
                    const patch = Object.values(values).find((p) => (p.red ?? p.green ?? p.blue ?? 0) !== 0)
                    return patch ? `rgb(${patch.red ?? 0},${patch.green ?? 0},${patch.blue ?? 0})` : undefined
                  })() : undefined
                  return <div key={row.key} role="listitem" aria-selected={selectedContentKey === contentRow.key} className={`flex items-center gap-1 rounded px-1 py-0.5 ${selectedContentKey === contentRow.key ? 'bg-panel font-semibold' : 'hover:bg-panel'}`} onClick={() => selectContentRow(contentRow)}>
                    <span aria-hidden="true" style={dotColor ? { color: dotColor } : undefined}>{icon}</span>
                    <span className={`min-w-0 flex-1 truncate ${row.kind === 'ad-hoc' ? 'italic' : ''}`}>{row.label}</span>
                    <button type="button" aria-label={`Remove ${row.label} from cue`} title={`Remove ${row.label} from cue`} onClick={(event) => { event.stopPropagation(); removeStepContentRow(inspectorStepCue.id, row) }}>×</button>
                  </div>
                })
              })()}
            </div>
          </InspectorSection>
          <InspectorSection id="timing" title="Timing" open={openSections.timing !== false} onToggle={() => toggleSection('timing')} sectionRef={sectionRef('timing')}>
            <HoldTimeInput label="Hold Time" ms={inspectorStepDef.holdMs} onCommit={(ms) => updateCueStep(inspectorStep.listId, inspectorStepDef.id, { holdMs: ms })} />
            <TimingInput label="Fade Time" direction="in" ms={inspectorStepDef.fadeMs} onCommit={(ms) => updateCueStep(inspectorStep.listId, inspectorStepDef.id, { fadeMs: ms })} />
          </InspectorSection>
          <InspectorSection id="modifiers" title="Modifiers" open={openSections.modifiers !== false} onToggle={() => toggleSection('modifiers')} sectionRef={sectionRef('modifiers')}>
            {(() => {
              const synthetic = { id: inspectorStepDef.id, name: inspectorStepCue.name, type: 'push', x: 0, y: 0, cue: inspectorStepCue } as LiveControl
              const applicable = applicableModifiers(synthetic, cues, presets, show?.fixtures ?? [], show?.sequences ?? [], effects)
              const selected = inspectorStepDef.selectedModifiers ?? []
              return <div className="space-y-0.5">
                {LIGHTKEY_MODIFIERS.map(({ key, label }) => {
                  const applies = applicable.has(key)
                  return <label key={key} className={`flex items-center gap-1 ${applies ? '' : 'text-dim opacity-50'}`} title={applies ? undefined : 'Does not apply to this cue'}>
                    <input type="checkbox" aria-label={`Modifier ${label}`} disabled={!applies} checked={selected.includes(key)} onChange={() => {
                      const next = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]
                      updateCueStep(inspectorStep.listId, inspectorStepDef.id, { selectedModifiers: next })
                    }} /> {label}
                  </label>
                })}
              </div>
            })()}
            {(inspectorStepDef.selectedModifiers ?? []).includes('speed') && (() => {
              const synthetic = { id: inspectorStepDef.id, name: inspectorStepCue.name, type: 'push', x: 0, y: 0, cue: inspectorStepCue } as LiveControl
              const applicable = applicableSpeedOptions(synthetic, cues, presets, show?.fixtures ?? [], show?.sequences ?? [], effects)
              const chosen = inspectorStepDef.speedModifierOptions
              return <div className="mt-2">
                <h5 className="font-semibold text-text">Speed Options</h5>
                <div className="space-y-0.5">
                  {SPEED_MODIFIER_OPTIONS.map(({ key, label }) => {
                    const applies = applicable.has(key)
                    const checked = chosen ? chosen.includes(key) : applies
                    return <label key={key} className={`flex items-center gap-1 ${applies ? '' : 'text-dim opacity-50'}`} title={applies ? undefined : 'Does not apply to this cue'}>
                      <input type="checkbox" aria-label={`Speed option ${label}`} disabled={!applies} checked={checked} onChange={(event) => {
                        const next = (chosen ?? SPEED_MODIFIER_OPTIONS.filter((opt) => applicable.has(opt.key)).map((opt) => opt.key)).filter((item) => item !== key)
                        if (event.target.checked) next.push(key)
                        updateCueStep(inspectorStep.listId, inspectorStepDef.id, { speedModifierOptions: next })
                      }} /> {label}
                    </label>
                  })}
                </div>
              </div>
            })()}
          </InspectorSection>
          <InspectorSection id="triggers" title="Live Triggers" open={openSections.triggers !== false} onToggle={() => toggleSection('triggers')} sectionRef={sectionRef('triggers')}>
            <label className="flex items-center gap-1 py-0.5 text-dim"><input type="checkbox" checked={inspectorStepDef.excludeFromLiveTriggers === true} onChange={(event) => updateCueStep(inspectorStep.listId, inspectorStepDef.id, { excludeFromLiveTriggers: event.target.checked })} /> Exclude from Live Triggers</label>
          </InspectorSection>
          <button type="button" className="text-red-300" onClick={() => { removeCueStep(inspectorStep.listId, inspectorStepDef.id); setInspectorStep(null); setPopupOpen(false) }}>Remove</button>
        </div>}
        {selectedList && !inspectorStep && <div className="space-y-1">
          <InspectorSection id="cuelist" title="Cuelist" open={openSections.cuelist !== false} onToggle={() => toggleSection('cuelist')} sectionRef={sectionRef('cuelist')}>
            {/* Cuelist options (Guide ch.11, p.190): Priority ("Like
                buttons and frames, cuelists have a priority"), Size
                (two text sizes), "+ – buttons" (hide the add/remove
                buttons in each row), Xfade slider (hide the slider for
                manual crossfades), Loops (repeat after the last cue).
                This replaces the old CueListEditor, whose step list
                duplicated the widget itself. */}
            {(() => {
              const list = cueLists.find((l) => l.id === selectedList.cueListId)
              if (!list) return <span className="text-dim">Missing cue list</span>
              return <>
                <FieldRow label="Priority"><MiniSelect label="Cuelist priority" value={String(list.priority ?? DEFAULT_CUE_PRIORITY)} onChange={(value) => updateCueList(list.id, { priority: Number(value) })} options={[9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) => ({ value: String(v), label: cuePriorityLabel(v) }))} /></FieldRow>
                <FieldRow label="Size"><MiniSelect label="Cuelist text size" value={list.textSize ?? 'normal'} onChange={(value) => updateCueList(list.id, { textSize: value as 'normal' | 'large' })} options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }]} /></FieldRow>
                <label className="flex items-center gap-1 py-0.5 text-dim"><input type="checkbox" checked={list.showStepButtons !== false} onChange={(event) => updateCueList(list.id, { showStepButtons: event.target.checked })} /> + – buttons</label>
                <label className="flex items-center gap-1 py-0.5 text-dim"><input type="checkbox" checked={list.showXfade !== false} onChange={(event) => updateCueList(list.id, { showXfade: event.target.checked })} /> Xfade slider</label>
                <label className="flex items-center gap-1 py-0.5 text-dim"><input type="checkbox" checked={list.loop === true} onChange={(event) => updateCueList(list.id, { loop: event.target.checked })} /> Loops</label>
              </>
            })()}
          </InspectorSection>
          <InspectorSection id="group" title="Group" open={openSections.group !== false} onToggle={() => toggleSection('group')} sectionRef={sectionRef('group')}>
            <FieldRow label="Cue list"><MiniSelect label="Widget cue list" value={selectedList.cueListId} onChange={(value) => savePage({ ...page, cueListWidgets: (page.cueListWidgets ?? []).map((w) => w.id === selectedList.id ? { ...w, cueListId: value } : w) })} options={cueLists.map((list) => ({ value: list.id, label: list.name }))} /></FieldRow>
          </InspectorSection>
          <InspectorSection id="font" title="Font" open={openSections.font === true} onToggle={() => toggleSection('font')} sectionRef={sectionRef('font')}>
            {styleFields({ type: 'list', id: selectedList.id }, 'list', selectedList.style)}
          </InspectorSection>
          <button type="button" className="text-red-300" onClick={() => removeListWidget(selectedList.id)}>Remove</button>
        </div>}
        {selectedAnnotation && <div className="space-y-1">
          <InspectorSection id="contents" title="Contents" open={openSections.contents !== false} onToggle={() => toggleSection('contents')} sectionRef={sectionRef('contents')}>
            <div className="flex flex-wrap items-end gap-2">{(['text', 'width', 'height'] as const).map((key) => <label key={key} className="capitalize text-dim">{key}<input aria-label={`${selectedAnnotation.type} ${key}`} type={key === 'text' ? 'text' : 'number'} min={key === 'text' ? undefined : 20} value={selectedAnnotation[key]} onChange={(e) => { const ref: PageObjectRef = { type: 'annotation', id: selectedAnnotation.id }; if (key === 'text') renamePageObject(ref, e.target.value); else { const other = key === 'width' ? selectedAnnotation.height : selectedAnnotation.width; resizePageObject(ref, key === 'width' ? Number(e.target.value) : other, key === 'height' ? Number(e.target.value) : other) } }} className="block w-32 rounded bg-bg p-1" /></label>)}</div>
          </InspectorSection>
          {selectedAnnotation.type === 'frame' && frameConfigFields(selectedAnnotation.id, selectedAnnotation.frame)}
          <InspectorSection id="font" title="Font" open={openSections.font === true} onToggle={() => toggleSection('font')} sectionRef={sectionRef('font')}>
            {styleFields({ type: 'annotation', id: selectedAnnotation.id }, selectedAnnotation.type, selectedAnnotation.style)}
          </InspectorSection>
          <button type="button" className="text-red-300" onClick={() => { savePage({ ...page, annotations: (page.annotations ?? []).filter((a) => a.id !== selectedAnnotation.id) }); clearPageObjectSelection() }}>Remove</button>
        </div>}
      </div></div>}
      </>}
    </div>
    {buttonMenu && <div ref={menuRef} role="menu" aria-label="Cue button actions" className="fixed z-[300] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: menuPos.left, top: menuPos.top }}>
      <CueButtonMenu controlId={buttonMenu.controlId} onClose={() => setButtonMenu(null)} />
    </div>}
    {listWidgetMenu && <div ref={listMenuRef} role="menu" aria-label="Cuelist actions" className="fixed z-[300] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: listMenuPos.left, top: listMenuPos.top }}>
      <CueListWidgetMenu widgetId={listWidgetMenu.widgetId} listId={listWidgetMenu.listId} stepId={listWidgetMenu.stepId} selectedStepIds={selectedSteps?.listId === listWidgetMenu.listId ? selectedSteps.stepIds : []} onClose={() => setListWidgetMenu(null)} />
    </div>}
    {contextMenu && <div ref={menuRef} role="menu" aria-label="Live edit actions" className="fixed z-[300] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: menuPos.left, top: menuPos.top }}>
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { addControl(contextMenu.at); setContextMenu(null) }}>New Button</button>
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { addAnnotation('label', contextMenu.at); setContextMenu(null) }}>Insert Text</button>
      <button type="button" role="menuitem" disabled={(page?.cueListWidgets?.length ?? 0) > 0} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { addNewList(contextMenu.at); setContextMenu(null) }}>Insert Cuelist</button>
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
