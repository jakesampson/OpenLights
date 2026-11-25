// @vitest-environment jsdom
// Edit Preview + fixture side panel cleanup (Jake, 26 Nov 2026): the
// Inspector shows LightKey's options in LightKey's layout — Shapes /
// Images tabs, Beam Direction… / Beam Color… / Fixture Options… and
// the three checkboxes, the LED icon row — and nothing else. The
// extras (Beam angle, Name position, Icon size, Rotation, Min/Max
// dimmer fields, the Layout section, Fixture storage) moved to where
// LightKey puts them or are gone from this view.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { PreviewEditPanel } from '../src/renderer/src/components/PreviewEditPanel'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { WINDOWS_MENU, CONTEXT_MENUS } from '../src/shared/menuModel'
import { SHORTCUTS, matchShortcut } from '../src/renderer/src/lib/shortcuts'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let root: Root | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  root = createRoot(el)
  act(() => { root.render(node) })
  return el
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  root = undefined
  container?.remove()
  container = undefined
})

function seedPanel(fixtureType: 'moving-head' | 'dimmer' | 'pixel-bar-17ch') {
  if (root) act(() => { root.unmount() })
  root = undefined
  container?.remove()
  container = undefined
  const profileId = fixtureType === 'moving-head' ? 'head-8ch' : fixtureType === 'dimmer' ? 'dimmer-1ch' : 'pan-4x1x30-17ch'
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [{ id: 'a', name: 'A', type: fixtureType, channelStart: 1, channels: fixtureType === 'pixel-bar-17ch' ? 17 : fixtureType === 'moving-head' ? 8 : 1, profileId }],
    cues: []
  }))
  useShowStore.setState({ selectedFixtureIds: ['a'], previewEditing: true })
  renderInRoot(<PreviewEditPanel />)
  return s
}

