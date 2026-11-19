// Design panel declutter (Jake, 19 Nov 2026, screenshots 8.57–9.01pm):
// the "N fixtures selected" title + cue-contents strip at the top of the
// Design panel and the "COLOUR FAVOURITES" bar at the bottom are removed
// — both wasted screen space. The models stay: a cue's presetIds /
// sequenceIds still resolve (see cueReferences.test.tsx) and colour
// favourites still save/remove in the store (see colorFavorites.test.ts);
// only the Design panel UI goes. Source + rendered assertions, in the
// repo's style.
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DesignTab } from '../src/renderer/src/components/DesignTab'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import type { ShowDef } from '../src/shared/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const root = resolve(__dirname, '..')
const design = readFileSync(resolve(root, 'src/renderer/src/components/DesignTab.tsx'), 'utf8')

const RECT = { left: 0, top: 0, width: 150, height: 150, right: 150, bottom: 150, x: 0, y: 0, toJSON: () => ({}) }
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

let container: HTMLDivElement | undefined
let rootNode: Root | undefined

function renderWithCue() {
  const base = useShowStore.getState().show
  if (!base) throw new Error('store has no default show')
  const show: ShowDef = {
    ...base,
    id: 'test-show',
    fixtures: [{ id: 'led', name: 'LED', type: 'generic-led', channelStart: 1, channels: 4 } as ShowDef['fixtures'][number]],
    presets: [
      { id: 'p1', name: 'Red', category: 'color', fixtureValues: { led: { intensity: 255, red: 200, green: 0, blue: 0 } } }
    ],
    cues: [{ id: 'c1', name: 'Cue 1', presetIds: ['p1'], sequenceIds: [], fixtureValues: {}, fadeMs: 0 }]
  }
  act(() => {
    useShowStore.setState({ show, cues: show.cues, presets: show.presets ?? [], selectedFixtureIds: ['led'], activeCueId: 'c1', editingPresetId: null })
  })
  const el = document.createElement('div')
  document.body.appendChild(el)
  container = el
  rootNode = createRoot(el)
  act(() => { rootNode.render(<DesignTab />) })
}

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.getBoundingClientRect = () => RECT as unknown as DOMRect
  // Assign onto the real jsdom window (never replace it — React reads
  // window.HTMLIFrameElement while committing, see NOTES.md).
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { setChannels: () => {} }
})

afterEach(() => {
  if (rootNode) act(() => { rootNode.unmount() })
  rootNode = undefined
  container?.remove()
  container = undefined
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

describe('selection header and cue-contents strip are gone', () => {
  it('DesignTab source has no strip markup', () => {
    expect(design).not.toContain('aria-label="Cue contents"')
    expect(design).not.toContain('aria-label="Add preset to cue"')
    expect(design).not.toContain('aria-label="Add sequence to cue"')
    expect(design).not.toContain('Select fixture(s) on stage')
    expect(design).not.toContain('fixture${selectedFixtures.length')
    expect(design).not.toContain('Editing preset “')
  })

  it('renders with no selection title and no cue-contents row', () => {
    renderWithCue()
    const text = container?.textContent ?? ''
    expect(text).not.toContain('fixture selected')
    expect(text).not.toContain('Select fixture')
    expect(text).not.toContain('Contents:')
    expect(text).not.toContain('Ad hoc:')
    // The controls themselves are untouched: Dimmer and wheel render.
    expect(container?.querySelector('[aria-label="Dimmer for selected fixtures"]')).not.toBeNull()
    expect(container?.querySelector('[aria-label="Colour hue"]')).not.toBeNull()
  })
})

describe('colour favourites strip is gone', () => {
  it('DesignTab source has no favourites markup', () => {
    expect(design).not.toContain('aria-label="Colour favourites"')
    expect(design).not.toContain('No favourites yet — save the current colour with +')
  })

  it('renders with no favourites bar', () => {
    renderWithCue()
    const text = container?.textContent ?? ''
    expect(text).not.toContain('Colour favourites')
    expect(text).not.toContain('No favourites yet')
  })
})
