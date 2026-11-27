// MIDI panel against inline cues (Jake, 27 Nov 2026): a 'cue'
// mapping names ONE holder's inline cue copy, the panel lists one
// learn row per holder, and a mapping whose cue copy is gone is
// shown as unmappable — never silently dropped.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MidiPanel } from '../src/renderer/src/components/MidiPanel'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

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
  const state = useShowStore.getState()
  state.setShow(migrateShow({
    fixtures: [],
    livePages: [{ id: 'page', name: 'Page', controls: [
      { id: 'btn1', name: 'Song', type: 'push', cue: { id: 'cue-btn', name: 'Song', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 500 }, presetIds: [] },
    ] }],
    cueLists: [{ id: 'list', name: 'Sunday Set', steps: [
      { id: 's1', cue: { id: 'cue-step', name: 'Opener', presetIds: [], sequenceIds: [], fixtureValues: {}, fadeMs: 500 }, fadeMs: 500, holdMs: 0 },
    ] }],
  } as unknown as ShowDef))
  act(() => {
    state.addMidiMapping({ id: 'm-gone', targetType: 'cue', targetId: 'cue-deleted', midiType: 'noteon', channel: 1, number: 60 })
    state.addMidiMapping({ id: 'm-ok', targetType: 'cue', targetId: 'cue-btn', midiType: 'noteon', channel: 1, number: 61 })
  })
  renderInRoot(<MidiPanel />)
})

afterEach(() => {
  if (root) act(() => { root.unmount() })
  container?.remove()
  container = undefined
  root = undefined
})

describe('MidiPanel cue targets (inline cues)', () => {
  it('lists one learn row per holder, labelled with the cue and its holder', () => {
    const text = container!.textContent ?? ''
    expect(text).toContain('Song · Page')
    expect(text).toContain('Opener · Sunday Set')
  })

  it('shows a mapping whose cue copy is gone as unmappable, and keeps the live one named', () => {
    const text = container!.textContent ?? ''
    expect(text).toContain('Cue no longer exists')
    expect(text).toContain('Unmapped — this cue no longer exists.')
    expect(text).toContain('Song')
    // Both mappings are still listed — the dead one is not dropped.
    expect(text).toContain('Active Mappings (2)')
  })
})
