// Project Browser (Piece 5, Guide ch.4 p.26: "When you first start
// Lightkey, the Project Browser appears. It shows a preview of the recently
// used projects … and the built-in demo projects."). Shown on launch, with a
// Recent Projects row and a templates row. Opening a recent reuses
// ProjectBar's load flow (via the `openlights-load-show` event, so the
// unsaved-changes prompt still applies); starting from a template opens the
// New Project name dialog prefilled with the template name. Closing it
// leaves the show underneath (the demo on launch).

import { useEffect, useState } from 'react'
import { useShowStore, defaultShow } from '../stores/showStore'
import { demoShowTemplate, deleteUserTemplate, listUserTemplates, type ShowTemplate } from '../lib/templates'
import type { ShowMeta } from '../global'

export function WelcomeScreen() {
  const [recents, setRecents] = useState<ShowMeta[]>([])
  const [templates, setTemplates] = useState<ShowTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const shows = await window.electronAPI.listShows()
        if (!alive) return
        setRecents(shows)
        setTemplates([demoShowTemplate(defaultShow), ...listUserTemplates()])
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)) }
      finally { if (alive) setLoading(false) }
    }
    void load()
    return () => { alive = false }
  }, [])

  const openRecent = (path: string) => {
    useShowStore.getState().setWelcomeOpen(false)
    window.dispatchEvent(new CustomEvent('openlights-load-show', { detail: path }))
  }
  const newProject = () => {
    const state = useShowStore.getState()
    state.setNewProjectTemplate(null)
    state.setNewProjectDialogOpen(true)
  }
  const startTemplate = (template: ShowTemplate) => {
    const state = useShowStore.getState()
    state.setNewProjectTemplate(template)
    state.setNewProjectDialogOpen(true)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/95 p-6" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="w-full max-w-[720px]">
        <header className="flex items-start justify-between">
          <div>
            <h1 id="welcome-title" className="text-2xl font-semibold">OpenLights</h1>
            <p className="mt-1 text-sm text-dim">Project Browser</p>
          </div>
          <button type="button" className="btn-theme" onClick={() => useShowStore.getState().setWelcomeOpen(false)} aria-label="Close Project Browser" title="Close Project Browser">×</button>
        </header>

        <div className="mt-6 flex gap-2">
          <button type="button" className="rounded bg-accent px-4 py-2 text-sm font-semibold text-black" onClick={newProject}>New Project</button>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-dim">Recent Projects</h2>
          {loading ? <p className="mt-2 text-sm text-dim">Loading…</p>
          : recents.length === 0 ? <p className="mt-2 text-sm text-dim">No recent projects yet — start a new project or open a template.</p>
          : <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {recents.map((recent) => (
              <li key={recent.path}>
                <button type="button" onClick={() => openRecent(recent.path)} className="block w-full rounded border border-line bg-panel p-3 text-left hover:border-accent">
                  <span className="block truncate text-sm font-semibold">{recent.name}</span>
                  <span className="mt-1 block text-xs text-dim">{new Date(recent.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                </button>
              </li>
            ))}
          </ul>}
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-dim">Templates</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {templates.map((template) => (
              <li key={template.id} className="relative">
                <button type="button" onClick={() => startTemplate(template)} className="block w-full rounded border border-line bg-panel p-3 text-left hover:border-accent">
                  <span className="block truncate text-sm font-semibold">{template.name}</span>
                  <span className="mt-1 block text-xs text-dim">{template.id === 'template:demo' ? 'Built-in demo project' : 'Saved template'}</span>
                </button>
                {template.id !== 'template:demo' && (
                  <button type="button" aria-label={`Delete template ${template.name}`} title={`Delete template ${template.name}`} className="absolute right-1 top-1 rounded bg-panel2 px-1 text-xs text-dim" onClick={(event) => { event.stopPropagation(); deleteUserTemplate(template.id); setTemplates((current) => current.filter((t) => t.id !== template.id)) }}>×</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
