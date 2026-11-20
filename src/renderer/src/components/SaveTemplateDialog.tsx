// Save as Template dialog (Piece 6). Saves the current show — fixtures,
// patch, Preview layout, groups, calibration — as a named template, so it
// can start a new project from the welcome screen's templates row. The
// template is a whole show; starting from it copies everything, including
// cues. Templates live in localStorage (lib/templates.ts).

import { useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { saveUserTemplate } from '../lib/templates'

export function SaveTemplateDialog({ onClose }: { onClose: () => void }) {
  const show = useShowStore((s) => s.show)
  const [name, setName] = useState(show?.name ?? 'My Rig')
  const [saved, setSaved] = useState(false)

  const save = () => {
    const current = useShowStore.getState().showForSave()
    if (!current || !name.trim()) return
    saveUserTemplate({ id: crypto.randomUUID(), name: name.trim(), createdAt: Date.now(), show: current })
    setSaved(true)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="save-template-title" className="panel flex w-full max-w-[420px] flex-col overflow-hidden shadow-2xl">
        <header className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <h2 id="save-template-title" className="text-lg font-semibold">Save as Template</h2>
            <p className="mt-1 text-xs text-dim">Saves the current show — fixtures, patch, Preview layout, groups and calibration — as a template for new projects.</p>
          </div>
          <button type="button" className="btn-theme" onClick={onClose} aria-label="Close save as template" title="Close save as template">×</button>
        </header>
        {saved ? (
          <div className="p-6">
            <p className="text-sm">Template “{name.trim()}” saved. It appears in the welcome screen&apos;s templates row.</p>
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-black" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-6">
              <label className="block text-xs font-semibold">Template Name
                <input aria-label="Template Name" autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save() }} className="mt-2 w-full rounded border border-line bg-panel2 px-3 py-2 text-sm text-text" />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-line px-6 py-3">
              <button type="button" className="btn-theme text-xs" onClick={onClose}>Cancel</button>
              <button type="button" className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-black" disabled={!name.trim()} onClick={save}>Save</button>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}
