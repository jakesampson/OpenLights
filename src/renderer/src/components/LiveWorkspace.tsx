import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { FrameConfig, LiveControl, LiveObjectKind, LiveObjectStyle, LivePage } from '@shared/types'
import { clampModifier, clampLiveSize, DEFAULT_OBJECT_STYLES, frameConfigFor, LIVE_CUE_SIZE, LIVE_LIST_SIZE } from '@shared/liveObjectDefaults'
import { isLiveWindow } from '../lib/liveWindowBridge'
import { exportPresetPalette, importPresetPalette, serializePresetPalette } from '../lib/presetPaletteIo'
import {
  isClipboardEmpty, newAnnotationObject, newCueObject, newWidgetObject, objectLabel, positionedObjects,
  type PageObjectRef, type Rect
} from '../lib/livePageObjects'
import {
  decodeLiveDrop, encodeLiveDrop, LIVE_DROP_MIME, LEGACY_PRESET_MIME, type LiveDropPayload
} from '../lib/liveDrops'
import { useShowStore } from '../stores/showStore'
import { inspectorFields, type InspectorTarget } from '../lib/liveInspector'
import { CueContentsEditor } from './CueContentsEditor'
import { CueListEditor } from './CueListEditor'

type Selection = PageObjectRef
const position = (index: number) => ({ x: 20 + (index % 4) * 180, y: 20 + Math.floor(index / 4) * 90 })

