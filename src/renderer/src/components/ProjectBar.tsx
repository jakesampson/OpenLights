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
    <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Project:</label>
          <input
            value={show?.name ?? ''}
            onChange={(e) => {
              if (!show) return
              setShow({ ...show, name: e.target.value })
            }}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-white w-48"
          />
        </div>
        <button onClick={handleSave} className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500">
          Save
        </button>
        <button onClick={handleSaveAs} className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium hover:bg-zinc-700">
          Save As
        </button>
        <button onClick={handleOpen} className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium hover:bg-zinc-700">
          Open…
        </button>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New show name"
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white w-40 placeholder-zinc-600"
          />
          <button onClick={handleNew} className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium hover:bg-zinc-700">
            New
          </button>
        </div>
        <span className="text-[10px] text-zinc-500">
          {status ?? (currentPath ? `Saved: ${currentPath.split(/[\\/]/).pop()}` : 'Unsaved')}
        </span>
      </div>

      <div className="mt-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Saved Shows</h3>
        {shows.length === 0 ? (
          <div className="text-[11px] text-zinc-600 py-1">No saved shows yet</div>
        ) : (
          <ul className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {shows.map((s) => (
              <li key={s.path} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs">
                <button onClick={() => handleLoad(s.path)} className="flex-1 text-left text-zinc-200 hover:text-white">
                  {s.name}
                  <span className="ml-2 text-zinc-600">{new Date(s.updatedAt).toLocaleDateString()}</span>
                </button>
                <button onClick={() => handleDelete(s.path)} className="text-zinc-500 hover:text-red-400 text-[10px]">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
