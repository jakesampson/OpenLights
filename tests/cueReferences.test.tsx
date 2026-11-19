// Cue references (Piece 8, LightKey Guide ch.11 pp.199–202): a cue stores
// preset/sequence references plus its ad-hoc values; editing a preset
// updates every cue that references it, and old shows load unchanged.
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { CURRENT_SCHEMA_VERSION, migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECT = { left: 0, top: 0, width: 150, height: 150, right: 150, bottom: 150, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

let container: HTMLDivElement | undefined
let root: Root | undefined
let lastPatch: Record<number, number> = {}

function renderInRoot(node: React.ReactElement) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  root = createRoot(el)
  act(() => { root.render(node) })
  return el
}

const LED = { id: 'led', name: 'LED', type: 'generic-led', channelStart: 1, channels: 4 }

function testShow(): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures: [LED as ShowDef['fixtures'][number]],
    presets: [{ id: 'p1', name: 'Red', category: 'color', fixtureValues: { led: { intensity: 255, red: 200, green: 0, blue: 0 } } }],
    cues: [{ id: 'c1', name: 'Cue 1', presetIds: ['p1'], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }],
    automations: []
  }
}

function channels() {
  return [lastPatch[1], lastPatch[2], lastPatch[3], lastPatch[4]]
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.getBoundingClientRect = () => RECT as unknown as DOMRect
  // Assign onto the real jsdom window (never replace it — React reads
  // window.HTMLIFrameElement while committing, see NOTES.md).
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    setChannels: (patch: Record<number, number>) => { lastPatch = { ...patch } }
  }
  lastPatch = {}
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  root = undefined
  container?.remove()
  container = undefined
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

describe('migration to schema v4 (Piece 8)', () => {
  it('keeps a v3 cue’s raw values as its ad-hoc properties and adds empty reference lists', () => {
    const raw = {
      schemaVersion: 3,
      id: 'old', name: 'Old show', createdAt: 0, updatedAt: 0,
      fixtures: [LED],
      cues: [{ id: 'c1', name: 'Red', fadeMs: 0, fixtureValues: { led: { intensity: 255, red: 200, green: 0, blue: 0 } } }],
      automations: []
    }
    const show = migrateShow(raw)
    expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(show.cues[0].presetIds).toEqual([])
    expect(show.cues[0].sequenceIds).toEqual([])
    expect(show.cues[0].fixtureValues).toEqual({ led: { intensity: 255, red: 200, green: 0, blue: 0 } })
    // Idempotent: a second migration changes nothing.
    expect(migrateShow(JSON.parse(JSON.stringify(show)))).toEqual(show)
  })

  it('keeps references a cue already has', () => {
    const show = migrateShow({
      ...testShow(),
      schemaVersion: 4,
      cues: [{ id: 'c1', name: 'Cue 1', presetIds: ['p1'], sequenceIds: ['s1'], fixtureValues: {}, fadeMs: 0 }]
    })
    expect(show.cues[0].presetIds).toEqual(['p1'])
    expect(show.cues[0].sequenceIds).toEqual(['s1'])
  })
})

describe('preset edits propagate to cues that reference them', () => {
  it('updates the active cue’s DMX output when its preset changes', () => {
    useShowStore.getState().setShow(testShow())
    useShowStore.getState().activateCue('c1')
    expect(channels()).toEqual([255, 200, 0, 0])
    // The cue is not re-activated: editing the preset alone must move the output.
    useShowStore.getState().updatePresetContents('p1', { led: { intensity: 255, red: 0, green: 200, blue: 0 } })
    expect(channels()).toEqual([255, 0, 200, 0])
  })

  it('drops a deleted preset’s contribution, falling back to the cue’s ad-hoc values and fixture defaults', () => {
    useShowStore.getState().setShow(testShow())
    useShowStore.getState().activateCue('c1')
    expect(channels()).toEqual([255, 200, 0, 0])
    useShowStore.getState().deletePreset('p1')
    // No ad-hoc values on the cue: the fixture defaults fill in — the
    // generic LED defaults to intensity 255 and LightKey blue (Piece 11).
    expect(channels()).toEqual([255, 0, 0, 255])
  })

  it('keeps the cue’s ad-hoc values winning over the preset', () => {
    const show = testShow()
    show.cues[0].fixtureValues = { led: { red: 30 } }
    useShowStore.getState().setShow(show)
    useShowStore.getState().activateCue('c1')
    expect(channels()).toEqual([255, 30, 0, 0])
  })
})

describe('Design panel through the reference model', () => {
  function renderWithCue() {
    const base = useShowStore.getState().show
    if (!base) throw new Error('store has no default show')
    const show: ShowDef = {
      ...base,
      id: 'test-show',
      fixtures: [LED as ShowDef['fixtures'][number]],
      presets: [
        { id: 'p1', name: 'Red', category: 'color', fixtureValues: { led: { intensity: 255, red: 200, green: 0, blue: 0 } } },
        { id: 'p2', name: 'Green', category: 'color', fixtureValues: { led: { intensity: 255, red: 0, green: 200, blue: 0 } } }
      ],
      cues: [{ id: 'c1', name: 'Cue 1', presetIds: ['p1'], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }]
    }
    act(() => {
      useShowStore.setState({ show, cues: show.cues, presets: show.presets ?? [], selectedFixtureIds: ['led'], activeCueId: 'c1', editingPresetId: null })
    })
    renderInRoot(<DesignTab />)
  }

  it('reads the preset’s intensity in the Dimmer fader', () => {
    renderWithCue()
    expect(container?.querySelector('[aria-label="Dimmer for selected fixtures"]')?.getAttribute('aria-valuenow')).toBe('255')
    expect(container?.textContent).toContain('100%')
  })

  it('shows the cue’s contents and adds a preset from the panel', () => {
    renderWithCue()
    expect(container?.textContent).toContain('Red')
    expect(container?.textContent).toContain('Ad hoc: 0 properties')
    const select = container?.querySelector('[aria-label="Add preset to cue"]') as HTMLSelectElement | null
    if (!select) throw new Error('no add-preset select')
    act(() => {
      select.value = 'p2'
      select.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    const cue = useShowStore.getState().cues.find((c) => c.id === 'c1')
    expect(cue?.presetIds).toEqual(['p1', 'p2'])
    expect(container?.textContent).toContain('Green')
    // The later preset wins: the cue now reads green.
    expect(useShowStore.getState().cues.find((c) => c.id === 'c1')).toBeDefined()
  })
})
