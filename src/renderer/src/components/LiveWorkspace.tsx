import { useEffect, useRef, useState } from 'react'
import type { LiveControl, LivePage } from '@shared/types'
import { isLiveWindow } from '../lib/liveWindowBridge'
import { exportPresetPalette, importPresetPalette, serializePresetPalette } from '../lib/presetPaletteIo'
import { isClipboardEmpty, type PageObjectRef, type Rect } from '../lib/livePageObjects'
import { useShowStore } from '../stores/showStore'

type Selection = PageObjectRef
const position = (index: number) => ({ x: 20 + (index % 4) * 180, y: 20 + Math.floor(index / 4) * 90 })

export function LiveWorkspace() {
  const {
    locked, show, scenes, presets, activePresetIds, cueLists, setLivePages, selectLivePage, activeLivePageId,
    activeLiveValues, setLiveValue, clearLiveValues, manualOverrides, clearManualOverrides, activeCueListId,
    activeCueIndex, cuePlaying, goToCue, cueNext, cuePrev, stopCue, updateProject, convertScenesToPresets,
    setPageSwitchMode, selectedPageObjects, pageClipboard, setPageObjectSelection, togglePageObjectSelection,
    selectPageObjectsInRect, clearPageObjectSelection, moveSelectedPageObjects, deleteSelectedPageObjects,
    duplicateSelectedPageObjects, copySelectedPageObjects, pastePageObjects
  } = useShowStore()
  const [editing, setEditing] = useState(false)
  const [managing, setManaging] = useState(false)
  const [name, setName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ id: string; x: number; y: number } | null>(null)
  const drag = useRef<{ ref: Selection; startX: number; startY: number; x: number; y: number } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null)
  const marquee = useRef<{ startX: number; startY: number } | null>(null)
  const paletteFile = useRef<HTMLInputElement>(null)
  const [paletteNote, setPaletteNote] = useState('')

  // The inspector follows a single selection; multiple selected objects are
  // handled entirely by the store's multi-object commands.
  const selection: Selection | null = selectedPageObjects.length === 1 ? selectedPageObjects[0] : null
  const isSelected = (ref: Selection) => selectedPageObjects.some((item) => item.type === ref.type && item.id === ref.id)

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
  const addPage = () => {
    if (!name.trim()) return
    const next: LivePage = { id: crypto.randomUUID(), name: name.trim(), controls: [] }
    setLivePages([...pages, next]); selectLivePage(next.id); setName(''); setEditing(false)
  }
  const addControl = () => {
    if (!page) return
    const control: LiveControl = { id: crypto.randomUUID(), name: 'New cue', type: 'toggle', presetIds: [...activePresetIds], adHocValues: Object.fromEntries(Object.entries(manualOverrides).map(([id, values]) => [id, { ...values }])), ...position(page.controls.length + (page.cueListWidgets?.length ?? 0)) }
    savePage({ ...page, controls: [...page.controls, control] }); setPageObjectSelection([{ type: 'cue', id: control.id }])
  }
  const addPresetControl = (presetId: string, x: number, y: number) => {
    const preset = presets.find((item) => item.id === presetId)
    if (!page || !preset) return
    const control: LiveControl = { id: crypto.randomUUID(), name: preset.name, type: 'toggle', presetIds: [preset.id], x: Math.max(0, Math.min(740, Math.round(x / 10) * 10)), y: Math.max(0, Math.min(440, Math.round(y / 10) * 10)) }
    savePage({ ...page, controls: [...page.controls, control] }); setPageObjectSelection([{ type: 'cue', id: control.id }])
  }
  const addList = () => {
    if (!page || !cueLists[0]) return
    const widget = { id: crypto.randomUUID(), cueListId: cueLists[0].id, ...position(page.controls.length + (page.cueListWidgets?.length ?? 0)) }
    savePage({ ...page, cueListWidgets: [...(page.cueListWidgets ?? []), widget] }); setPageObjectSelection([{ type: 'list', id: widget.id }])
  }
  const addAnnotation = (type: 'label' | 'frame') => {
    if (!page) return
    const item = { id: crypto.randomUUID(), type, text: type === 'label' ? 'New label' : 'New frame', x: 20, y: 20, width: type === 'frame' ? 360 : 160, height: type === 'frame' ? 200 : 40 }
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
  const overrideCount = Object.values(manualOverrides).reduce((sum, attrs) => sum + Object.keys(attrs).length, 0)
  return <section className="flex flex-col gap-2 rounded border border-line bg-bg/30 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-dim">Live page <select aria-label="Live page" className="rounded border border-line bg-panel2 px-2 py-1 text-text" value={page?.id ?? ''} onChange={(event) => { selectLivePage(event.target.value); setEditing(false); clearPageObjectSelection() }}><option value="" disabled>{pages.length ? 'Select page' : 'No pages yet'}</option>{pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {!locked && !isLiveWindow() && <button type="button" className="btn-theme text-xs" onClick={() => { setManaging(!managing); setDeleteId(null) }}>Manage pages</button>}
      {Object.keys(activeLiveValues).length > 0 && <button type="button" className="btn-theme text-xs" onClick={clearLiveValues}>Release page cues</button>}
      {page && !locked && !isLiveWindow() && <button type="button" className="btn-theme ml-auto text-xs" onClick={() => { setEditing(!editing); clearPageObjectSelection() }}>{editing ? 'Done' : 'Edit'}</button>}
    </div>
    {managing && <div role="dialog" aria-label="Manage Live pages" className="rounded border border-line bg-panel2 p-3 text-xs">
      <div className="mb-2 flex justify-between"><strong>Manage Live pages</strong><button type="button" onClick={() => setManaging(false)}>Done</button></div>
      <label className="mb-2 flex items-center gap-2"><input type="checkbox" checked={show?.deactivateOnPageSwitch === true} onChange={(event) => setPageSwitchMode(event.target.checked)} /> Deactivate cues when switching pages (otherwise each page restores its active cues)</label>
      <form className="mb-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); addPage() }}><input aria-label="New Live page name" value={name} onChange={(event) => setName(event.target.value)} placeholder="New page name" className="rounded border border-line bg-bg px-2 py-1" /><button className="btn-theme" disabled={!name.trim()}>+ Add page</button></form>
      {pages.map((item, index) => <div key={item.id} className="flex flex-wrap items-center gap-2 border-t border-line py-2"><input aria-label={`Name ${item.name}`} className="min-w-0 flex-1 rounded bg-bg px-2 py-1" value={item.name} onChange={(event) => setLivePages(pages.map((p) => p.id === item.id ? { ...p, name: event.target.value } : p))} onBlur={() => { if (!item.name.trim()) setLivePages(pages.map((p) => p.id === item.id ? { ...p, name: 'Untitled page' } : p)) }} />
        <label>Fade (s) <input type="number" aria-label={`Fade time for ${item.name}`} min="0" max="60" step="0.1" value={(item.fadeMs ?? 0) / 1000} onChange={(event) => setLivePages(pages.map((p) => p.id === item.id ? { ...p, fadeMs: Math.max(0, Math.min(60000, Number(event.target.value) * 1000)) } : p))} className="w-16 rounded bg-bg p-1" /></label><button type="button" disabled={index === 0} onClick={() => { const next = [...pages]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setLivePages(next) }}>Up</button><button type="button" disabled={index === pages.length - 1} onClick={() => { const next = [...pages]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setLivePages(next) }}>Down</button>
        <button type="button" onClick={() => { const copy: LivePage = { ...item, id: crypto.randomUUID(), name: `${item.name} copy`, controls: item.controls.map((c) => ({ ...c, id: crypto.randomUUID(), presetIds: [...c.presetIds] })), cueListWidgets: item.cueListWidgets?.map((w) => ({ ...w, id: crypto.randomUUID() })), annotations: item.annotations?.map((a) => ({ ...a, id: crypto.randomUUID() })) }; setLivePages([...pages, copy]); selectLivePage(copy.id); clearPageObjectSelection() }}>Duplicate</button>
        {deleteId === item.id ? <><span>Delete?</span><button type="button" className="text-red-300" onClick={() => { const remaining = pages.filter((p) => p.id !== item.id); if (page?.id === item.id) { clearLiveValues(); selectLivePage(remaining[0]?.id ?? null) } setLivePages(remaining); setDeleteId(null); clearPageObjectSelection() }}>Confirm</button><button type="button" onClick={() => setDeleteId(null)}>Cancel</button></> : <button type="button" className="text-red-300" onClick={() => setDeleteId(item.id)}>Delete</button>}
      </div>)}
    </div>}
    {overrideCount > 0 && <div className="flex justify-between rounded border border-amber-500/60 bg-amber-900/30 p-2 text-xs text-amber-100"><span>{overrideCount} manual properties overriding output</span><button type="button" className="underline" onClick={clearManualOverrides}>Release overrides</button></div>}
    {!page ? <p className="text-xs text-dim">Open Manage pages to create your first Live page.</p> : <>
      {editing && !locked && <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn-theme text-xs" onClick={addControl}>+ Cue control</button><button type="button" className="btn-theme text-xs" onClick={addList} disabled={!cueLists.length}>+ Cue list</button><button type="button" className="btn-theme text-xs" onClick={() => addAnnotation('label')}>+ Label</button><button type="button" className="btn-theme text-xs" onClick={() => addAnnotation('frame')}>+ Frame</button>
        {selectedPageObjects.length > 0 && <><span className="text-xs text-dim">{selectedPageObjects.length} selected</span><button type="button" className="btn-theme text-xs" onClick={duplicateSelectedPageObjects}>Duplicate</button><button type="button" className="btn-theme text-xs" onClick={copySelectedPageObjects}>Copy</button><button type="button" className="btn-theme text-xs text-red-300" onClick={deleteSelectedPageObjects}>Delete</button></>}
        {!isClipboardEmpty(pageClipboard) && <button type="button" className="btn-theme text-xs" onClick={() => pastePageObjects()}>Paste</button>}
        <span className="text-xs text-dim">Shift-click or drag on empty space to select several. Drag to move them together. Del / Ctrl+C / Ctrl+V / Ctrl+D.</span></div>}
      {editing && !locked && show?.layout?.palette !== false && <div className="rounded border border-line bg-panel2 p-2 text-xs"><div className="flex flex-wrap items-center gap-2"><strong>Preset palette</strong><span className="text-dim">Drag a preset onto the page to create a cue, or onto an existing cue to add it.</span><button type="button" className="btn-theme" onClick={exportPalette} disabled={!presets.length}>Export JSON</button><button type="button" className="btn-theme" onClick={() => paletteFile.current?.click()}>Import JSON</button><button type="button" className="btn-theme" disabled={!scenes.length} onClick={() => { const added = convertScenesToPresets(); setPaletteNote(added ? `Converted ${added} scene${added === 1 ? '' : 's'} to presets (originals kept).` : 'Scenes already converted.') }}>Convert scenes</button><input ref={paletteFile} type="file" accept="application/json,.json" aria-label="Import preset palette JSON" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await importPalette(await file.text()) }} />{paletteNote && <span className="text-dim" role="status">{paletteNote}</span>}</div><div className="mt-2 flex flex-wrap gap-1">{presets.map((preset) => <span key={preset.id} draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-openlights-preset', preset.id); event.dataTransfer.effectAllowed = 'copy' }} className="cursor-grab rounded border border-line bg-bg px-2 py-1">{preset.name}</span>)}{!presets.length && <span className="text-dim">Capture presets in Scenes & cues first, or import a palette.</span>}</div></div>}
      <div className="overflow-auto rounded border border-line"><div className="relative bg-panel" style={{ width: 900, height: 520, backgroundImage: editing ? 'radial-gradient(var(--line) 1px, transparent 1px)' : undefined, backgroundSize: '10px 10px' }} onPointerDown={beginMarquee} onPointerMove={moveMarquee} onPointerUp={endMarquee} onPointerCancel={() => { marquee.current = null; setMarqueeRect(null) }} onDragOver={(event) => { if (editing && event.dataTransfer.types.includes('application/x-openlights-preset')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }} onDrop={(event) => { if (!editing) return; const id = event.dataTransfer.getData('application/x-openlights-preset'); if (!id) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); addPresetControl(id, event.clientX - rect.left, event.clientY - rect.top) }}>
        {marqueeRect && <div className="pointer-events-none absolute border border-dashed border-[var(--accent)] bg-[var(--accent)]/10" style={{ left: Math.min(marqueeRect.x, marqueeRect.x + marqueeRect.width), top: Math.min(marqueeRect.y, marqueeRect.y + marqueeRect.height), width: Math.abs(marqueeRect.width), height: Math.abs(marqueeRect.height) }} />}
        {(page.annotations ?? []).map((item) => <div key={item.id} className={`absolute ${item.type === 'frame' ? 'border border-line rounded' : ''} ${editing && !locked && isSelected({ type: 'annotation', id: item.id }) ? 'outline outline-1 outline-[var(--accent)]' : ''}`} style={{ left: draft?.id === item.id ? draft.x : item.x, top: draft?.id === item.id ? draft.y : item.y, width: item.width, height: item.height, pointerEvents: 'none' }}><div className={`px-2 py-1 text-xs text-dim ${editing ? 'cursor-grab bg-panel2' : ''}`} style={{ pointerEvents: editing ? 'auto' : 'none' }} onPointerDown={(e) => beginDrag(e, { type: 'annotation', id: item.id }, item.x, item.y)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }}>{item.text}</div></div>)}
        {page.controls.map((control, index) => {
          const p = position(index), x = draft?.id === control.id ? draft.x : control.x ?? p.x, y = draft?.id === control.id ? draft.y : control.y ?? p.y
          const level = activeLiveValues[control.id] ?? 0
          return <div key={control.id} data-project-id={control.id} className={`absolute w-40 rounded border ${isSelected({ type: 'cue', id: control.id }) && editing ? 'border-accent' : 'border-line'} bg-panel2 p-1 text-xs`} style={{ left: x, top: y }} onDragOver={(event) => { if (editing && event.dataTransfer.types.includes('application/x-openlights-preset')) event.preventDefault() }} onDrop={(event) => { if (!editing) return; const id = event.dataTransfer.getData('application/x-openlights-preset'); if (!presets.some((preset) => preset.id === id)) return; event.preventDefault(); event.stopPropagation(); if (!control.presetIds.includes(id)) patchControl(control.id, { presetIds: [...control.presetIds, id] }); setPageObjectSelection([{ type: 'cue', id: control.id }]) }}>
            {editing ? <button type="button" className="w-full cursor-grab rounded bg-bg px-2 py-2 text-left" onPointerDown={(e) => beginDrag(e, { type: 'cue', id: control.id }, x, y)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }}>↕ {control.name}</button> : control.type === 'fader' ? <label className="block p-1 text-center"><span>{control.name}</span><input aria-label={control.name} type="range" min="0" max="255" value={level} onChange={(e) => setLiveValue(control.id, Number(e.target.value))} className="w-full accent-[var(--accent)]" /><span>{Math.round(level / 255 * 100)}%</span></label> : <button type="button" aria-pressed={level > 0} className={`pad w-full rounded p-2 ${level ? 'active' : ''}`} onClick={control.type === 'toggle' ? () => setLiveValue(control.id, level ? 0 : 255) : undefined} onPointerDown={control.type === 'flash' ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); setLiveValue(control.id, 255) } : undefined} onPointerUp={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onPointerCancel={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onKeyDown={control.type === 'flash' ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setLiveValue(control.id, 255) } } : undefined} onKeyUp={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined} onBlur={control.type === 'flash' ? () => setLiveValue(control.id, 0) : undefined}>{control.name}{control.type === 'flash' && ' (hold)'}</button>}
          </div>
        })}
        {(page.cueListWidgets ?? []).map((widget) => {
          const list = cueLists.find((item) => item.id === widget.cueListId), x = draft?.id === widget.id ? draft.x : widget.x, y = draft?.id === widget.id ? draft.y : widget.y, current = activeCueListId === list?.id ? activeCueIndex : -1, next = list?.steps[current + 1] ?? (list?.loop ? list.steps[0] : undefined)
          return <div key={widget.id} className={`absolute w-60 rounded border ${isSelected({ type: 'list', id: widget.id }) && editing ? 'border-accent' : 'border-line'} bg-panel2 p-2 text-xs`} style={{ left: x, top: y }}>
            <div className={editing ? 'cursor-grab rounded bg-bg p-1' : 'font-semibold'} onPointerDown={(e) => beginDrag(e, { type: 'list', id: widget.id }, x, y)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; setDraft(null) }}>{editing && !locked && '↕ '}{list?.name ?? 'Missing cue list'}</div>
            <p className="mt-1 text-dim">Current: {current >= 0 ? scenes.find((s) => s.id === list?.steps[current]?.sceneId)?.name ?? 'Missing scene' : 'Not started'}</p><p className="text-dim">Next: {next ? scenes.find((s) => s.id === next.sceneId)?.name ?? 'Missing scene' : 'End of list'}</p>
            {!editing && list && <div className="mt-2 flex gap-1"><button className="btn-theme" onClick={stopCue} disabled={current < 0 || !cuePlaying}>Stop</button><button className="btn-theme" onClick={cuePrev} disabled={current < 0}>Back</button><button className="btn-theme on" disabled={!list.steps.length} onClick={() => current >= 0 ? cueNext() : goToCue(list.id, 0)}>Go</button></div>}
          </div>
        })}
      </div></div>
      {editing && !locked && show?.layout?.inspector !== false && selectedControl && <div className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel2 p-2 text-xs"><label>Name<input aria-label="Cue name" value={selectedControl.name} onChange={(e) => patchControl(selectedControl.id, { name: e.target.value })} className="block rounded bg-bg p-1" /></label><label>Type<select aria-label="Cue control type" value={selectedControl.type} onChange={(e) => { setLiveValue(selectedControl.id, 0); patchControl(selectedControl.id, { type: e.target.value as LiveControl['type'] }) }} className="block rounded bg-bg p-1"><option value="toggle">Toggle</option><option value="flash">Hold to flash</option><option value="fader">Fader</option></select></label><label>Scene<select aria-label="Cue scene" value={selectedControl.sceneId ?? ''} onChange={(e) => patchControl(selectedControl.id, { sceneId: e.target.value || undefined })} className="block rounded bg-bg p-1"><option value="">No scene</option>{scenes.filter((s) => !s.blackout).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><details><summary>Presets ({selectedControl.presetIds.length})</summary>{presets.map((p) => <label key={p.id} className="block"><input type="checkbox" checked={selectedControl.presetIds.includes(p.id)} onChange={(e) => patchControl(selectedControl.id, { presetIds: e.target.checked ? [...selectedControl.presetIds, p.id] : selectedControl.presetIds.filter((id) => id !== p.id) })} /> {p.name}</label>)}</details>{Object.keys(selectedControl.adHocValues ?? {}).length > 0 && <button type="button" className="text-dim" onClick={() => patchControl(selectedControl.id, { adHocValues: {} })}>Remove captured overrides</button>}<button type="button" className="text-red-300" onClick={() => { setLiveValue(selectedControl.id, 0); savePage({ ...page, controls: page.controls.filter((c) => c.id !== selectedControl.id) }); clearPageObjectSelection() }}>Remove</button></div>}
      {editing && !locked && show?.layout?.inspector !== false && selectedList && <div className="flex gap-2 rounded border border-line bg-panel2 p-2 text-xs"><label>Cue list <select aria-label="Widget cue list" value={selectedList.cueListId} onChange={(e) => savePage({ ...page, cueListWidgets: (page.cueListWidgets ?? []).map((w) => w.id === selectedList.id ? { ...w, cueListId: e.target.value } : w) })} className="rounded bg-bg p-1">{cueLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label><button type="button" className="text-red-300" onClick={() => { savePage({ ...page, cueListWidgets: (page.cueListWidgets ?? []).filter((w) => w.id !== selectedList.id) }); clearPageObjectSelection() }}>Remove</button></div>}
      {editing && !locked && show?.layout?.inspector !== false && selectedAnnotation && <div className="flex flex-wrap items-end gap-2 rounded border border-line bg-panel2 p-2 text-xs">{(['text', 'width', 'height'] as const).map((key) => <label key={key} className="capitalize">{key}<input aria-label={`${selectedAnnotation.type} ${key}`} type={key === 'text' ? 'text' : 'number'} min={key === 'text' ? undefined : 20} value={selectedAnnotation[key]} onChange={(e) => { const value = key === 'text' ? e.target.value : Math.max(20, Math.min(900, Number(e.target.value))); savePage({ ...page, annotations: (page.annotations ?? []).map((a) => a.id === selectedAnnotation.id ? { ...a, [key]: value } : a) }) }} className="block w-32 rounded bg-bg p-1" /></label>)}<button type="button" className="text-red-300" onClick={() => { savePage({ ...page, annotations: (page.annotations ?? []).filter((a) => a.id !== selectedAnnotation.id) }); clearPageObjectSelection() }}>Remove</button></div>}
    </>}
  </section>
}
