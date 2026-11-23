import { describe, expect, it, vi } from 'vitest'
import { hasUnsavedChanges, rebaseSnapshotAfterHeal, transitionDecision } from '../src/renderer/src/lib/projectLifecycle'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { renameProjectFile, duplicateProjectFile, deleteProjectFile } from '../src/shared/projectFiles'
import type { ShowDef } from '../src/shared/types'
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

describe('rebaseSnapshotAfterHeal', () => {
  // The OFL heal only ever rewrites fixture bookkeeping (profileId,
  // modeId, the inline profile snapshot, shortName, …) — a fixture that
  // differs only in those fields changed by the heal, never by the user.
  const fixtureBefore = { id: 'f1', name: 'Wash', type: 'par', channelStart: 1, channels: 4 }
  const fixtureHealed = { ...fixtureBefore, profileId: 'builtin:par', modeId: 'default', shortName: 'P1', profile: { id: 'builtin:par', modes: [] } }
  const showWith = (fixtures: unknown[], name = 'Demo Show') =>
    ({ id: 'demo-1', name, fixtures, cues: [] } as unknown as ShowDef)

  it('re-bases a heal-only fixture change so the show reads clean', () => {
    const rebased = rebaseSnapshotAfterHeal(JSON.stringify(showWith([fixtureBefore])), showWith([fixtureHealed]))
    expect(rebased).not.toBeNull()
    expect(hasUnsavedChanges(showWith([fixtureHealed]), rebased!)).toBe(false)
    expect(JSON.parse(rebased!).fixtures[0].profileId).toBe('builtin:par')
  })

  it('leaves the snapshot alone when a fixture was really edited', () => {
    const edited = { ...fixtureHealed, name: 'Front Wash' }
    expect(rebaseSnapshotAfterHeal(JSON.stringify(showWith([fixtureBefore])), showWith([edited]))).toBeNull()
  })

  it('leaves the snapshot alone when a fixture was added or removed', () => {
    expect(rebaseSnapshotAfterHeal(JSON.stringify(showWith([fixtureBefore])), showWith([fixtureBefore, { id: 'f2', name: 'Fill', type: 'par', channelStart: 5, channels: 4 }]))).toBeNull()
    expect(rebaseSnapshotAfterHeal(JSON.stringify(showWith([fixtureBefore])), showWith([]))).toBeNull()
  })

  it('re-bases only the fixtures, so a real non-fixture edit still prompts', () => {
    const rebased = rebaseSnapshotAfterHeal(JSON.stringify(showWith([fixtureBefore])), showWith([fixtureHealed], 'Demo Show EDITED'))
    expect(rebased).not.toBeNull()
    expect(hasUnsavedChanges(showWith([fixtureHealed], 'Demo Show EDITED'), rebased!)).toBe(true)
    expect(JSON.parse(rebased!).name).toBe('Demo Show')
  })

  it('leaves the snapshot alone for an empty, unparseable, or fixture-less snapshot, or no show', () => {
    expect(rebaseSnapshotAfterHeal('', showWith([fixtureHealed]))).toBeNull()
    expect(rebaseSnapshotAfterHeal('not json', showWith([fixtureHealed]))).toBeNull()
    expect(rebaseSnapshotAfterHeal('{}', showWith([fixtureHealed]))).toBeNull()
    expect(rebaseSnapshotAfterHeal(JSON.stringify(showWith([fixtureBefore])), null)).toBeNull()
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
