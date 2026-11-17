import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('roadmap documentation contract', () => {
  it('keeps an audit row for every guide index row and records decisions and coverage', () => {
    const checklist = readFileSync('ROADMAP_CHECKLIST.md', 'utf8')
    const rows = checklist.split('## Guide section index')[1].split('\n').filter((line) => /^\| (\d+|App\. 1) \|/.test(line))
    const audit = readFileSync('docs/lightkey-audit.md', 'utf8')
    for (const row of rows) expect(audit).toContain(`| ${row.split('|')[1].trim()}:`)
    const notes = readFileSync('NOTES.md', 'utf8')
    for (const title of ['Decisions', 'Deviations from the guide', 'Known gaps', 'Test coverage']) expect(notes).toContain(`## ${title}`)
  })
})