function button(label: string) {
  const found = Array.from(container?.querySelectorAll('button') ?? []).find((b) => b.textContent?.trim() === label)
  if (!found) throw new Error(`no button "${label}" in the rendered panel`)
  return found as HTMLButtonElement
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

describe('Inspector fixture section (LightKey Guide p.53)', () => {
  it('shows Beam Direction… / Beam Color… / Fixture Options… and the three checkboxes, nothing else', () => {
    seedPanel('moving-head')
    expect(button('Beam Direction…')).toBeTruthy()
    expect(button('Beam Color…')).toBeTruthy()
    expect(button('Fixture Options…')).toBeTruthy()
    for (const label of ['Disable', 'Hide light beam', 'Ignore Master Dimmer']) {
      expect(container?.textContent).toContain(label)
    }
    // The removed extras are gone from this view.
    for (const label of ['Beam angle', 'Name position', 'Icon size', 'Rotation', 'Min dimmer', 'Max dimmer']) {
      expect(container?.querySelector(`[aria-label="Fixture ${label}"]`)).toBeNull()
      expect(container?.textContent).not.toContain(label)
    }
    expect(container?.textContent).not.toContain('Layout')
    expect(container?.textContent).not.toContain('Fixture storage')
    expect(container?.textContent).not.toContain('Select all')
    expect(container?.textContent).not.toContain('Align / distribute')
  })

  it('greys out Beam Color… for a moving head (DMX colour control) and enables it for a dimmer', () => {
    seedPanel('moving-head')
    // LightKey's screenshot: Beam Color… greyed out for MH1.
    expect(button('Beam Color…').disabled).toBe(true)
    seedPanel('dimmer')
    expect(button('Beam Color…').disabled).toBe(false)
  })

  it('saves a beam colour for a dimmer fixture', () => {
    const s = seedPanel('dimmer')
    act(() => { button('Beam Color…').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    const dialog = container?.querySelector('[aria-label="Beam Color"]')
    if (!dialog) throw new Error('no Beam Color dialog')
    const color = container?.querySelector('[aria-label="Beam colour"]') as HTMLInputElement | null
    if (!color) throw new Error('no beam colour input')
    act(() => { typeInto(color, '#ff0000') })
    act(() => { button('Done').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(s().show?.fixtures.find((f) => f.id === 'a')?.previewBeam?.color).toBe('#ff0000')
  })

  it('saves Fixture Options (beam angle, min/max dimmer) to the store', () => {
    const s = seedPanel('moving-head')
    act(() => { button('Fixture Options…').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    const min = container?.querySelector('[aria-label="Minimum dimmer"]') as HTMLInputElement | null
    const max = container?.querySelector('[aria-label="Maximum dimmer"]') as HTMLInputElement | null
    const angle = container?.querySelector('[aria-label="Beam angle"]') as HTMLInputElement | null
    if (!min || !max || !angle) throw new Error('no Fixture Options fields')
    act(() => { typeInto(min, '10'); typeInto(max, '200'); typeInto(angle, '42') })
    act(() => { button('Done').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    const fixture = s().show?.fixtures.find((f) => f.id === 'a')
    expect(fixture?.minDimmer).toBe(10)
    expect(fixture?.maxDimmer).toBe(200)
    expect(fixture?.previewBeam?.beamAngle).toBe(42)
  })

  it('greys out the LED icon row for a moving head, enables it for an LED bar, and toggles line/ring', () => {
    const s = seedPanel('moving-head')
    for (const label of ['Small LED icon', 'Large LED icon', 'LED strip as a line', 'LED strip as a ring']) {
      const b = container?.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null
      if (!b) throw new Error(`no ${label} button`)
      expect(b.disabled).toBe(true)
    }
    const s2 = seedPanel('pixel-bar-17ch')
    const line = container?.querySelector('[aria-label="LED strip as a line"]') as HTMLButtonElement | null
    if (!line) throw new Error('no line button')
    expect(line.disabled).toBe(false)
    act(() => { line.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(s2().show?.fixtures.find((f) => f.id === 'a')?.ledIconShape).toBe('line')
    act(() => { line.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(s2().show?.fixtures.find((f) => f.id === 'a')?.ledIconShape).toBeUndefined()
  })

  it('shows LightKey\'s Shapes / Images tabs with the truss tools in the grid', () => {
    seedPanel('moving-head')
    expect(container?.querySelector('[role="tablist"]')?.textContent).toContain('shapes')
    expect(container?.querySelector('[role="tablist"]')?.textContent).toContain('images')
    for (const label of ['Add Rectangle', 'Add Rounded rectangle', 'Add Ellipse', 'Add Triangle', 'Add Line', 'Add Truss', 'Add Curved truss', 'Add Circular truss', 'Add Text']) {
      expect(container?.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    }
    // Clicking a truss tool adds a truss (the old Layout "+ Add truss" is gone).
    const curvedTruss = container?.querySelector('[aria-label="Add Curved truss"]') as HTMLButtonElement | null
    if (!curvedTruss) throw new Error('no Add Curved truss tool')
    act(() => { curvedTruss.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().show?.previewTrusses).toHaveLength(1)
    expect(useShowStore.getState().show?.previewTrusses[0].shape).toBe('curved')
  })
})

describe('Layout / Edit menus are the new home for the removed panel controls', () => {
  it('puts Select All in Edit and Align / Distribute / Flip / Order in Layout', () => {
    const edit = WINDOWS_MENU.find((g) => g.label === 'Edit')!
    expect(edit.items.map((i) => i.command)).toContain('selectAll')
    expect(edit.items.map((i) => i.command)).toContain('deselectAll')
    const layout = WINDOWS_MENU.find((g) => g.label === 'Layout')!
    expect(layout.items.map((i) => i.label)).toEqual(['Beam Direction…', 'Beam Color…', 'Fixture Options…', '', 'Align', 'Distribute', 'Flip', 'Order', '', 'Group'])
    const align = layout.items.find((i) => i.label === 'Align')!
    expect(align.submenu?.map((s) => s.command)).toEqual(['alignLeft', 'alignRight', 'alignTop', 'alignBottom', 'alignCenterX', 'alignCenterY'])
    expect(layout.items.find((i) => i.label === 'Distribute')!.submenu?.map((s) => s.command)).toEqual(['distributeX', 'distributeY'])
    expect(layout.items.find((i) => i.label === 'Flip')!.submenu?.map((s) => s.command)).toEqual(['flipHorizontal', 'flipVertical'])
    expect(layout.items.find((i) => i.label === 'Order')!.submenu?.map((s) => s.command)).toEqual(['orderFront', 'orderForward', 'orderBackward', 'orderBack'])
  })

  it('adds Beam Color… / Fixture Options… to the fixture shortcut menu', () => {
    expect(CONTEXT_MENUS.fixture).toContain('beamColor')
    expect(CONTEXT_MENUS.fixture).toContain('fixtureOptions')
  })

  it('binds Select All, Deselect All, Beam Color… and Fixture Options… (Guide pp.53, 61–62, 72)', () => {
    expect(SHORTCUTS.find((s) => s.command === 'selectAll')).toMatchObject({ code: 'a', ctrl: true })
    expect(SHORTCUTS.find((s) => s.command === 'deselectAll')).toMatchObject({ code: 'a', ctrl: true, shift: true })
    expect(SHORTCUTS.find((s) => s.command === 'beamColor')).toMatchObject({ code: 'c', ctrl: true, shift: true, alt: true })
    expect(SHORTCUTS.find((s) => s.command === 'fixtureOptions')).toMatchObject({ code: 'f', ctrl: true, shift: true, alt: true })
    // Cmd-A still selects text while typing (matchShortcut skips text fields).
    expect(matchShortcut({ key: 'a', ctrlKey: true }, { tagName: 'INPUT' })).toBeUndefined()
    expect(matchShortcut({ key: 'a', metaKey: true }, { tagName: 'DIV' })?.command).toBe('selectAll')
  })
})

describe('Perspective icons (Jake, 26 Nov 2026 — copy LightKey for now)', () => {
  it('draws LightKey\'s vase fixture and lens-face parallel glyphs', () => {
    const source = readFileSync('src/renderer/src/components/CalibrationDialog.tsx', 'utf8')
    // The vase body: narrow at the base end, domed at the head end, with
    // yoke arms and a flat base bar — drawn head-down, rotated per tile.
    expect(source).toContain('M18 8v6c0 4-6 6-6 13 0 8 4 13 10 13s10-5 10-13c0-7-6-9-6-13V8Z')
    expect(source).toContain("perspective === 'down' ? 0 : perspective === 'up' ? 180 : perspective === 'left' ? 90 : -90")
    // The parallel tile: octagonal ring, radial ticks, inner ring, dot, side tabs.
    expect(source).toContain('37,22 32.6,11.4 22,7 11.4,11.4 7,22 11.4,32.6 22,37 32.6,32.6')
    expect(source).toContain('M32 22h3M29.1 14.9l2.1-2.1M22 12V9')
    expect(source).not.toContain('<rect x="15" y="6" width="14" height="20" rx="7" />')
  })
})

describe('clean Preview canvas (Jake, 26 Nov 2026)', () => {
  it('draws blue selection handles and a blue label pill for the selected fixture in edit mode', () => {
    const source = readFileSync('src/renderer/src/components/StagePreview.tsx', 'utf8')
    expect(source).toContain('fixtureIconSelectionRect(kind)')
    expect(source).toContain("fill=\"#0A84FF\" stroke=\"#ffffff\"")
    expect(source).toContain('LightKey\'s blue label pill')
    expect(source).not.toContain('Toggle highlight mode')
    expect(source).not.toContain('Zoom out preview')
    const toolbar = readFileSync('src/renderer/src/components/WorkspaceToolbar.tsx', 'utf8')
    expect(toolbar).toContain('aria-label="Highlight mode"')
  })
})
