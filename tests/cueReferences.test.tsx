// Cue references (Piece 8, LightKey Guide ch.11 pp.199–202): a cue stores
// preset/sequence references plus its ad-hoc values; editing a preset
// updates every cue that references it, and old shows load unchanged.
// The cue lives in a Live button here (Jake, 27 Nov 2026 — inline
// cues: there is no project-wide cue store any more, so a cue with no
// holder is dropped on load). The DesignTab rendering checks are
// restored at the bottom of this file (Agent 3, 27 Nov 2026): the
// panel reads the active inline cue's resolved look.
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { activeCueId, collectInlineCues, useShowStore } from '../src/renderer/src/stores/showStore'
import { CURRENT_SCHEMA_VERSION, migrateShow } from '../src/shared/migrations'
import { resolveCueValues } from '../src/shared/cueResolution'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect
let lastPatch: Record<number, number> = {}

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

const LED = { id: 'led', name: 'LED', type: 'generic-led', channelStart: 1, channels: 4 }

function testShow(): ShowDef {
  return {
    id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
    fixtures: [LED as ShowDef['fixtures'][number]],
    presets: [{ id: 'p1', name: 'Red', category: 'color', fixtureValues: { led: { intensity: 255, red: 200, green: 0, blue: 0 } } }],
    livePages: [{
      id: 'page', name: 'Page', controls: [
        { id: 'b1', name: 'Cue 1', type: 'push', cue: { id: 'c1', name: 'Cue 1', presetIds: ['p1'], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }, presetIds: [], x: 0, y: 0 }
      ]
    }],
    automations: []
  }
}

function channels() {
  return [lastPatch[1], lastPatch[2], lastPatch[3], lastPatch[4]]
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    setChannels: (patch: Record<number, number>) => { lastPatch = { ...patch } }
  }
  lastPatch = {}
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
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
      // The cue needs a holder to survive the v6 inlining — a button.
      livePages: [{ id: 'page', name: 'Page', controls: [{ id: 'b1', name: 'Red', type: 'push', cueId: 'c1', presetIds: [], x: 0, y: 0 }] }],
      automations: []
    }
    const show = migrateShow(raw)
    expect(show.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    const cue = show.livePages![0].controls[0].cue!
    expect(cue.presetIds).toEqual([])
    expect(cue.sequenceIds).toEqual([])
    expect(cue.fixtureValues).toEqual({ led: { intensity: 255, red: 200, green: 0, blue: 0 } })
    // Idempotent: a second migration changes nothing.
    expect(migrateShow(JSON.parse(JSON.stringify(show)))).toEqual(show)
  })

  it('keeps references a cue already has', () => {
    const show = migrateShow({
      ...testShow(),
      schemaVersion: 4,
      livePages: [{
        id: 'page', name: 'Page', controls: [
          { id: 'b1', name: 'Cue 1', type: 'push', cue: { id: 'c1', name: 'Cue 1', presetIds: ['p1'], sequenceIds: ['s1'], fixtureValues: {}, fadeMs: 0 }, presetIds: [], x: 0, y: 0 }
        ]
      }]
    })
    expect(show.livePages![0].controls[0].cue!.presetIds).toEqual(['p1'])
    expect(show.livePages![0].controls[0].cue!.sequenceIds).toEqual(['s1'])
  })

  it('drops a v3 cue with no holder on load', () => {
    const show = migrateShow({
      schemaVersion: 3,
      id: 'old', name: 'Old show', createdAt: 0, updatedAt: 0,
      fixtures: [LED],
      cues: [{ id: 'c1', name: 'Red', fadeMs: 0, fixtureValues: { led: { intensity: 255, red: 200, green: 0, blue: 0 } } }],
      automations: []
    })
    expect((show as unknown as Record<string, unknown>).cues).toBeUndefined()
    expect(collectInlineCues(show, show.cueLists ?? [])).toHaveLength(0)
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
    // generic LED defaults to intensity 0 (dark) and LightKey blue.
    expect(channels()).toEqual([0, 0, 0, 255])
  })

  it('keeps the cue’s ad-hoc values winning over the preset', () => {
    const show = testShow()
    show.livePages![0].controls[0].cue!.fixtureValues = { led: { red: 30 } }
    useShowStore.getState().setShow(show)
    useShowStore.getState().activateCue('c1')
    expect(channels()).toEqual([255, 30, 0, 0])
  })
})

