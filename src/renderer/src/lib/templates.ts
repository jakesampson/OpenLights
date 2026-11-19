// Project templates (Piece 5 welcome screen, Piece 6 save/load). A template
// is a whole show — fixtures, patch, Preview layout, groups, calibration —
// saved under a name and listed in the welcome screen's templates row, where
// it starts a new project (LightKey Guide ch.4 p.26, video 03:40 frame).
// User templates live in localStorage; no new Electron IPC is needed. The
// built-in Demo Show is the one template that always exists.

import type { ShowDef } from '@shared/types'

export interface ShowTemplate {
  id: string
  name: string
  createdAt: number
  show: ShowDef
}

export const TEMPLATES_STORAGE_KEY = 'openlights.templates'

function isShowTemplate(value: unknown): value is ShowTemplate {
  if (!value || typeof value !== 'object') return false
  const t = value as Partial<ShowTemplate>
  return typeof t.id === 'string' && typeof t.name === 'string' && typeof t.createdAt === 'number'
    && !!t.show && typeof t.show === 'object' && Array.isArray((t.show as ShowDef).fixtures)
}

/** User-saved templates, newest first. Corrupt or foreign entries are
 *  skipped rather than breaking the welcome screen. */
export function listUserTemplates(): ShowTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isShowTemplate).sort((a, b) => b.createdAt - a.createdAt)
  } catch { return [] }
}

export function saveUserTemplate(template: ShowTemplate): void {
  const templates = listUserTemplates().filter((t) => t.id !== template.id)
  templates.unshift(template)
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates))
}

export function deleteUserTemplate(id: string): void {
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(listUserTemplates().filter((t) => t.id !== id)))
}

/** The built-in template: the demo show shipped with the app, as LightKey's
 *  Project Browser shows its built-in demo projects (Guide p.26). */
export function demoShowTemplate(demoShow: ShowDef): ShowTemplate {
  return { id: 'template:demo', name: 'Demo Show', createdAt: 0, show: demoShow }
}

/** A new project started from a template: a deep copy with a fresh id and
 *  name, so editing the project never mutates the template. */
export function newShowFromTemplate(template: ShowTemplate, name: string): ShowDef {
  const show = structuredClone(template.show)
  show.id = crypto.randomUUID()
  show.name = name.trim() || template.name
  show.createdAt = Date.now()
  show.updatedAt = Date.now()
  return show
}
