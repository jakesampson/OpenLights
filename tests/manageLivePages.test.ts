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

  it('the Design / Live switch lives in the header, centred on the window', () => {
    // App renders the switch inside <header>, not on the divider.
    const headerStart = app.indexOf('<header')
    const headerEnd = app.indexOf('</header>')
    const switchAt = app.indexOf('<ViewSwitch')
    expect(headerStart).toBeGreaterThan(-1)
    expect(switchAt).toBeGreaterThan(headerStart)
    expect(switchAt).toBeLessThan(headerEnd)
    expect(app).not.toContain('on the divider between preview and bottom panel')
    expect(app).not.toContain('Design/Live view switch — bottom centre')
    // CSS centres it on the whole window: absolute, left 50%.
    expect(css).toContain('.top-bar .view-switch {')
    expect(css).toContain('left: 50%')
    expect(css).toContain('transform: translate(-50%, -50%)')
    expect(css).not.toContain('justify-content: center;\n  height: 0;')
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
    // The modal is portalled to the body: the switch is centred with a CSS
    // transform, which would trap a fixed-position modal inside the pill.
    expect(viewSwitch).toContain('createPortal(')
    expect(viewSwitch).toContain('document.body')
  })
})
