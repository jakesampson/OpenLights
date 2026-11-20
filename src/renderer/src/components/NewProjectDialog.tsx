// New Project name dialog (Piece 5, Guide ch.4 p.26: "Enter a name and
// choose a location for the project file, then click Save."). The project is
// created and named before the wizard starts; the file itself is saved by
// the existing save flow (autosave + Save). When started from a template the
// name is prefilled with the template's name.

import { useEffect, useState } from 'react'
import type { ShowTemplate } from '../lib/templates'

export function NewProjectDialog({ template, onSave, onClose }: { template: ShowTemplate | null; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(template?.name ?? '')
  const [suggested, setSuggested] = useState<string | null>(template?.name ?? null)

  useEffect(() => {
    if (template) return
    let alive = true
    window.electronAPI?.listShows()
      .then((shows) => { if (alive) setSuggested(`Show ${shows.length + 1}`) })
      .catch(() => { if (alive) setSuggested('Show 1') })
    return () => { alive = false }
  }, [template])

  const value = name || suggested || ''
  const submit = () => { if (value.trim()) onSave(value.trim()) }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-project-title" className="panel flex w-full max-w-[420px] flex-col overflow-hidden shadow-2xl">
        <header className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <h2 id="new-project-title" className="text-lg font-semibold">New Project</h2>
            <p className="mt-1 text-xs text-dim">{template ? `Starting from the ${template.name} template.` : 'Enter a name for the project.'}</p>
          </div>
          <button type="button" className="btn-theme" onClick={onClose} aria-label="Close new project" title="Close new project">×</button>
        </header>
        <div className="p-6">
          <label className="block text-xs font-semibold">Project Name
            <input aria-label="Project Name" autoFocus value={value} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit() }} placeholder={suggested ?? 'Show 1'} className="mt-2 w-full rounded border border-line bg-panel2 px-3 py-2 text-sm text-text" />
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-6 py-3">
          <button type="button" className="btn-theme text-xs" onClick={onClose}>Cancel</button>
          <button type="button" className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-black" disabled={!value.trim()} onClick={submit}>Save</button>
        </footer>
      </section>
    </div>
  )
}
