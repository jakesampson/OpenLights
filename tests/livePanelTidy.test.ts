import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// The Live panel tidy-up (Jake, 25 Nov 2026, LightKey screenshot):
// the bottom panel reads as one continuous canvas — no darker seam
// under the Design/Live header, and the Master fader sits on the
// panel background with no card around it. The fader track itself
// stays visible: only the boxes around it go.
const css = readFileSync('src/renderer/src/index.css', 'utf8')
const workspace = readFileSync('src/renderer/src/components/LiveWorkspace.tsx', 'utf8')

function ruleBlock(selector: string): string {
  const match = css.match(new RegExp(`\\${selector} \\{[^}]*\\}`, 's'))
  expect(match, `${selector} rule exists`).not.toBeNull()
  return match![0]
}

describe('live panel tidy-up', () => {
  it('has no darker background on the Live workspace section', () => {
    // No className in the workspace may carry the old darker section
    // background (the string still appears in a comment explaining
    // the removal — that is fine).
    const classNames = [...workspace.matchAll(/className=\{`([^`]*)`\}/g)].map((m) => m[1])
    expect(classNames.length).toBeGreaterThan(0)
    for (const name of classNames) expect(name).not.toContain('bg-bg/30')
  })

  it('gives the Master rail no border or card background', () => {
    const rail = ruleBlock('.live-master-rail')
    expect(rail).not.toMatch(/border:/)
    expect(rail).not.toContain('var(--panel2)')
    expect(rail).toContain('background: transparent')
  })

  it('gives the tap-tempo box no background', () => {
    const bpm = ruleBlock('.live-master-bpm')
    expect(bpm).not.toContain('var(--panel)')
    expect(bpm).toContain('background: transparent')
  })

  it('keeps the Master fader track itself visible', () => {
    const track = ruleBlock('.live-master-track')
    expect(track).toContain('background: var(--bg)')
    const fill = ruleBlock('.live-master-fill')
    expect(fill).toContain('background: #d9d4f5')
  })
})
