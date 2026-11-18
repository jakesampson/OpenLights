import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { FadeCurve, FrameConfig, LiveControl, LiveObjectKind, LiveObjectStyle, LivePage } from '@shared/types'
import { clampModifier, clampLiveSize, DEFAULT_OBJECT_STYLES, frameConfigFor, LIVE_CUE_SIZE, LIVE_LIST_SIZE } from '@shared/liveObjectDefaults'
import { isLiveWindow } from '../lib/liveWindowBridge'
import {
  decodeLiveDrop, LIVE_DROP_MIME, LEGACY_PRESET_MIME, type LiveDropPayload
} from '../lib/liveDrops'
import { formatTimingMs, parseTimingMs } from '../lib/liveTiming'
import {
  isClipboardEmpty, newAnnotationObject, newCueObject, newWidgetObject, objectLabel, positionedObjects,
  type PageObjectRef, type Rect
} from '../lib/livePageObjects'
import { useShowStore } from '../stores/showStore'
import { inspectorFields, type InspectorTarget } from '../lib/liveInspector'
import { CueListEditor } from './CueListEditor'

type Selection = PageObjectRef
const position = (index: number) => ({ x: 20 + (index % 4) * 180, y: 20 + Math.floor(index / 4) * 90 })
// Canvas object space: the grid canvas is 900x520 and objects snap to 10px.
const clampCanvasPoint = (x: number, y: number) => ({
  x: Math.max(0, Math.min(740, Math.round(x / 10) * 10)),
  y: Math.max(0, Math.min(440, Math.round(y / 10) * 10))
})

// LightKey button types (Guide ch.11, "Button", p.199): the model has three
// cue kinds, labelled the LightKey way. Push Button is the momentary
// (hold-to-flash) kind; Toggle latches; Fader is a level control.
const BUTTON_TYPE_LABELS: Record<LiveControl['type'], string> = {
  toggle: 'Toggle Button',
  flash: 'Push Button',
  fader: 'Fader'
}

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

