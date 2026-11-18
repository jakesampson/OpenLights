import * as fs from 'node:fs'
import * as path from 'node:path'
import { migrateShow } from './migrations'
export function renameProjectFile(source: string, name: string): string {
  const clean = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '')
  if (!clean) throw new Error('A project name is required')
  const absolute = path.resolve(source), target = path.resolve(path.dirname(absolute), `${clean}.json`)
  if (path.dirname(target) !== path.dirname(absolute)) throw new Error('Rename must stay in the project directory')
  if (target !== absolute && fs.existsSync(target)) throw new Error('A project with that name already exists')
  const data = migrateShow(JSON.parse(fs.readFileSync(absolute, 'utf8')))
  if (target !== absolute) fs.renameSync(absolute, target)
  fs.writeFileSync(target, JSON.stringify({ ...data, name: clean }, null, 2))
  return target
}

export function duplicateProjectFile(source: string): string {
  const absolute = path.resolve(source), directory = path.dirname(absolute), stem = path.parse(absolute).name
  let n = 1, target = path.join(directory, `${stem} copy.json`)
  while (fs.existsSync(target)) target = path.join(directory, `${stem} copy ${++n}.json`)
  const data = migrateShow(JSON.parse(fs.readFileSync(absolute, 'utf8')))
  fs.writeFileSync(target, JSON.stringify({ ...data, id: crypto.randomUUID(), name: path.parse(target).name, createdAt: Date.now(), updatedAt: Date.now() }, null, 2), { flag: 'wx' })
  return target
}
export function deleteProjectFile(source: string): void { fs.unlinkSync(path.resolve(source)) }
