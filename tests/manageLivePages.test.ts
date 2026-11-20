// Live menu + Manage Live Pages (Guide ch.11, p.176; Jake's 18 Nov
// screenshots 8.54.48 / 8.56.01): the Live pill opens a menu listing every
// page with a checkmark on the current one, a separator, then
// "Manage Live Pages…"; the modal has Live Pages / Fade Time columns,
// fade steppers, + (Empty Page / Cuelist), −, ··· (Rename / Duplicate)
// and a blue Done button. Source/wiring assertions (no DOM renderer),
// in the repo's style.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const viewSwitch = readFileSync(resolve(root, 'src/renderer/src/components/ViewSwitch.tsx'), 'utf8')
const manager = readFileSync(resolve(root, 'src/renderer/src/components/ManageLivePages.tsx'), 'utf8')
const app = readFileSync(resolve(root, 'src/renderer/src/App.tsx'), 'utf8')
const css = readFileSync(resolve(root, 'src/renderer/src/index.css'), 'utf8')

describe('Live page menu (LightKey screenshot 8.54.48)', () => {
  it('lists every page with a checkmark on the current one, then Manage Live Pages…', () => {
    expect(viewSwitch).toContain('role="menu"')
    expect(viewSwitch).toContain('aria-label="Live pages"')
    expect(viewSwitch).toContain('page.id === activeLivePageId ? \'✓\' : \'\'')
    expect(viewSwitch).toContain('pageKindIcon(page)')
    expect(viewSwitch).toContain('Manage Live Pages…')
    expect(viewSwitch).toContain('view-switch-menu-separator')
    // Selecting a page switches to it and closes the menu.
    expect(viewSwitch).toContain("dispatch({ type: 'select', id: page.id })")
    // No invented menu items.
    expect(viewSwitch).not.toContain('New Page…')
    expect(viewSwitch).not.toContain('Delete Page')
  })

  it('opens the menu only from the Live pill while Live is active', () => {
    expect(viewSwitch).toContain("if (view !== 'Live') {")
    expect(viewSwitch).toContain("onView('Live')")
    expect(viewSwitch).toContain('pageManagerVisible(view, open)')
    // The old rename-inputs / move-buttons / add-by-name manager is gone.
    expect(viewSwitch).not.toContain('Rename ${page.name}')
    expect(viewSwitch).not.toContain('Move ${page.name} up')
    expect(viewSwitch).not.toContain('New Live page name')
    expect(viewSwitch).not.toContain('view-switch-pages-list')
  })

  it('the Design / Live switch lives in the bottom panel, centred on the panel', () => {
    // Jake, 18 Nov 2026 (screenshots 9.17.29): the header pill looked
    // cleaner but the switch belongs in the bottom panel — a pinned row at
    // the top of the bottom panel, centred on the panel's own width (which
    // excludes the right sidebar), not in the header and not floating on
    // the divider between the preview and the bottom panel.
    const headerStart = app.indexOf('<header')
    const headerEnd = app.indexOf('</header>')
    const switchAt = app.indexOf('<ViewSwitch')
    expect(headerStart).toBeGreaterThan(-1)
    // No pill in the header itself.
    expect(app.slice(headerStart, headerEnd)).not.toContain('<ViewSwitch')
    // The switch lives in the hoisted `designWorkspace` tree (19 Nov 2026:
    // the workspace renders under the header in the normal flow, and inside
    // the setup wizard modal on its preview / groups / directions steps).
    // It is defined there — and the workspace is used after the header in
    // the normal flow, never inside it.
    const workspaceAt = app.indexOf('const designWorkspace')
    expect(workspaceAt).toBeGreaterThan(-1)
    expect(switchAt).toBeGreaterThan(workspaceAt)
    // Used twice: once inside the wizard modal (bare ternary branch, before
    // the header in source) and once in the normal flow after the header.
    const modalUse = app.indexOf(': designWorkspace}')
    expect(modalUse).toBeGreaterThan(app.indexOf('aria-label="Setup wizard"'))
    expect(modalUse).toBeLessThan(headerStart)
    const uses = [...app.matchAll(/\{designWorkspace\}/g)].map((m) => m.index!)
    expect(uses.length).toBe(1)
    expect(uses[0]).toBeGreaterThan(headerEnd)
    // The switch renders inside the bottom-grid, in the pinned switch row
    // at the top of the bottom panel's first cell.
    const gridAt = app.indexOf('bottom-grid')
    const rowAt = app.indexOf('bottom-panel-switch')
    expect(gridAt).toBeGreaterThan(-1)
    expect(rowAt).toBeGreaterThan(gridAt)
    expect(switchAt).toBeGreaterThan(rowAt)
    expect(app).not.toContain('top-centre of the window')
    // No duplicate pill left in the header, and no header-centring rule.
    expect(app.match(/<ViewSwitch/g)?.length).toBe(1)
    expect(css).not.toContain('.top-bar .view-switch {')
    // The row centres the pill on the bottom panel with flex.
    expect(css).toContain('.bottom-panel-switch {')
    expect(css).toContain('justify-content: center')
    // The shell is a flex column with the row pinned on top of the body.
    expect(css).toContain('.bottom-panel-shell {')
    expect(css).toContain('flex-direction: column')
    expect(css).toContain('.bottom-panel-body {')
    // The row is paid for: the bottom grid grows 260px → 294px by exactly
    // the row's height, so the workspace below keeps its height and the
    // Master rail still fits without the panel scrolling.
    expect(css).toContain('height: 294px')
  })
})

