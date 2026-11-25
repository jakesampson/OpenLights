// 19 Nov 2026: the theme colours in tailwind.config.js were plain
// `var(--bg)` with no `<alpha-value>` placeholder, so Tailwind v3.4
// generated no `bg-bg/NN` / `border-line/NN` utility at all and every
// opacity-modified theme class silently painted nothing — first seen on
// the Project Browser overlay, which went transparent (commit 0d496cc,
// fixed there by switching to solid `bg-bg`). The config now defines
// each colour with `color-mix(... <alpha-value> ...)`; these tests lock
// that in, so the bug cannot silently return: the config carries the
// placeholder, and every opacity-modified theme class used in src
// compiles to a real rule at its intended opacity.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'

const require = createRequire(import.meta.url)
const configPath = resolve(__dirname, '../tailwind.config.js')
const srcDir = resolve(__dirname, '../src')

const themeColors = ['bg', 'panel', 'panel2', 'line', 'accent', 'dim', 'text']

// Opacity-modified theme classes, e.g. `bg-bg/30`, `border-line/40`.
// Any utility prefix that can carry a colour is covered; a class written
// without `/NN` needs no placeholder and is not collected here.
const themeOpacityPattern =
  /(?:bg|text|border|ring|divide|placeholder|from|via|to|outline|decoration|accent|caret)-(bg|panel2|panel|line|accent|dim|text)\/(\d+)/g

function collectThemeOpacityClasses(dir: string, out = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      collectThemeOpacityClasses(path, out)
    } else if (/\.(tsx?|css)$/.test(entry)) {
      for (const match of readFileSync(path, 'utf8').matchAll(themeOpacityPattern)) {
        out.add(match[0])
      }
    }
  }
  return out
}

// The generated rule body for one class, e.g. `.bg-bg\/30 { ... }`.
function ruleBody(css: string, cls: string): string | null {
  const marker = `.${cls.replace('/', '\\/')} {`
  const at = css.indexOf(marker)
  if (at < 0) return null
  return css.slice(at, css.indexOf('}', at))
}

describe('theme alpha-value (tailwind config)', () => {
  it('defines every theme colour with an <alpha-value> placeholder', () => {
    const source = readFileSync(configPath, 'utf8')
    for (const name of themeColors) {
      const key = name === 'panel2' ? "'panel2'" : name
      expect(source).toMatch(new RegExp(`${key}: '[^']*<alpha-value>[^']*'`))
    }
    // No theme colour is still a bare var(...) with no placeholder — that
    // is the exact form that made Tailwind drop every /NN utility.
    expect(source).not.toMatch(/:\s*'var\(--[a-z0-9]+\)'/)
  })

  it('compiles every opacity-modified theme class used in src to a real rule at the intended opacity', async () => {
    const classes = [...collectThemeOpacityClasses(srcDir)]
    // The 19 Nov 2026 audit found five distinct classes; if this list
    // changes, the scan above still covers whatever src uses — but a
    // zero-length scan would mean the scan itself broke, not that the
    // bug is gone, so assert the known set is present. (26 Nov 2026:
    // the edit-panel cleanup dropped the old panel's `bg-bg/80`;
    // `bg-accent/15` is the PatchPanel new-fixture choice highlight.)
    expect(classes).toEqual(
      expect.arrayContaining(['bg-bg/30', 'bg-bg/40', 'bg-bg/50', 'bg-accent/15', 'border-line/40'])
    )
    expect(classes.length).toBeGreaterThan(0)

    const config = require(configPath)
    const result = await postcss([
      tailwindcss({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] })
    ]).process('@tailwind utilities;', { from: undefined })
    const css = result.css

    for (const cls of classes) {
      const body = ruleBody(css, cls)
      expect(body, `no generated rule for ${cls}`).not.toBeNull()
      const opacity = String(Number(cls.split('/')[1]) / 100)
      expect(body).toContain(`calc(${opacity} * 100%)`)
    }
  })

  it('still renders bare theme utilities at full opacity', async () => {
    const bare = themeColors.map((name) => `bg-${name}`)
    const config = require(configPath)
    const result = await postcss([
      tailwindcss({ ...config, content: [{ raw: bare.join(' '), extension: 'html' }] })
    ]).process('@tailwind utilities;', { from: undefined })
    const css = result.css
    for (const name of themeColors) {
      const body = ruleBody(css, `bg-${name}`)
      expect(body, `no generated rule for bg-${name}`).not.toBeNull()
      expect(body).toContain(`color-mix(in srgb, var(--${name})`)
      // No modifier means <alpha-value> substitutes 1: the colour is
      // unchanged from the old plain-var() behaviour.
      expect(body).toContain('calc(var(--tw-bg-opacity, 1) * 100%)')
    }
  })
})
