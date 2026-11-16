import { useEffect, useRef, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import type { ShowDef } from '@shared/types'
import type { ShowMeta } from '../global'

export function ProjectBar() {
  const { show, setShow } = useShowStore()
  const [shows, setShows] = useState<ShowMeta[]>([])
  const [newName, setNewName] = useState('')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const savedSnapshotRef = useRef<string>(JSON.stringify(useShowStore.getState().show))
  const saveRef = useRef<() => void>(() => undefined)

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
    if (!show || !window.electronAPI) return
    const result = await window.electronAPI.saveShow(
      { ...show, updatedAt: Date.now() },
      currentPath ?? undefined
    )
    if (result.success) {
      savedSnapshotRef.current = JSON.stringify(useShowStore.getState().show)
      setCurrentPath(result.path ?? null)
      setStatus('Saved')
      refreshList()
    } else {
      setStatus(result.error ?? 'Save failed')
    }
  }

  saveRef.current = handleSave

  // Cmd/Ctrl+S saves without leaving the current tab.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Debounced autosave after any change, so a service can't lose a look.
  useEffect(() => {
    if (!show) return
    if (JSON.stringify(show) === savedSnapshotRef.current) return
    const timer = window.setTimeout(async () => {
      const snapshot = useShowStore.getState().show
      if (!snapshot || !window.electronAPI) return
      const result = await window.electronAPI.saveShow(
        { ...snapshot, updatedAt: Date.now() },
        currentPath ?? undefined
      )
      if (result.success) {
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
    const result = await window.electronAPI.saveShowAs(show, currentPath ?? undefined)
    if (result.success && !result.canceled) {
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
      const loaded = result.data as ShowDef
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
      const loaded = result.data as ShowDef
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
      id: crypto.randomUUID(),
      name,
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      fixtures: [],
      scenes: [],
      automations: [],
      midiMappings: []
    }
    setShow(blank)
    savedSnapshotRef.current = ''
    setCurrentPath(null)
    setNewName('')
    setStatus('New show')
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`btn-theme text-xs font-medium ${open ? 'on' : ''}`}
        title="Project menu"
      >
        Project
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-80 panel p-3 shadow-2xl">
          <div className="mb-2">
            <label className="block text-[9px] uppercase tracking-wider text-dim mb-1">Name</label>
            <input
              value={show?.name ?? ''}
              onChange={(e) => {
                if (!show) return
                setShow({ ...show, name: e.target.value })
              }}
              className="w-full rounded bg-panel2 border border-line px-2 py-1 text-sm text-white"
            />
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            <button onClick={handleSave} className="btn-theme on text-xs">Save</button>
            <button onClick={handleSaveAs} className="btn-theme text-xs">Save As</button>
            <button onClick={handleOpen} className="btn-theme text-xs">Open…</button>
          </div>

          <div className="flex gap-1 mb-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New show name"
              className="flex-1 rounded bg-panel2 border border-line px-2 py-1 text-xs text-white placeholder:text-dim"
            />
            <button onClick={handleNew} className="btn-theme text-xs">New</button>
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
                      onClick={() => handleLoad(s.path)}
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
