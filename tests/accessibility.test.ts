import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => { const path = join(root, name); return statSync(path).isDirectory() ? files(path) : path.endsWith('.tsx') ? [path] : [] })
}

describe('button accessibility', () => {
  it('gives every button either a readable label or visible text, and labels icon-only controls', () => {
    const failures: string[] = []
    for (const path of files(join(process.cwd(), 'src/renderer/src'))) {
      const source = readFileSync(path, 'utf8')
      for (const match of source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        const [, attributes, body] = match
        const visibleText = body.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').trim()
        const labelled = /aria-label\s*=/.test(attributes)
        if (!labelled && !/[A-Za-z0-9]/.test(body)) failures.push(`${path}: unlabeled button`)
        if (visibleText && !/[A-Za-z0-9}]/.test(visibleText) && (!labelled || !/title\s*=/.test(attributes))) failures.push(`${path}: icon button needs aria-label and title: ${visibleText}`)
      }
    }
    expect(failures).toEqual([])
  })
})