export function LiveWorkspace({ initialEditing = false }: { initialEditing?: boolean } = {}) {
  const {
    locked, show, scenes, presets, activePresetIds, cueLists, setLivePages, selectLivePage, activeLivePageId,
    activeLiveValues, setLiveValue, clearLiveValues, manualOverrides, clearManualOverrides, activeCueListId,
    activeCueIndex, cuePlaying, goToCue, cueNext, cuePrev, stopCue, updateProject, convertScenesToPresets,
    selectedPageObjects, pageClipboard, setPageObjectSelection, togglePageObjectSelection,
    selectPageObjectsInRect, clearPageObjectSelection, moveSelectedPageObjects, deleteSelectedPageObjects,
    duplicateSelectedPageObjects, copySelectedPageObjects, pastePageObjects, resizePageObject, renamePageObject,
    attachPageObject, setPageObjectStyle, configureFrame, dropOnLivePage
  } = useShowStore()
  const [editing, setEditing] = useState(initialEditing)
  const [draft, setDraft] = useState<{ id: string; x: number; y: number } | null>(null)
  const drag = useRef<{ ref: Selection; startX: number; startY: number; x: number; y: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null)
  const marquee = useRef<{ startX: number; startY: number } | null>(null)
  const resize = useRef<{ ref: PageObjectRef; startX: number; startY: number; width: number; height: number } | null>(null)
  const [resizeDraft, setResizeDraft] = useState<{ id: string; width: number; height: number } | null>(null)
  const [renaming, setRenaming] = useState<{ ref: PageObjectRef; value: string } | null>(null)
  const paletteFile = useRef<HTMLInputElement>(null)
  const pageCanvas = useRef<HTMLDivElement>(null)
  const [paletteNote, setPaletteNote] = useState('')
  const [paletteSelection, setPaletteSelection] = useState<{ presets: string[]; sequences: string[] }>({ presets: [], sequences: [] })

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

  const exportPalette = () => {
    try {
      const doc = exportPresetPalette(presets, show?.fixtures ?? [])
      const url = URL.createObjectURL(new Blob([serializePresetPalette(doc)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'openlights-preset-palette.json'
      a.click()
      URL.revokeObjectURL(url)
      setPaletteNote(`Exported ${presets.length} preset${presets.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setPaletteNote(`Export failed: ${String(error)}`)
    }
  }

  const importPalette = async (text: string) => {
    try {
      const result = importPresetPalette(text, show?.fixtures ?? [], {
        onSkip: (info) => console.warn(`Preset palette: skipped fixture ${info.fixtureName} (${info.fixtureId}) — ${info.reason}`)
      })
      updateProject({ presets: [...presets, ...result.presets] })
      const skipped = result.skipped.length
      setPaletteNote(`Imported ${result.presets.length} preset${result.presets.length === 1 ? '' : 's'}${skipped ? `; skipped ${skipped} fixture${skipped === 1 ? '' : 's'} (see console)` : ''}.`)
    } catch (error) {
      setPaletteNote(`Import failed: ${String(error)}`)
    }
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
      setEditing(false)
      clearPageObjectSelection()
      return
    }
    if (!page) {
      const next: LivePage = { id: crypto.randomUUID(), name: `Page ${pages.length + 1}`, controls: [] }
      setLivePages([...pages, next])
      selectLivePage(next.id)
    }
    setEditing(true)
    clearPageObjectSelection()
  }
  const addControl = () => {
    if (!page) return
    const at = position(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const control = newCueObject(crypto.randomUUID(), at.x, at.y, page.defaultStyles, {
      presetIds: [...activePresetIds],
      adHocValues: Object.fromEntries(Object.entries(manualOverrides).map(([id, values]) => [id, { ...values }]))
    })
    savePage({ ...page, controls: [...page.controls, control] }); setPageObjectSelection([{ type: 'cue', id: control.id }])
  }
  const addSceneControl = (sceneId: string) => {
    if (!page) return
    const scene = scenes.find((item) => item.id === sceneId)
    if (!scene) return
    const at = position(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const control = newCueObject(crypto.randomUUID(), at.x, at.y, page.defaultStyles, { name: scene.name, sceneId: scene.id })
    savePage({ ...page, controls: [...page.controls, control] })
    setPageObjectSelection([{ type: 'cue', id: control.id }])
  }
  // Palette drag sources: clicking selects several presets/sequences, and
  // dragging a selected chip carries the whole selection (7.10).
  const paletteItems = (kind: 'presets' | 'sequences', id: string): string[] => {
    const selected = paletteSelection[kind]
    return selected.includes(id) ? selected : [id]
  }
  const togglePaletteItem = (kind: 'presets' | 'sequences', id: string) =>
    setPaletteSelection((prev) => ({
      ...prev,
      [kind]: prev[kind].includes(id) ? prev[kind].filter((item) => item !== id) : [...prev[kind], id]
    }))
  const palettePayload = (kind: 'presets' | 'sequences', id: string): LiveDropPayload | null => {
    const ids = paletteItems(kind, id)
    const named = (items: { id: string; name: string }[]) =>
      Object.fromEntries(items.filter((item) => ids.includes(item.id)).map((item) => [item.id, item.name]))
    if (kind === 'presets') {
      if (!ids.some((presetId) => presets.some((preset) => preset.id === presetId))) return null
      return { presetIds: ids, sequenceIds: [], presetNames: named(presets) }
    }
    const sequences = show?.sequences ?? []
    if (!ids.some((sequenceId) => sequences.some((sequence) => sequence.id === sequenceId))) return null
    return { presetIds: [], sequenceIds: ids, sequenceNames: named(sequences) }
  }
  const startPaletteDrag = (event: React.DragEvent, kind: 'presets' | 'sequences', id: string) => {
    const payload = palettePayload(kind, id)
    if (!payload) return
    event.dataTransfer.setData(LIVE_DROP_MIME, encodeLiveDrop(payload))
    if (kind === 'presets' && payload.presetIds.length === 1) event.dataTransfer.setData(LEGACY_PRESET_MIME, payload.presetIds[0])
    event.dataTransfer.effectAllowed = 'copy'
  }
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
  const addList = () => {
    if (!page || !cueLists[0]) return
    const at = position(page.controls.length + (page.cueListWidgets?.length ?? 0))
    const widget = newWidgetObject(crypto.randomUUID(), cueLists[0].id, at.x, at.y, page.defaultStyles)
    savePage({ ...page, cueListWidgets: [...(page.cueListWidgets ?? []), widget] }); setPageObjectSelection([{ type: 'list', id: widget.id }])
  }
  const addAnnotation = (type: 'label' | 'frame') => {
    if (!page) return
    const item = newAnnotationObject(crypto.randomUUID(), type, 20, 20, page.defaultStyles)
    savePage({ ...page, annotations: [...(page.annotations ?? []), item] }); setPageObjectSelection([{ type: 'annotation', id: item.id }])
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
  }, [editing, locked, selectedPageObjects, deleteSelectedPageObjects, copySelectedPageObjects, pastePageObjects, duplicateSelectedPageObjects, clearPageObjectSelection])
  const selectedControl = selection?.type === 'cue' ? page?.controls.find((item) => item.id === selection.id) : undefined
  const selectedList = selection?.type === 'list' ? page?.cueListWidgets?.find((item) => item.id === selection.id) : undefined
  const selectedAnnotation = selection?.type === 'annotation' ? page?.annotations?.find((item) => item.id === selection.id) : undefined
  const inspectorTarget: InspectorTarget = selectedControl ? 'cue' : selectedList ? 'cuelist' : selectedAnnotation?.type === 'frame' ? 'frame' : selectedAnnotation ? 'label' : 'page'
  const overrideCount = Object.values(manualOverrides).reduce((sum, attrs) => sum + Object.keys(attrs).length, 0)
  return <section data-context-menu="page" aria-label="Live page canvas" className="flex min-h-full flex-col gap-2 rounded border border-line bg-bg/30 p-3">
    <div className="flex flex-wrap items-center gap-2">
      {page && <span className="text-xs font-semibold text-text">{page.name}</span>}
      {Object.keys(activeLiveValues).length > 0 && <button type="button" className="btn-theme text-xs" onClick={clearLiveValues}>Release page cues</button>}
      {!locked && !isLiveWindow() && <button type="button" className="live-page-edit btn-theme ml-auto text-xs" onClick={toggleEditing}>{editing ? 'Done' : 'Edit'}</button>}
    </div>
    {overrideCount > 0 && <div className="flex justify-between rounded border border-amber-500/60 bg-amber-900/30 p-2 text-xs text-amber-100"><span>{overrideCount} manual properties overriding output</span><button type="button" className="underline" onClick={clearManualOverrides}>Release overrides</button></div>}
    {!page ? <div className="flex min-h-32 flex-1 items-center justify-center rounded border border-line bg-panel text-xs text-dim">This Live page is blank. Select Edit to start arranging controls.</div> : <>
      {editing && !locked && <div className="flex flex-wrap items-center gap-2"><label className="btn-theme text-xs">+ Scene button <select aria-label="Add scene button" defaultValue="" onChange={(event) => { if (event.target.value) addSceneControl(event.target.value); event.target.value = '' }} className="ml-1 bg-transparent"><option value="" disabled>Choose scene…</option>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label><button type="button" className="btn-theme text-xs" onClick={addControl}>+ Custom cue</button><button type="button" className="btn-theme text-xs" onClick={addList} disabled={!cueLists.length}>+ Cue list</button><button type="button" className="btn-theme text-xs" onClick={() => addAnnotation('label')}>+ Label</button><button type="button" className="btn-theme text-xs" onClick={() => addAnnotation('frame')}>+ Frame</button>
        {selectedPageObjects.length > 0 && <><span className="text-xs text-dim">{selectedPageObjects.length} selected</span><button type="button" className="btn-theme text-xs" onClick={duplicateSelectedPageObjects}>Duplicate</button><button type="button" className="btn-theme text-xs" onClick={copySelectedPageObjects}>Copy</button><button type="button" className="btn-theme text-xs text-red-300" onClick={deleteSelectedPageObjects}>Delete</button></>}
        {!isClipboardEmpty(pageClipboard) && <button type="button" className="btn-theme text-xs" onClick={() => pastePageObjects()}>Paste</button>}
        <span className="text-xs text-dim">Shift-click or drag on empty space to select several. Drag to move them together. Use "Attached to" in the inspector so a button follows a frame. Del / Ctrl+C / Ctrl+V / Ctrl+D.</span></div>}
      {editing && !locked && <details className="rounded border border-line bg-panel2 p-2 text-xs"><summary>Default styles for new objects</summary>
        <div className="mt-2 space-y-2">
          {(['cue', 'list', 'label', 'frame'] as const).map((kind) => {
            const current = { ...DEFAULT_OBJECT_STYLES[kind], ...page.defaultStyles?.[kind] }
            const update = (patch: Partial<LiveObjectStyle>) => savePage({ ...page, defaultStyles: { ...page.defaultStyles, [kind]: { ...current, ...patch } } })
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
      </details>}
      {editing && !locked && show?.layout?.palette !== false && <div className="rounded border border-line bg-panel2 p-2 text-xs">
        <div className="flex flex-wrap items-center gap-2"><strong>Preset palette</strong><span className="text-dim">Click to select several, then drag onto the page, a frame or a cue button. Hold Ctrl to make one button per item.</span><button type="button" className="btn-theme" onClick={exportPalette} disabled={!presets.length}>Export JSON</button><button type="button" className="btn-theme" onClick={() => paletteFile.current?.click()}>Import JSON</button><button type="button" className="btn-theme" disabled={!scenes.length} onClick={() => { const added = convertScenesToPresets(); setPaletteNote(added ? `Converted ${added} scene${added === 1 ? '' : 's'} to presets (originals kept).` : 'Scenes already converted.') }}>Convert scenes</button><input ref={paletteFile} type="file" accept="application/json,.json" aria-label="Import preset palette JSON" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await importPalette(await file.text()) }} />{paletteNote && <span className="text-dim" role="status">{paletteNote}</span>}</div>
        <div className="mt-2 flex flex-wrap gap-1">{presets.map((preset) => <button key={preset.id} type="button" draggable aria-pressed={paletteSelection.presets.includes(preset.id)} onClick={() => togglePaletteItem('presets', preset.id)} onDragStart={(event) => startPaletteDrag(event, 'presets', preset.id)} className={`cursor-grab rounded border bg-bg px-2 py-1 ${paletteSelection.presets.includes(preset.id) ? 'border-[var(--accent)]' : 'border-line'}`}>{preset.name}</button>)}{!presets.length && <span className="text-dim">Capture or import a preset to populate this palette.</span>}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1"><strong className="mr-1 text-dim">Sequences</strong>{(show?.sequences ?? []).map((sequence) => <button key={sequence.id} type="button" draggable aria-pressed={paletteSelection.sequences.includes(sequence.id)} onClick={() => togglePaletteItem('sequences', sequence.id)} onDragStart={(event) => startPaletteDrag(event, 'sequences', sequence.id)} className={`cursor-grab rounded border bg-bg px-2 py-1 ${paletteSelection.sequences.includes(sequence.id) ? 'border-[var(--accent)]' : 'border-line'}`}>{sequence.name}</button>)}{!show?.sequences?.length && <span className="text-dim">No sequences in this project yet.</span>}</div>
      </div>}
      <div className="overflow-auto rounded border border-line"><div ref={pageCanvas} className="relative bg-panel" style={{ width: 900, height: 520, backgroundImage: editing ? 'radial-gradient(var(--line) 1px, transparent 1px)' : undefined, backgroundSize: '10px 10px' }} onPointerDown={beginMarquee} onPointerMove={moveMarquee} onPointerUp={endMarquee} onPointerCancel={() => { marquee.current = null; setMarqueeRect(null) }} onDragOver={allowDrop} onDrop={(event) => dropAt(event)}>
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
      {editing && !locked && selectedControl && <CueContentsEditor control={selectedControl} />}
      {editing && !locked && selectedList && <CueListEditor listId={selectedList.cueListId} />}
      {editing && !locked && <aside className="rounded border border-line bg-panel2 p-2 text-xs" aria-label={`${inspectorTarget} inspector`} data-fields={inspectorFields(inspectorTarget).join(',')}><strong className="mb-2 block capitalize">{inspectorTarget} inspector</strong>
      {!selection && <div className="flex flex-wrap gap-2"><label>Name<input aria-label="Page name" value={page.name} onChange={(e) => savePage({ ...page, name: e.target.value })} className="ml-1 rounded bg-bg p-1" /></label><label>Fade (ms)<input aria-label="Page fade time" type="number" min="0" value={page.fadeMs ?? 0} onChange={(e) => savePage({ ...page, fadeMs: Math.max(0, Number(e.target.value)) })} className="ml-1 w-24 rounded bg-bg p-1" /></label></div>}
      {selectedControl && <div className="flex flex-wrap items-end gap-2"><label>Name<input aria-label="Cue name" value={selectedControl.name} onChange={(e) => patchControl(selectedControl.id, { name: e.target.value })} className="block rounded bg-bg p-1" /></label><label>Type<select aria-label="Cue control type" value={selectedControl.type} onChange={(e) => { setLiveValue(selectedControl.id, 0); patchControl(selectedControl.id, { type: e.target.value as LiveControl['type'] }) }} className="block rounded bg-bg p-1"><option value="toggle">Toggle</option><option value="flash">Hold to flash</option><option value="fader">Fader</option></select></label><label>Scene<select aria-label="Cue scene" value={selectedControl.sceneId ?? ''} onChange={(e) => patchControl(selectedControl.id, { sceneId: e.target.value || undefined })} className="block rounded bg-bg p-1"><option value="">No scene</option>{scenes.filter((s) => !s.blackout).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><details><summary>Presets ({selectedControl.presetIds.length})</summary>{presets.map((p) => <label key={p.id} className="block"><input type="checkbox" checked={selectedControl.presetIds.includes(p.id)} onChange={(e) => patchControl(selectedControl.id, { presetIds: e.target.checked ? [...selectedControl.presetIds, p.id] : selectedControl.presetIds.filter((id) => id !== p.id) })} /> {p.name}</label>)}</details><details><summary>Sequences ({(selectedControl.sequenceIds ?? []).length})</summary>{(show?.sequences ?? []).map((s) => <label key={s.id} className="block"><input type="checkbox" checked={(selectedControl.sequenceIds ?? []).includes(s.id)} onChange={(e) => patchControl(selectedControl.id, { sequenceIds: e.target.checked ? [...(selectedControl.sequenceIds ?? []), s.id] : (selectedControl.sequenceIds ?? []).filter((id) => id !== s.id) })} /> {s.name}</label>)}</details>{Object.keys(selectedControl.adHocValues ?? {}).length > 0 && <button type="button" className="text-dim" onClick={() => patchControl(selectedControl.id, { adHocValues: {} })}>Remove captured overrides</button>}{styleFields({ type: 'cue', id: selectedControl.id }, 'cue', selectedControl.style)}{attachmentSelect({ type: 'cue', id: selectedControl.id }, selectedControl.attachedTo)}<button type="button" className="text-red-300" onClick={() => { setLiveValue(selectedControl.id, 0); savePage({ ...page, controls: page.controls.filter((c) => c.id !== selectedControl.id) }); clearPageObjectSelection() }}>Remove</button></div>}
      {editing && !locked && show?.layout?.inspector !== false && selectedList && <div className="flex gap-2 rounded border border-line bg-panel2 p-2 text-xs"><label>Cue list <select aria-label="Widget cue list" value={selectedList.cueListId} onChange={(e) => savePage({ ...page, cueListWidgets: (page.cueListWidgets ?? []).map((w) => w.id === selectedList.id ? { ...w, cueListId: e.target.value } : w) })} className="rounded bg-bg p-1">{cueLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>{styleFields({ type: 'list', id: selectedList.id }, 'list', selectedList.style)}{attachmentSelect({ type: 'list', id: selectedList.id }, selectedList.attachedTo)}<button type="button" className="text-red-300" onClick={() => { savePage({ ...page, cueListWidgets: (page.cueListWidgets ?? []).filter((w) => w.id !== selectedList.id) }); clearPageObjectSelection() }}>Remove</button></div>}
      {editing && !locked && show?.layout?.inspector !== false && selectedAnnotation && <div className="flex flex-wrap items-end gap-2">{(['text', 'width', 'height'] as const).map((key) => <label key={key} className="capitalize">{key}<input aria-label={`${selectedAnnotation.type} ${key}`} type={key === 'text' ? 'text' : 'number'} min={key === 'text' ? undefined : 20} value={selectedAnnotation[key]} onChange={(e) => { const ref: PageObjectRef = { type: 'annotation', id: selectedAnnotation.id }; if (key === 'text') renamePageObject(ref, e.target.value); else { const other = key === 'width' ? selectedAnnotation.height : selectedAnnotation.width; resizePageObject(ref, key === 'width' ? Number(e.target.value) : other, key === 'height' ? Number(e.target.value) : other) } }} className="block w-32 rounded bg-bg p-1" /></label>)}{styleFields({ type: 'annotation', id: selectedAnnotation.id }, selectedAnnotation.type, selectedAnnotation.style)}{selectedAnnotation.type === 'frame' && frameConfigFields(selectedAnnotation.id, selectedAnnotation.frame)}{attachmentSelect({ type: 'annotation', id: selectedAnnotation.id }, selectedAnnotation.attachedTo)}<button type="button" className="text-red-300" onClick={() => { savePage({ ...page, annotations: (page.annotations ?? []).filter((a) => a.id !== selectedAnnotation.id) }); clearPageObjectSelection() }}>Remove</button></div>}
      </aside>}
    </>}
  </section>
}
