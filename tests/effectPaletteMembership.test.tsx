// Explicit Add to Preset Palette (Jake, 28 Nov 2026): creating an
// effect in LightKey attaches it to the fixtures — it does NOT
// auto-appear in the preset palette; you right-click and add it there.
// New effects stay out of the palette until added; old shows keep
// their palette effects; the effect editor/chooser still lists project
// effects regardless of the flag.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { GroupsPresetsPanel } from '../src/renderer/src/components/GroupsPresetsPanel'
import { EffectIndicator } from '../src/renderer/src/components/EffectEditor'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { EffectDef } from '../src/shared/types'

;(window as unknown as { electronAPI?: unknown }).electronAPI = { setChannels: vi.fn() }
vi.stubGlobal('cancelAnimationFrame', vi.fn())
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(node) })
  return el
}

const effect = (overrides: Partial<EffectDef> = {}): EffectDef => ({
  id: 'eff-1',
  name: 'Bell Dimmer',
  fixtureIds: ['fx1'],
  attribute: 'intensity',
  waveform: 'sine',
  speed: 1,
  syncToBpm: false,
  size: 128,
  offset: 128,
  phaseSpread: 0,
  enabled: true,
  ...overrides
})

function setupShow() {
  const s = () => useShowStore.getState()
  s().setShow(migrateShow({
    fixtures: [{ id: 'fx1', name: 'Wash', type: 'par', channelStart: 1, channels: 4 }],
    cues: [],
    cueLists: []
  }))
  return s
}

function effectRowOuter(id: string) {
  return container?.querySelector(`[data-palette-row="effect:${id}"]`) as HTMLElement | null
}

beforeEach(() => { useShowStore.getState().setShow(null) })

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
})

describe('explicit Add to Preset Palette', () => {
  it('migration keeps old effects in the palette, and leaves templates alone', () => {
    const migrated = migrateShow({
      fixtures: [{ id: 'fx1', name: 'Wash', type: 'par', channelStart: 1, channels: 4 }],
      effects: [effect({ inPalette: undefined }), effect({ id: 'eff-2', inPalette: false })],
      effectTemplates: [effect({ id: 'tpl-1', inPalette: undefined })]
    })
    expect(migrated.effects[0].inPalette).toBe(true)
    expect(migrated.effects[1].inPalette).toBe(false)
    expect((migrated.effectTemplates?.[0] as EffectDef | undefined)?.inPalette).toBeUndefined()
  })

  it('a newly created effect stays out of the palette', () => {
    const s = setupShow()
    s().addEffect(effect())
    expect(s().effects).toHaveLength(1)
    expect(s().effects[0].inPalette).toBe(false)
  })

  it('setEffectInPalette adds and removes', () => {
    const s = setupShow()
    s().addEffect(effect())
    s().setEffectInPalette('eff-1', true)
    expect(s().effects[0].inPalette).toBe(true)
    s().setEffectInPalette('eff-1', false)
    expect(s().effects[0].inPalette).toBe(false)
  })

  it('duplicate, paste and apply-template copies stay out even when the source was in', () => {
    const s = setupShow()
    s().addEffect(effect({ inPalette: true }))
    const dupId = s().duplicateEffect('eff-1')
    expect(s().effects.find((e) => e.id === dupId)?.inPalette).toBe(false)
    s().copyEffect('eff-1')
    const pasteId = s().pasteEffect()
    expect(s().effects.find((e) => e.id === pasteId)?.inPalette).toBe(false)
    // A saved template applied as a new effect also stays out.
    s().saveEffectTemplate('eff-1')
    const templateId = s().show!.effectTemplates![0].id
    const appliedId = s().applyEffectTemplate(templateId)
    expect(s().effects.find((e) => e.id === appliedId)?.inPalette).toBe(false)
  })

  it('the palette shows only added effects', () => {
    const s = setupShow()
    act(() => {
      useShowStore.setState({
        effects: [effect({ id: 'eff-out', name: 'Not In Palette', inPalette: false }), effect({ id: 'eff-in', name: 'In Palette', inPalette: true })]
      })
    })
    renderInRoot(<GroupsPresetsPanel />)
    expect(effectRowOuter('eff-out')).toBeNull()
    expect(effectRowOuter('eff-in')).not.toBeNull()
    void s
  })

  it('the palette row menu offers Remove from Preset Palette, and it hides the row', () => {
    setupShow()
    act(() => {
      useShowStore.setState({ effects: [effect({ inPalette: true })] })
    })
    renderInRoot(<GroupsPresetsPanel />)
    const row = container?.querySelector('[data-palette-row="effect:eff-1"] [role="treeitem"]') as HTMLElement | null
    expect(row).not.toBeNull()
    act(() => { row!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })) })
    const menu = container?.querySelector('[role="menu"]') as HTMLElement | null
    expect(menu).not.toBeNull()
    const remove = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find((item) => item.textContent === 'Remove from Preset Palette') as HTMLElement | undefined
    expect(remove).toBeDefined()
    const add = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find((item) => item.textContent === 'Add to Preset Palette')
    expect(add).toBeUndefined()
    act(() => { remove!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().effects[0].inPalette).toBe(false)
    expect(effectRowOuter('eff-1')).toBeNull()
  })

  it('the Design effect indicator menu offers Add to Preset Palette, and it shows the row', () => {
    setupShow()
    act(() => {
      useShowStore.setState({ effects: [effect({ inPalette: false })] })
    })
    renderInRoot(<>
      <GroupsPresetsPanel />
      <EffectIndicator effect={useShowStore.getState().effects[0]} onEdit={() => {}} />
    </>)
    expect(effectRowOuter('eff-1')).toBeNull()
    const indicator = container?.querySelector('button[title="Edit effect Bell Dimmer"]') as HTMLElement | null
    expect(indicator).not.toBeNull()
    act(() => { indicator!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })) })
    const menu = container?.querySelector('[role="menu"][aria-label="Effect actions"]') as HTMLElement | null
    expect(menu).not.toBeNull()
    const add = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find((item) => item.textContent === 'Add to Preset Palette') as HTMLElement | undefined
    expect(add).toBeDefined()
    act(() => { add!.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    expect(useShowStore.getState().effects[0].inPalette).toBe(true)
    expect(effectRowOuter('eff-1')).not.toBeNull()
  })
})