export function LiveWorkspace() {
  const {
    locked, show, scenes, presets, activePresetIds, cueLists, setLivePages, selectLivePage, activeLivePageId,
    activeLiveValues, setLiveValue, clearLiveValues, manualOverrides, clearManualOverrides, activeCueListId,
    activeCueIndex, cuePlaying, goToCue, cueNext, cuePrev, stopCue, liveEditing, setLiveEditing,
    master, setMaster, bpm, editCueContents, configureCueTiming, configureCueAppearance, configureCueModifiers,
    configureCuePriority, configureCueFrameStep,
    selectedPageObjects, pageClipboard, setPageObjectSelection, togglePageObjectSelection,
    selectPageObjectsInRect, clearPageObjectSelection, moveSelectedPageObjects, deleteSelectedPageObjects,
    duplicateSelectedPageObjects, copySelectedPageObjects, pastePageObjects, resizePageObject, renamePageObject,
    attachPageObject, setPageObjectStyle, configureFrame, dropOnLivePage
  } = useShowStore()
  // Live Edit mode is store UI state (not show data, not undo history), so
  // the Shortcuts panel in App.tsx can show the LightKey edit shortcuts
  // while Edit is open. Firing is unaffected by the flag: cues fire the
  // same in Live and in Edit (see cueBody).
  const editing = liveEditing
  const [draft, setDraft] = useState<{ id: string; x: number; y: number } | null>(null)
  const drag = useRef<{ ref: Selection; startX: number; startY: number; x: number; y: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null)
  const marquee = useRef<{ startX: number; startY: number } | null>(null)
  const resize = useRef<{ ref: PageObjectRef; startX: number; startY: number; width: number; height: number } | null>(null)
  const [resizeDraft, setResizeDraft] = useState<{ id: string; width: number; height: number } | null>(null)
  const [renaming, setRenaming] = useState<{ ref: PageObjectRef; value: string } | null>(null)
  const pageCanvas = useRef<HTMLDivElement>(null)
  // LightKey-style context menu (Guide ch.11, p.176): right-click on the
  // canvas or a button in Edit mode. Each item wires to the existing store
  // actions the old bottom-strip buttons used.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; at: { x: number; y: number } } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!contextMenu) return
    const close = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setContextMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [contextMenu])

  // The inspector follows a single selection; multiple selected objects are
  // handled entirely by the store's multi-object commands.
  const selection: Selection | null = selectedPageObjects.length === 1 ? selectedPageObjects[0] : null
  const isSelected = (ref: Selection) => selectedPageObjects.some((item) => item.type === ref.type && item.id === ref.id)

  // Selection follows interaction in both Live and Live Edit: pressing a cue
  // or cue list selects it, so the inspector follows it when Edit is open.
  const selectRef = (ref: Selection) => { if (!isSelected(ref)) setPageObjectSelection([ref]) }

  const commitRename = () => {
    if (renaming) renamePageObject(renaming.ref, renaming.value)
    setRenaming(null)
  }

  const beginResize = (event: React.PointerEvent, ref: PageObjectRef, width: number, height: number) => {
    if (!editing || locked || event.button !== 0) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    resize.current = { ref, startX: event.clientX, startY: event.clientY, width, height }
    setPageObjectSelection([ref])
  }
  const moveResize = (event: React.PointerEvent) => {
    if (!resize.current) return
    const r = resize.current
    setResizeDraft({
      id: r.ref.id,
      width: clampLiveSize(r.width + event.clientX - r.startX),
      height: clampLiveSize(r.height + event.clientY - r.startY)
    })
  }
  const endResize = () => {
    const r = resize.current
    if (r && resizeDraft) resizePageObject(r.ref, resizeDraft.width, resizeDraft.height)
    resize.current = null; setResizeDraft(null)
  }

  const resizeHandle = (ref: PageObjectRef, width: number, height: number) =>
    editing && !locked && isSelected(ref) ? <div role="button" aria-label="Resize object" className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize rounded-tl border-l-2 border-t-2 border-[var(--accent)] bg-[var(--accent)]/30" style={{ pointerEvents: 'auto' }} onPointerDown={(e) => beginResize(e, ref, width, height)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={() => { resize.current = null; setResizeDraft(null) }} /> : null

  // The cue activation control is identical in Live and Live Edit: one code
  // path renders the toggle / flash / fader body, so a cue fires, flashes,
  // fades and shows its lit state the same way in both modes. In Edit mode a
  // drag grip above it moves the cue; the body itself never drags.
  const cueBody = (control: LiveControl, level: number) =>
    control.type === 'fader' ? <label className="block flex-1 p-1 text-center" style={css(control.style)}><span>{control.name}</span><input aria-label={control.name} type="range" min="0" max="255" value={level} onChange={(e) => setLiveValue(control.id, Number(e.target.value))} className="w-full accent-[var(--accent)]" /><span>{Math.round(level / 255 * 100)}%</span></label> : <button type="button" aria-pressed={level > 0} style={css(control.style)} className={`pad w-full flex-1 rounded p-2 ${level ? 'active' : ''}`} onClick={control.type === 'toggle' ? () => setLiveValue(control.id, level ? 0 : 255) : undefined} onPointerDown={control.type === 'flash' ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); setLiveValue(control.id, 255) } : undefined} onPointerUp={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onPointerCancel={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onKeyDown={control.type === 'flash' ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setLiveValue(control.id, 255) } } : undefined} onKeyUp={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onBlur={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined}>{control.name}{control.type === 'flash' && ' (hold)'}</button>

  const renameInput = (ref: PageObjectRef, ariaLabel: string) =>
    <input autoFocus aria-label={ariaLabel} value={renaming!.value}
      onChange={(e) => setRenaming({ ref, value: e.target.value })}
      onBlur={commitRename}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') setRenaming(null) }}
      className="w-full rounded bg-bg px-1 text-xs" />

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
    return <div className="flex flex-wrap items-end gap-2 rounded border border-line bg-bg/40 p-1">
      <label className="flex items-center gap-1 text-dim"><input type="checkbox" aria-label="Frame exclusive" checked={current.exclusive} onChange={(e) => update({ exclusive: e.target.checked })} />Exclusive</label>
      <label className="text-dim">Intensity %<input aria-label="Frame intensity" type="number" min={0} max={200} step={5} value={current.intensity} onChange={(e) => update({ intensity: clampModifier(Number(e.target.value)) })} className="block w-20 rounded bg-bg p-1" /></label>
      <label className="text-dim">Speed %<input aria-label="Frame speed" type="number" min={0} max={200} step={5} value={current.speed} onChange={(e) => update({ speed: clampModifier(Number(e.target.value)) })} className="block w-20 rounded bg-bg p-1" /></label>
    </div>
  }

  // "Default styles for new objects" used to live in the old bottom strip;
  // it now lives in the page inspector (no object selected), as in LightKey
  // where new-object defaults belong to the page being edited.
  const defaultStylesFields = () => (
    <details className="rounded border border-line bg-bg/40 p-2">
      <summary className="cursor-pointer">Default styles for new objects</summary>
      <div className="mt-2 space-y-2">
        {(['cue', 'list', 'label', 'frame'] as const).map((kind) => {
          const current = { ...DEFAULT_OBJECT_STYLES[kind], ...page?.defaultStyles?.[kind] }
          const update = (patch: Partial<LiveObjectStyle>) => { if (page) savePage({ ...page, defaultStyles: { ...page.defaultStyles, [kind]: { ...current, ...patch } } }) }
          return <div key={kind} className="flex flex-wrap items-end gap-2 border-t border-line pt-1">
            <strong className="w-14 capitalize">{kind}</strong>
            <label>Size<input type="number" aria-label={`Default ${kind} font size`} min={6} max={96} value={current.fontSize ?? 12} onChange={(e) => update({ fontSize: Math.max(6, Math.min(96, Number(e.target.value))) })} className="ml-1 w-16 rounded bg-bg p-1" /></label>
            <label>Color<input type="color" aria-label={`Default ${kind} color`} value={current.color ?? '#e5e7eb'} onChange={(e) => update({ color: e.target.value })} className="ml-1 h-7 w-10 rounded bg-bg p-1" /></label>
            <label>Align<select aria-label={`Default ${kind} align`} value={current.align ?? 'left'} onChange={(e) => update({ align: e.target.value as LiveObjectStyle['align'] })} className="ml-1 rounded bg-bg p-1"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
            <label className="flex items-center gap-1"><input type="checkbox" aria-label={`Default ${kind} bold`} checked={current.bold === true} onChange={(e) => update({ bold: e.target.checked })} />Bold</label>
            <label className="flex items-center gap-1"><input type="checkbox" aria-label={`Default ${kind} italic`} checked={current.italic === true} onChange={(e) => update({ italic: e.target.checked })} />Italic</label>
          </div>
        })}
      </div>
    </details>
  )

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
    const point = at ?? position(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const control = newCueObject(crypto.randomUUID(), point.x, point.y, page.defaultStyles, {
      presetIds: [...activePresetIds],
      adHocValues: Object.fromEntries(Object.entries(manualOverrides).map(([id, values]) => [id, { ...values }]))
    })
    savePage({ ...page, controls: [...page.controls, control] }); setPageObjectSelection([{ type: 'cue', id: control.id }])
  }
  // Scene buttons are created the LightKey way: New Button, then pick a
  // scene in the inspector — or drag a preset / sequence from the Preset
  // Palette in the right sidebar onto the canvas.
  const hasDropData = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(LIVE_DROP_MIME) || event.dataTransfer.types.includes(LEGACY_PRESET_MIME)
  const readDrop = (event: React.DragEvent): LiveDropPayload | null => {
    const encoded = event.dataTransfer.getData(LIVE_DROP_MIME)
    if (encoded) return decodeLiveDrop(encoded)
    const legacy = event.dataTransfer.getData(LEGACY_PRESET_MIME)
    return legacy ? { presetIds: [legacy], sequenceIds: [] } : null
  }
  const pagePoint = (event: React.DragEvent) => {
    const rect = pageCanvas.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }
  const allowDrop = (event: React.DragEvent) => {
    if (editing && hasDropData(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }
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
  const addList = (at?: { x: number; y: number }) => {
    if (!page || !cueLists[0]) return
    const point = at ?? position(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const widget = newWidgetObject(crypto.randomUUID(), cueLists[0].id, point.x, point.y, page.defaultStyles)
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
    const rect = pageCanvas.current?.getBoundingClientRect()
    const at = clampCanvasPoint(event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0))
    setContextMenu({ x: event.clientX, y: event.clientY, at })
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
    setDraft({ id: d.ref.id, x: Math.max(0, Math.min(740, Math.round((d.x + event.clientX - d.startX) / 10) * 10)), y: Math.max(0, Math.min(440, Math.round((d.y + event.clientY - d.startY) / 10) * 10)) })
  }
  const endDrag = () => {
    const d = drag.current
    if (d && draft) {
      const dx = draft.x - d.x, dy = draft.y - d.y
      if (dx || dy) moveSelectedPageObjects(dx, dy)
    }
    drag.current = null; setDraft(null)
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
  const overrideCount = Object.values(manualOverrides).reduce((sum, attrs) => sum + Object.keys(attrs).length, 0)
  const cueTiming = selectedControl ? { fadeInMs: 0, fadeOutMs: 0, delayMs: 0, curve: 'linear' as FadeCurve, ...selectedControl.timing } : null
  return <section data-context-menu="page" aria-label="Live page canvas" className="flex min-h-full flex-col gap-2 rounded border border-line bg-bg/30 p-3" onContextMenu={openContextMenu}>
    {/* LightKey-style edit toolbar: the Design / Live switch already sits
        centred on the divider directly above this panel (ViewSwitch); the
        toolbar below it holds New Button (+), New Frame, Insert Text (T)
        and the green Done button, as in LightKey's bottom panel. */}
    <div className="flex flex-wrap items-center gap-2">
      {page && <span className="text-xs font-semibold text-text">{page.name}</span>}
      {Object.keys(activeLiveValues).length > 0 && <button type="button" className="btn-theme text-xs" onClick={clearLiveValues}>Release page cues</button>}
      {editing && !locked && <>
        <div className="mx-auto flex items-center gap-1" role="toolbar" aria-label="Live edit tools">
          <button type="button" aria-label="New button" title="New button" className="btn-theme px-2 text-base leading-none" onClick={() => addControl()}>+</button>
          <button type="button" aria-label="New frame" title="New frame" className="btn-theme px-2 text-base leading-none" onClick={() => addAnnotation('frame')}>▣</button>
          <button type="button" aria-label="Insert text" title="Insert text" className="btn-theme px-2 text-base leading-none" onClick={() => addAnnotation('label')}>T</button>
        </div>
        <button type="button" className="live-page-edit rounded px-3 py-1 text-xs font-semibold" style={{ backgroundColor: '#22c55e', color: '#111' }} onClick={toggleEditing}>Done</button>
      </>}
      {!editing && !locked && !isLiveWindow() && <button type="button" className="live-page-edit btn-theme ml-auto text-xs" onClick={toggleEditing}>Edit</button>}
    </div>
    {overrideCount > 0 && <div className="flex justify-between rounded border border-amber-500/60 bg-amber-900/30 p-2 text-xs text-amber-100"><span>{overrideCount} manual properties overriding output</span><button type="button" className="underline" onClick={clearManualOverrides}>Release overrides</button></div>}
    {!page ? <div className="flex min-h-32 flex-1 items-center justify-center rounded border border-line bg-panel text-xs text-dim">This Live page is blank. Select Edit to start arranging controls.</div> : <div className="flex min-h-0 flex-1 gap-2">
      {/* LightKey bottom panel: vertical Master fader on the far left. */}
      <div className="flex w-14 shrink-0 flex-col items-center gap-1 rounded border border-line bg-panel2 py-2" aria-label="Live master fader">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">Master</span>
        <input aria-label="Live master" type="range" min="0" max="255" value={master} onChange={(e) => setMaster(Number(e.target.value))} style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 180, width: 24 }} />
        <span className="text-xs text-text">{Math.round(master / 255 * 100)}%</span>
        <span className="text-[10px] text-dim">Full</span>
        <span className="text-[10px] text-dim" title="Tap tempo BPM (see the toolbar Tap button)">{bpm > 0 ? `${Math.round(bpm)} BPM` : '— BPM'}</span>
      </div>
      <div className="min-w-0 flex-1 overflow-auto rounded border border-line"><div ref={pageCanvas} className="relative bg-panel" style={{ width: 900, height: 520, backgroundImage: editing ? 'radial-gradient(var(--line) 1px, transparent 1px)' : undefined, backgroundSize: '10px 10px' }} onPointerDown={beginMarquee} onPointerMove={moveMarquee} onPointerUp={endMarquee} onPointerCancel={() => { marquee.current = null; setMarqueeRect(null) }} onDragOver={allowDrop} onDrop={(event) => dropAt(event)}>
        {marqueeRect && <div className="pointer-events-none absolute border border-dashed border-[var(--accent)] bg-[var(--accent)]/10" style={{ left: Math.min(marqueeRect.x, marqueeRect.x + marqueeRect.width), top: Math.min(marqueeRect.y, marqueeRect.y + marqueeRect.height), width: Math.abs(marqueeRect.width), height: Math.abs(marqueeRect.height) }} />}
        {(page.annotations ?? []).map((item) => {
          const ref: PageObjectRef = { type: 'annotation', id: item.id }
          const w = resizeDraft?.id === item.id ? resizeDraft.width : item.width
          const h = resizeDraft?.id === item.id ? resizeDraft.height : item.height
          return <div key={item.id} className={`absolute ${item.type === 'frame' ? 'border border-line rounded' : ''} ${editing && !locked && isSelected(ref) ? 'outline outline-1 outline-[var(--accent)]' : ''}`} style={{ left: draft?.id === item.id ? draft.x : item.x, top: draft?.id === item.id ? draft.y : item.y, width: w, height: h, pointerEvents: item.type === 'frame' && editing && !locked ? 'auto' : 'none' }} onDragOver={item.type === 'frame' ? allowDrop : undefined} onDrop={item.type === 'frame' ? (event) => dropAt(event, item.id) : undefined}>
            <div className={`px-2 py-1 text-xs ${editing ? 'cursor-grab bg-panel2' : ''}`} style={{ pointerEvents: editing ? 'auto' : 'none', ...css(item.style) }} onPointerDown={(e) => beginDrag(e, ref, item.x, item.y)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }} onDoubleClick={() => editing && !locked && setRenaming({ ref, value: item.text })}>{renaming?.ref.type === 'annotation' && renaming.ref.id === item.id ? renameInput(ref, `${item.type} text`) : item.text}</div>
            {resizeHandle(ref, item.width, item.height)}
          </div>
        })}
        {page.controls.map((control, index) => {
          const p = position(index), x = draft?.id === control.id ? draft.x : control.x ?? p.x, y = draft?.id === control.id ? draft.y : control.y ?? p.y
          const ref: PageObjectRef = { type: 'cue', id: control.id }
          const cw = control.width ?? LIVE_CUE_SIZE.width, ch = control.height ?? LIVE_CUE_SIZE.height
          const w = resizeDraft?.id === control.id ? resizeDraft.width : cw, h = resizeDraft?.id === control.id ? resizeDraft.height : ch
          const level = activeLiveValues[control.id] ?? 0
          return <div key={control.id} data-project-id={control.id} className={`absolute rounded border ${isSelected(ref) ? 'border-accent' : 'border-line'} bg-panel2 p-1 text-xs`} style={{ left: x, top: y, width: w, height: h, overflow: 'hidden' }} onPointerDown={() => selectRef(ref)} onDragOver={allowDrop} onDrop={(event) => dropOnCue(event, control.id)}>
            {renaming?.ref.type === 'cue' && renaming.ref.id === control.id ? renameInput(ref, 'Cue name') : <div className="flex h-full flex-col">{editing && !locked && <button type="button" aria-label={`Drag ${control.name}`} className="cursor-grab rounded bg-bg px-2 py-0.5 text-left text-[10px] text-dim" onPointerDown={(e) => beginDrag(e, ref, x, y)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }} onDoubleClick={() => setRenaming({ ref, value: control.name })}>↕ drag</button>}{cueBody(control, level)}</div>}
            {resizeHandle(ref, cw, ch)}
          </div>
        })}
        {(page.cueListWidgets ?? []).map((widget) => {
          const list = cueLists.find((item) => item.id === widget.cueListId), x = draft?.id === widget.id ? draft.x : widget.x, y = draft?.id === widget.id ? draft.y : widget.y, current = activeCueListId === list?.id ? activeCueIndex : -1, next = list?.steps[current + 1] ?? (list?.loop ? list.steps[0] : undefined)
          const ref: PageObjectRef = { type: 'list', id: widget.id }
          const lw = widget.width ?? LIVE_LIST_SIZE.width, lh = widget.height ?? LIVE_LIST_SIZE.height
          const w = resizeDraft?.id === widget.id ? resizeDraft.width : lw, h = resizeDraft?.id === widget.id ? resizeDraft.height : lh
          return <div key={widget.id} className={`absolute rounded border ${isSelected(ref) ? 'border-accent' : 'border-line'} bg-panel2 p-2 text-xs`} style={{ left: x, top: y, width: w, height: h, overflow: 'hidden' }}>
            <div className={editing ? 'cursor-grab rounded bg-bg p-1' : 'font-semibold'} style={css(widget.style)} onPointerDown={(e) => { selectRef(ref); beginDrag(e, ref, x, y) }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }}>{editing && !locked && '↕ '}{list?.name ?? 'Missing cue list'}</div>
            <p className="mt-1 text-dim">Current: {current >= 0 ? scenes.find((s) => s.id === list?.steps[current]?.sceneId)?.name ?? 'Missing scene' : 'Not started'}</p><p className="text-dim">Next: {next ? scenes.find((s) => s.id === next.sceneId)?.name ?? 'Missing scene' : 'End of list'}</p>
            {list && <div className="mt-2 flex gap-1"><button className="btn-theme" onClick={stopCue} disabled={current < 0 || !cuePlaying}>Stop</button><button className="btn-theme" onClick={cuePrev} disabled={current < 0}>Back</button><button className="btn-theme on" disabled={!list.steps.length} onClick={() => current >= 0 ? cueNext() : goToCue(list.id, 0)}>Go</button></div>}
            {resizeHandle(ref, lw, lh)}
          </div>
        })}
      </div></div>
      {/* LightKey inspector: right of the canvas, for the selected button.
          In Live mode there is no inspector — the canvas takes the space. */}
      {editing && !locked && <aside className="w-[280px] shrink-0 overflow-y-auto rounded border border-line bg-panel2 p-2 text-xs" aria-label={`${inspectorTarget} inspector`} data-fields={inspectorFields(inspectorTarget).join(',')}>
        {!selection && <div className="space-y-2">
          <strong className="block">Page inspector</strong>
          <label className="block">Name<input aria-label="Page name" value={page.name} onChange={(e) => savePage({ ...page, name: e.target.value })} className="ml-1 rounded bg-bg p-1" /></label>
          <label className="block">Fade (ms)<input aria-label="Page fade time" type="number" min="0" value={page.fadeMs ?? 0} onChange={(e) => savePage({ ...page, fadeMs: Math.max(0, Number(e.target.value)) })} className="ml-1 w-24 rounded bg-bg p-1" /></label>
          {defaultStylesFields()}
        </div>}
        {selectedControl && cueTiming && <div className="space-y-3">
          <div className="flex items-center justify-between"><strong>{selectedControl.name}</strong><button type="button" aria-label="Close inspector" title="Close inspector" onClick={clearPageObjectSelection}>×</button></div>
          <label className="block">Name<input aria-label="Cue name" value={selectedControl.name} onChange={(e) => patchControl(selectedControl.id, { name: e.target.value })} className="ml-1 rounded bg-bg p-1" /></label>
          <div>
            <h4 className="font-semibold text-text">Ad hoc properties</h4>
            {Object.entries(selectedControl.adHocValues ?? {}).flatMap(([fixtureId, values]) => Object.entries(values).map(([property, value]) => <label key={`${fixtureId}:${property}`} className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate">{fixtureId} · {property}</span><input aria-label={`${fixtureId} ${property}`} type="number" min="0" max="255" value={value} className="w-16 rounded bg-bg p-1" onChange={(event) => editCueContents(selectedControl.id, { type: 'set-ad-hoc', fixtureId, property, value: Number(event.target.value) })} /><button type="button" aria-label={`Remove ${fixtureId} ${property}`} onClick={() => editCueContents(selectedControl.id, { type: 'remove-ad-hoc', fixtureId, property })}>×</button></label>))}
            {!Object.keys(selectedControl.adHocValues ?? {}).length && <span className="text-dim">None</span>}
          </div>
          <div>
            <h4 className="font-semibold text-text">Timing</h4>
            <div className="flex flex-wrap items-end gap-2">
              <TimingInput label="Fade In" ms={cueTiming.fadeInMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeInMs: ms })} />
              <TimingInput label="Fade Out" ms={cueTiming.fadeOutMs} onCommit={(ms) => configureCueTiming(selectedControl.id, { fadeOutMs: ms })} />
              <label className="text-dim">Curve<select aria-label="Fade curve" value={cueTiming.curve} onChange={(event) => configureCueTiming(selectedControl.id, { curve: event.target.value as FadeCurve })} className="ml-1 rounded bg-bg p-1">{['linear', 'ease-in', 'ease-out', 'ease-in-out', 's-curve'].map((curve) => <option key={curve}>{curve}</option>)}</select></label>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-text">Button</h4>
            <label className="text-dim">Type<select aria-label="Cue control type" value={selectedControl.type} onChange={(e) => { setLiveValue(selectedControl.id, 0); patchControl(selectedControl.id, { type: e.target.value as LiveControl['type'] }) }} className="ml-1 rounded bg-bg p-1">{(Object.keys(BUTTON_TYPE_LABELS) as LiveControl['type'][]).map((type) => <option key={type} value={type}>{BUTTON_TYPE_LABELS[type]}</option>)}</select></label>
            <label className="mt-1 block text-dim">Scene<select aria-label="Cue scene" value={selectedControl.sceneId ?? ''} onChange={(e) => patchControl(selectedControl.id, { sceneId: e.target.value || undefined })} className="ml-1 rounded bg-bg p-1"><option value="">No scene</option>{scenes.filter((s) => !s.blackout).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          </div>
          <details><summary className="cursor-pointer">Presets ({selectedControl.presetIds.length})</summary>{presets.map((p) => <label key={p.id} className="block"><input type="checkbox" checked={selectedControl.presetIds.includes(p.id)} onChange={(e) => patchControl(selectedControl.id, { presetIds: e.target.checked ? [...selectedControl.presetIds, p.id] : selectedControl.presetIds.filter((id) => id !== p.id) })} /> {p.name}</label>)}</details>
          <details><summary className="cursor-pointer">Sequences ({(selectedControl.sequenceIds ?? []).length})</summary>{(show?.sequences ?? []).map((s) => <label key={s.id} className="block"><input type="checkbox" checked={(selectedControl.sequenceIds ?? []).includes(s.id)} onChange={(e) => patchControl(selectedControl.id, { sequenceIds: e.target.checked ? [...(selectedControl.sequenceIds ?? []), s.id] : (selectedControl.sequenceIds ?? []).filter((id) => id !== s.id) })} /> {s.name}</label>)}</details>
          <details><summary className="cursor-pointer">More</summary>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <label className="text-dim">Colour<input aria-label="Cue colour" type="color" value={selectedControl.appearance?.color ?? '#47235a'} className="ml-1" onChange={(event) => configureCueAppearance(selectedControl.id, { color: event.target.value })} /></label>
              <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={selectedControl.appearance?.releaseOthers === true} onChange={(event) => configureCueAppearance(selectedControl.id, { releaseOthers: event.target.checked })} /> Release other buttons</label>
              <label className="text-dim">Frame action<select aria-label="Frame step action" value={selectedControl.frameStep ?? ''} onChange={(event) => configureCueFrameStep(selectedControl.id, event.target.value ? event.target.value as 'next' | 'previous' : undefined)} className="ml-1 rounded bg-bg p-1"><option value="">Normal cue</option><option value="next">Next button</option><option value="previous">Previous button</option></select></label>
              {(['intensity', 'speed', 'size'] as const).map((key) => <label key={key} className="capitalize text-dim">{key} %<input aria-label={`Cue ${key}`} type="number" min="0" max="200" value={selectedControl.modifiers?.[key] ?? 100} className="ml-1 w-16 rounded bg-bg p-1" onChange={(event) => configureCueModifiers(selectedControl.id, { [key]: Number(event.target.value) })} /></label>)}
              <label className="text-dim">Priority<input aria-label="Cue priority" type="number" value={selectedControl.priority ?? 0} className="ml-1 w-16 rounded bg-bg p-1" onChange={(event) => configureCuePriority(selectedControl.id, Number(event.target.value))} /></label>
            </div>
          </details>
          {Object.keys(selectedControl.adHocValues ?? {}).length > 0 && <button type="button" className="text-dim" onClick={() => patchControl(selectedControl.id, { adHocValues: {} })}>Remove captured overrides</button>}
          {styleFields({ type: 'cue', id: selectedControl.id }, 'cue', selectedControl.style)}
          {attachmentSelect({ type: 'cue', id: selectedControl.id }, selectedControl.attachedTo)}
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
      </aside>}
    </div>}
    {contextMenu && <div ref={menuRef} role="menu" aria-label="Live edit actions" className="fixed z-[300] min-w-44 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }}>
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { addControl(contextMenu.at); setContextMenu(null) }}>New Button</button>
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { addAnnotation('label', contextMenu.at); setContextMenu(null) }}>Insert Text</button>
      <button type="button" role="menuitem" disabled={!cueLists.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { addList(contextMenu.at); setContextMenu(null) }}>Insert Cuelist</button>
      <div className="my-1 border-t border-line" />
      <button type="button" role="menuitem" disabled={!selectedPageObjects.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { cutSelected(); setContextMenu(null) }}>Cut</button>
      <button type="button" role="menuitem" disabled={!selectedPageObjects.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { copySelectedPageObjects(); setContextMenu(null) }}>Copy</button>
      <button type="button" role="menuitem" disabled={isClipboardEmpty(pageClipboard)} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { pastePageObjects(); setContextMenu(null) }}>Paste</button>
      <button type="button" role="menuitem" disabled={!selectedPageObjects.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { duplicateSelectedPageObjects(); setContextMenu(null) }}>Duplicate</button>
      <button type="button" role="menuitem" disabled={!selectedPageObjects.length} className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2 disabled:opacity-40" onClick={() => { deleteSelectedPageObjects(); setContextMenu(null) }}>Delete</button>
      <div className="my-1 border-t border-line" />
      <button type="button" role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { setContextMenu(null); toggleEditing() }}>✓ Edit Live View</button>
    </div>}
  </section>
}