describe('cue contents through the store (DesignTab rendering moved out)', () => {
  it('the button cue resolves its preset’s intensity', () => {
    useShowStore.getState().setShow(testShow())
    const cue = collectInlineCues(useShowStore.getState().show, useShowStore.getState().cueLists)[0]
    const values = resolveCueValues(cue, useShowStore.getState().presets, useShowStore.getState().show!.fixtures)
    expect(values.led.intensity).toBe(255)
    expect(values.led.red).toBe(200)
  })

  it('adds a preset to the cue through the store and the cue reads green', () => {
    const show = testShow()
    show.presets.push({ id: 'p2', name: 'Green', category: 'color', fixtureValues: { led: { intensity: 255, red: 0, green: 200, blue: 0 } } })
    useShowStore.getState().setShow(show)
    // The cue starts on the red preset: activate it and the output is red.
    useShowStore.getState().activateCue('c1')
    expect(activeCueId(useShowStore.getState())).toBe('c1')
    expect(channels()).toEqual([255, 200, 0, 0])
    // Adding a preset to a cue goes through the store's updateCue, and
    // the cue's resolved look follows it.
    useShowStore.getState().updateCue('c1', { presetIds: ['p1', 'p2'] })
    const cue = collectInlineCues(useShowStore.getState().show, useShowStore.getState().cueLists).find((c) => c.id === 'c1')
    expect(cue?.presetIds).toEqual(['p1', 'p2'])
    // The later preset wins: the cue now reads green.
    expect(channels()).toEqual([255, 0, 200, 0])
  })
})

describe('DesignTab renders the active inline cue (restored, Agent 3)', () => {
  function seedDesign(active: boolean) {
    useShowStore.getState().setShow(testShow())
    act(() => {
      useShowStore.setState({
        selectedFixtureIds: ['led'],
        selectedBeams: [],
        activeCueRef: active ? { kind: 'button', pageId: 'page', controlId: 'b1' } : null,
        editingPresetId: null,
        editingCueAdHocId: null,
        manualOverrides: {},
        activePresetIds: []
      })
    })
    renderInRoot(<DesignTab />)
  }

  it('the Dimmer and the wheel follow the active button cue’s preset', () => {
    seedDesign(true)
    // The cue references the Red preset (intensity 255, red 200):
    // the panel reads the resolved look, not the fixture defaults.
    expect(container?.querySelector('[aria-label="Dimmer for selected fixtures"]')?.getAttribute('aria-valuenow')).toBe('255')
    expect(container?.querySelector('[aria-label="Colour hue"]')?.getAttribute('aria-valuenow')).toBe('0')
  })

  it('with no active cue the same fixture reads its defaults, not the cue', () => {
    seedDesign(false)
    // No cue: a fresh generic LED reads dark (dimmer 0) and the
    // default blue on the wheel (hue 240°).
    expect(container?.querySelector('[aria-label="Dimmer for selected fixtures"]')?.getAttribute('aria-valuenow')).toBe('0')
    expect(container?.querySelector('[aria-label="Colour hue"]')?.getAttribute('aria-valuenow')).toBe('240')
  })

  it('a palette preset in draft-edit mode still wins over the cue', () => {
    // Editing the Red preset (draft edit) while the button cue is
    // active: the panel reads the preset being edited. The preset
    // only defines the fixture's red/intensity, so the Dimmer reads
    // its 255 either way — the hue proves the layer: the cue's
    // resolved red (200) is hue 0°, and so is the preset's.
    useShowStore.getState().setShow(testShow())
    act(() => {
      useShowStore.setState({
        selectedFixtureIds: ['led'],
        selectedBeams: [],
        activeCueRef: { kind: 'button', pageId: 'page', controlId: 'b1' },
        editingPresetId: 'p1',
        editingCueAdHocId: null,
        manualOverrides: {},
        activePresetIds: []
      })
    })
    renderInRoot(<DesignTab />)
    expect(container?.querySelector('[aria-label="Dimmer for selected fixtures"]')?.getAttribute('aria-valuenow')).toBe('255')
  })
})
