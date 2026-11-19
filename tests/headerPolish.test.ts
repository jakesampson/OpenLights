// Layout polish on the blueprint build (Jake, 19 Nov 2026, screenshot
// 9.26.05): the main-window panels sit flush with square corners, the
// header is grey and white only, and Done is macOS default blue.
// Source/wiring assertions (no DOM renderer), in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/index.css', 'utf8')

describe('main-window panels are flush with square corners', () => {
  it('has no gutters between the panels or around the window', () => {
    // The main row and the bottom row both collapse to zero gap and
    // zero padding — the Preview, side panel, bottom panel and
    // Shortcuts panel sit directly against each other and the window
    // edges, as in LightKey's flush split.
    expect(css).toMatch(/\.main-grid \{[^}]*gap: 0;[^}]*padding: 0;/)
    expect(css).toMatch(/\.bottom-grid \{[^}]*gap: 0;[^}]*padding: 0;/)
  })

  it('gives the four main-window panels no border-radius', () => {
    expect(css).toContain('.main-grid > .panel,')
    expect(css).toContain('.main-grid > .preview-stack > .panel,')
    expect(css).toContain('.bottom-grid > .panel { border-radius: 0; }')
    // Dialogs and inner panels keep theirs — the .panel base rule is
    // untouched.
    expect(css).toContain('.panel {')
    expect(css).toMatch(/\.panel \{\n  background: var\(--panel\);\n  border: 1px solid var\(--line\);\n  border-radius: 8px;\n\}/)
  })

  it('keeps one 1px divider per seam instead of two stacked borders', () => {
    expect(css).toContain('.main-grid > .preview-stack > .panel { border-top: 0; border-left: 0; }')
    expect(css).toContain('.main-grid > .panel.side-panel { border-top: 0; border-right: 0; border-left: 0; }')
    expect(css).toContain('.bottom-grid > .panel { border-top: 0; }')
    expect(css).toContain('.bottom-grid > .panel + .panel { border-left: 0; }')
    expect(css).toContain('.bottom-grid > .panel:first-child { border-left: 0; border-bottom: 0; }')
    expect(css).toContain('.bottom-grid > .panel:last-child { border-right: 0; border-bottom: 0; }')
  })
})

describe('header is grey and white only', () => {
  it('keeps the LightKey grey background and a neutral divider', () => {
    expect(css).toContain('background: #444345')
    expect(css).toContain('border-bottom: 1px solid #5a5a5c;')
  })

  it('paints the header buttons grey, not the purple theme tints', () => {
    // The old translucent purple header-button rule is gone.
    expect(css).not.toContain('color-mix(in srgb, var(--panel2) 55%, transparent)')
    expect(css).not.toContain('color-mix(in srgb, var(--line) 60%, transparent)')
    // Grey surfaces and borders, white text.
    expect(css).toContain('background: #5b5b5d;')
    expect(css).toContain('border-color: #767678;')
    // The project title stays transparent, not a grey box.
    expect(css).toContain('button:not(.lightkey-action):not(.lightkey-project)')
  })

  it('paints the header icons grey, with a white hover', () => {
    expect(css).toContain('.top-bar .header-icon, .top-bar .lightkey-action, .top-bar .project-search-button { color: #d2d2d2; }')
    expect(css).toContain('background: rgba(255, 255, 255, 0.14); color: #fff;')
  })

  it('paints the Overrides pill and the open search field grey', () => {
    expect(css).toContain('.top-bar .header-look-field { background: #555658; }')
    expect(css).toContain('.top-bar .project-search.open > input { background: #555658; border-color: #767678; color: #fff; }')
  })

  it('paints the header dropdown menus grey, with a blue selected item', () => {
    expect(css).toContain('.top-bar .header-more-menu, .top-bar .header-submenu { background: #4a4a4d; border-color: #6a6a6d; }')
    expect(css).toContain('.top-bar [data-header-settings-menu] { background: #4a4a4d; border-color: #6a6a6d; }')
    expect(css).toContain('.top-bar .header-more-menu button.on { background: #0a84ff; border-color: #0a84ff; color: #fff; }')
  })
})

describe('Done is macOS default blue', () => {
  it('uses system blue #0A84FF with white text when leaving edit mode', () => {
    // macOS systemBlue, dark appearance (Apple HIG: #007AFF light,
    // #0A84FF dark). LightKey's own Done measures ~#2060D0 in Jake's
    // LightKey screenshot — the same blue family, a shade deeper.
    expect(css).toContain(".top-bar > .flex:first-child > button.btn-theme.on { background: #0a84ff; border-color: #0a84ff; color: #fff; }")
    expect(css).toContain('.top-bar > .flex:first-child > button.btn-theme.on:hover { background: #2b93ff; border-color: #2b93ff; }')
    // The Edit state stays grey like the other header buttons.
    expect(css).toContain('background: #5b5b5d;')
  })
})