describe('Manage Live Pages modal (LightKey screenshot 8.56.01)', () => {
  it('has Live Pages and Fade Time columns with fade steppers', () => {
    expect(manager).toContain('aria-label="Manage Live Pages"')
    expect(manager).toContain('Live Pages')
    expect(manager).toContain('Fade Time')
    expect(manager).toContain('formatTimingMs(effectiveFade(page))')
    expect(manager).toContain('Increase fade time for ${page.name}')
    expect(manager).toContain('Decrease fade time for ${page.name}')
    expect(manager).toContain("stepFade(page, 100)")
    expect(manager).toContain("stepFade(page, -100)")
    expect(manager).toContain('parseTimingMs(fadeText)')
    expect(manager).toContain("onCommand({ type: 'setFade'")
  })

  it('highlights the current page blue and shows kind icons', () => {
    expect(manager).toContain('live-pages-row')
    expect(css).toContain('.live-pages-row.on { background: #2563eb;')
    expect(manager).toContain("page.kind === 'cuelist' ? '☰' : '▦'")
  })

  it('offers Empty Page and Cuelist from +, delete from −, Rename/Duplicate from ···, and Done', () => {
    expect(manager).toContain('Empty Page')
    expect(manager).toContain('Cuelist')
    expect(manager).toContain("addPage('page')")
    expect(manager).toContain("addPage('cuelist')")
    expect(manager).toContain('Delete selected Live page')
    expect(manager).toContain("onCommand({ type: 'delete', id: selected.id })")
    expect(manager).toContain('More Live page actions')
    expect(manager).toContain('Rename')
    expect(manager).toContain('Duplicate')
    expect(manager).toContain("onCommand({\n      type: 'duplicate',")
    expect(manager).toContain('Done')
    expect(manager).toContain('bg-blue-600')
    // Delete asks first, as LightKey does.
    expect(manager).toContain('window.confirm(`Delete page "${selected.name}"?`)')
  })

  it('renames inline and reorders by dragging rows', () => {
    expect(manager).toContain("onCommand({ type: 'rename', id: renamingId, name: renameText })")
    expect(manager).toContain("onCommand({ type: 'moveTo', id: dragId, index })")
    expect(manager).toContain('draggable={!locked}')
  })

  it('wires every control to the page store actions via applyPageCommand', () => {
    expect(manager).toContain('onCommand')
    expect(viewSwitch).toContain('applyPageCommand({ pages, activeId: activeLivePageId }, command)')
    expect(viewSwitch).toContain('setLivePages(result.pages)')
    expect(viewSwitch).toContain('selectLivePage(result.activeId)')
    // The modal is portalled to the body: the bottom panel clips its
    // contents (overflow: hidden on the shell), which would clip a modal
    // rendered inside it.
    expect(viewSwitch).toContain('createPortal(')
    expect(viewSwitch).toContain('document.body')
  })
})
