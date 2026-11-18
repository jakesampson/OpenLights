import { useEffect, useRef, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import type { ShowDef } from '@shared/types'
import type { ShowMeta } from '../global'
import { projectNameFromPath } from '../lib/projectName'
import { hasUnsavedChanges, transitionDecision } from '../lib/projectLifecycle'

export function ProjectBar() {
  const { show, setShow } = useShowStore()
  const [shows, setShows] = useState<ShowMeta[]>([])
  const [newName, setNewName] = useState('')
  const [renameName, setRenameName] = useState('')
  const allowCloseRef = useRef(false)
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [pendingTransition, setPendingTransition] = useState<(() => void) | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const savedSnapshotRef = useRef<string>(JSON.stringify(useShowStore.getState().show))
  const saveRef = useRef<() => void>(() => undefined)

  const requestTransition = (action: () => void) => {
    if (transitionDecision(hasUnsavedChanges(useShowStore.getState().show, savedSnapshotRef.current)) === 'prompt') { setPendingTransition(() => action); setOpen(true) }
    else action()
  }
  const applySavedName = (path: string, showId: string) => {
    const current = useShowStore.getState().show
    if (current?.id === showId) {
      const name = projectNameFromPath(path)
      if (name && current.name !== name) useShowStore.getState().updateProject({ name })
    }
  }

  const refreshList = async () => {
    if (!window.electronAPI?.listShows) return
    try {
      const list = await window.electronAPI.listShows()
      setShows(list || [])
    } catch (e) {
      console.error('Failed to list shows', e)
    }
  }

  useEffect(() => {
    refreshList()
  }, [])

  // Close the popover when clicking elsewhere.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const handleSave = async () => {
    if (!show || !window.electronAPI) return false
    const result = await window.electronAPI.saveShow(
      { ...useShowStore.getState().showForSave(), updatedAt: Date.now() },
      currentPath ?? undefined
    )
    if (result.success) {
      if (result.path) applySavedName(result.path, show.id)
      savedSnapshotRef.current = JSON.stringify(useShowStore.getState().show)
      setCurrentPath(result.path ?? null)
      setStatus('Saved')
      refreshList()
      return true
    } else {
      setStatus(result.error ?? 'Save failed')
      return false
    }
  }

  saveRef.current = handleSave

  // Debounced autosave after any change, so a service can't lose a look.
  useEffect(() => {
    if (!show) return
    if (JSON.stringify(show) === savedSnapshotRef.current) return
    const timer = window.setTimeout(async () => {
      const snapshot = useShowStore.getState().show
      if (!snapshot || !window.electronAPI) return
      const result = await window.electronAPI.saveShow(
        { ...useShowStore.getState().showForSave(), updatedAt: Date.now() },
        currentPath ?? undefined
      )
      if (result.success) {
        if (result.path) applySavedName(result.path, snapshot.id)
        savedSnapshotRef.current = JSON.stringify(useShowStore.getState().show)
        if (result.path) setCurrentPath(result.path)
        setStatus('Autosaved')
        refreshList()
      }
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [show, currentPath])

  const handleSaveAs = async () => {
    if (!show || !window.electronAPI) return
    const result = await window.electronAPI.saveShowAs(useShowStore.getState().showForSave(), currentPath ?? undefined)
    if (result.success && !result.canceled) {
      if (result.path) applySavedName(result.path, show.id)
      savedSnapshotRef.current = JSON.stringify(useShowStore.getState().show)
      setCurrentPath(result.path ?? null)
      setStatus('Saved')
      refreshList()
    }
  }

  const handleLoad = async (path: string) => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.loadShow(path)
    if (result.success && result.data) {
      const data = result.data as ShowDef
      const loaded = { ...data, name: projectNameFromPath(result.path ?? path) || data.name }
      setShow(loaded)
      savedSnapshotRef.current = JSON.stringify(loaded)
      setCurrentPath(result.path ?? path)
      setStatus('Loaded')
      setOpen(false)
    } else {
      setStatus(result.error ?? 'Load failed')
    }
  }

  const handleOpen = async () => {
    if (!window.electronAPI) return
    const result = await window.electronAPI.openShow()
    if (result.canceled) return
    if (result.success && result.data) {
      const data = result.data as ShowDef
      const loaded = { ...data, name: result.path ? projectNameFromPath(result.path) : data.name }
      setShow(loaded)
      savedSnapshotRef.current = JSON.stringify(loaded)
      setCurrentPath(result.path ?? null)
      setStatus('Opened')
      refreshList()
      setOpen(false)
    } else {
      setStatus(result.error ?? 'Open failed')
    }
  }

  // When the app itself is quitting (Cmd+Q / menu Quit), the main process
  // says so first: allow the close so beforeunload below does not veto the
  // quit and strand the app in the Dock with no window. The 1.5s autosave
  // is the protection for unsaved work on this path.
  useEffect(() => {
    if (!window.electronAPI?.onAppQuitting) return
    return window.electronAPI.onAppQuitting(() => { allowCloseRef.current = true })
  }, [])

  useEffect(() => {
    const beforeClose = (event: BeforeUnloadEvent) => {
      if (allowCloseRef.current || !hasUnsavedChanges(useShowStore.getState().show, savedSnapshotRef.current)) return
      event.preventDefault(); event.returnValue = false as unknown as string
      requestTransition(() => { allowCloseRef.current = true; window.electronAPI.closeWindow() })
    }
    window.addEventListener('beforeunload', beforeClose)
    return () => window.removeEventListener('beforeunload', beforeClose)
  }, [show])

  const handleRename = async () => {
    if (!currentPath || !renameName.trim()) return
    if (!(await handleSave())) return
    const result = await window.electronAPI.renameShow(currentPath, renameName)
    if (!result.success || !result.path) { setStatus(result.error ?? 'Rename failed'); return }
    applySavedName(result.path, show!.id); savedSnapshotRef.current = JSON.stringify(useShowStore.getState().show)
    setCurrentPath(result.path); setRenameName(''); setStatus('Renamed'); void refreshList()
  }
  const handleDelete = async (path: string) => {
    if (!window.electronAPI) return
    if (!confirm('Delete this show file?')) return
    await window.electronAPI.deleteShow(path)
    if (currentPath === path) setCurrentPath(null)
    refreshList()
  }

  const handleNew = () => {
    const name = newName.trim() || `Show ${shows.length + 1}`
    const blank: ShowDef = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      name,
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      fixtures: [],
      cues: [],
      automations: [],
      midiMappings: []
    }
    setShow(blank)
    savedSnapshotRef.current = ''
    setCurrentPath(null)
    setNewName('')
    setStatus('New show')
  }

  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail
      if (command === 'save') void handleSave()
      else if (command === 'saveAs') void handleSaveAs()
      else if (command === 'open') requestTransition(() => { void handleOpen() })
      else if (command === 'new') requestTransition(handleNew)
      else if (command === 'close') requestTransition(() => { setShow(null); savedSnapshotRef.current = 'null'; setCurrentPath(null) })
    }
    window.addEventListener('openlights-project-command', onCommand)
    return () => window.removeEventListener('openlights-project-command', onCommand)
  }, [show, currentPath, newName])

  if (useShowStore.getState().locked) return <button className="btn-theme text-xs" disabled>Project locked</button>
  // Persistent save state in the top bar (LightKey: an operator must see at a
  // glance whether the show on screen is saved). Derived from the saved
  // snapshot, so it turns to Unsaved on any edit and back on save/autosave.
  const dirty = hasUnsavedChanges(show, savedSnapshotRef.current)
  return (
    <div className="relative" ref={rootRef}>
      {pendingTransition && <div role="dialog" aria-modal="true" aria-label="Unsaved project changes" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"><div className="panel p-5 text-xs"><p className="mb-3">Save changes before leaving this project?</p><div className="flex gap-2"><button className="btn-theme" onClick={async () => { if (await handleSave()) { const action = pendingTransition; setPendingTransition(null); action() } }}>Save</button><button className="btn-theme" onClick={() => { const action = pendingTransition; setPendingTransition(null); action() }}>Discard</button><button className="btn-theme" onClick={() => { allowCloseRef.current = false; setPendingTransition(null) }}>Cancel</button></div></div></div>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`lightkey-project ${open ? 'on' : ''}`}
        title={dirty ? 'Unsaved changes — autosave runs 1.5s after your last edit' : status ?? 'Project menu'}
      >
        <span><strong>{show?.name ?? 'OpenLights'}</strong><small role={dirty ? 'status' : undefined}>{dirty ? 'Unsaved' : (status ?? (currentPath ? 'Output ready' : 'No output'))}</small></span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-80 panel p-3 shadow-2xl">
          <div className="mb-2">
            <label className="block text-[9px] uppercase tracking-wider text-dim mb-1">Name</label>
            <input
              value={show?.name ?? ''}
              readOnly={Boolean(currentPath)}
              title={currentPath ? 'Use Save As to change the project filename' : 'Project name'}
              onChange={(e) => {
                if (!show || currentPath) return
                useShowStore.getState().updateProject({ name: e.target.value })
              }}
              className="w-full rounded bg-panel2 border border-line px-2 py-1 text-sm text-white"
            />
            {currentPath && <div className="mt-2 flex gap-1"><input aria-label="New project filename" value={renameName} onChange={(event) => setRenameName(event.target.value)} placeholder="New filename" className="min-w-0 flex-1 rounded bg-panel2 p-1 text-xs" /><button disabled={!renameName.trim()} onClick={handleRename} className="btn-theme text-xs">Rename</button></div>}
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            <button onClick={handleSave} className="btn-theme on text-xs">Save</button>
            <button onClick={handleSaveAs} className="btn-theme text-xs">Save As</button><button onClick={() => requestTransition(() => { setShow(null); savedSnapshotRef.current = "null"; setCurrentPath(null); setStatus("Closed") })} className="btn-theme text-xs">Close</button>
            <button onClick={() => requestTransition(() => { void handleOpen() })} className="btn-theme text-xs">Open…</button>
          </div>

          <div className="flex gap-1 mb-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New show name"
              className="flex-1 rounded bg-panel2 border border-line px-2 py-1 text-xs text-white placeholder:text-dim"
            />
            <button onClick={() => requestTransition(handleNew)} className="btn-theme text-xs">New</button>
          </div>

          <div className="text-[10px] text-dim mb-2 truncate">
            {status ?? (currentPath ? `Saved: ${currentPath.split(/[\\/]/).pop()}` : 'Unsaved')}
          </div>

          <div className="border-t border-line pt-2">
            <div className="text-[9px] uppercase tracking-wider text-dim mb-1">Saved Shows</div>
            {shows.length === 0 ? (
              <div className="text-[11px] text-dim py-1">No saved shows yet</div>
            ) : (
              <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {shows.map((s) => (
                  <li key={s.path} className="flex items-center gap-2 rounded border border-line bg-panel2 px-2 py-1 text-xs">
                    <button
                      onClick={() => requestTransition(() => { void handleLoad(s.path) })}
                      className="flex-1 text-left text-text hover:opacity-80 truncate"
                    >
                      {s.name}
                      <span className="ml-2 text-[9px] text-dim">
                        {new Date(s.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(s.path)}
                      className="text-dim hover:text-red-400 text-[10px]"
                    >
                      Delete
                    </button>
                    <button className="text-[10px] text-dim" onClick={async () => { const result = await window.electronAPI.duplicateShow(s.path); setStatus(result.success ? 'Duplicated' : result.error ?? 'Duplicate failed'); void refreshList() }}>Duplicate</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
