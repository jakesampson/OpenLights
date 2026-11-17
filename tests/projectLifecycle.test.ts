import { describe, expect, it, vi } from 'vitest'
import { hasUnsavedChanges, transitionDecision } from '../src/renderer/src/lib/projectLifecycle'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { renameProjectFile, duplicateProjectFile, deleteProjectFile } from '../src/shared/projectFiles'
import * as fs from 'node:fs'
import * as path from 'node:path'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } })
vi.stubGlobal('cancelAnimationFrame', vi.fn())
describe('project lifecycle', () => {
  it('marks edits dirty and saving the current snapshot clears dirty state', () => {
    const initial = JSON.stringify(useShowStore.getState().show)
    expect(hasUnsavedChanges(useShowStore.getState().show, initial)).toBe(false)
    useShowStore.getState().updateProject({ name: 'Edited' })
    expect(hasUnsavedChanges(useShowStore.getState().show, initial)).toBe(true)
    const saved = JSON.stringify(useShowStore.getState().show)
    expect(hasUnsavedChanges(useShowStore.getState().show, saved)).toBe(false)
    expect(transitionDecision(true)).toBe('prompt')
    expect(transitionDecision(true, 'cancel')).toBe('stay')
    expect(transitionDecision(true, 'save', false)).toBe('stay')
    expect(transitionDecision(true, 'save', true)).toBe('proceed')
    expect(transitionDecision(true, 'discard')).toBe('proceed')
  })
  it('renames the file and embedded name without overwriting another project', () => {
    const directory = fs.mkdtempSync(path.join(process.cwd(), '.project-test-'))
    try {
      const old = path.join(directory, 'Old.json')
      fs.writeFileSync(old, JSON.stringify(useShowStore.getState().show))
      const renamed = renameProjectFile(old, 'Renamed')
      expect(fs.existsSync(old)).toBe(false)
      expect(JSON.parse(fs.readFileSync(renamed, 'utf8')).name).toBe('Renamed')
      fs.writeFileSync(old, '{}'); expect(() => renameProjectFile(old, 'Renamed')).toThrow('already exists')
    } finally { for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file)); fs.rmdirSync(directory) }
  })
})

it('duplicates into a new project and file, then deletes only the copy', () => {
 const dir = fs.mkdtempSync(path.join(process.cwd(), '.project-test-'))
 try {
  const original = path.join(dir, 'Show.json'); fs.writeFileSync(original, JSON.stringify(useShowStore.getState().show))
  const copy = duplicateProjectFile(original)
  expect(copy).not.toBe(original)
  expect(JSON.parse(fs.readFileSync(copy, 'utf8')).id).not.toBe(useShowStore.getState().show!.id)
  deleteProjectFile(copy); expect(fs.existsSync(copy)).toBe(false); expect(fs.existsSync(original)).toBe(true)
 } finally { for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir) }
})
