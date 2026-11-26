// @vitest-environment jsdom
// CueListEditor (Jake, 26 Nov 2026): "+ Cue" must work from zero cues —
// it used to be disabled whenever the show had no cues — and a step's
// contents (its cue's presets, sequences and ad-hoc values) must be
// viewable from the cuelist.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { CueListEditor } from '../src/renderer/src/components/CueListEditor'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// Assign onto jsdom's window — replacing it wholesale (vi.stubGlobal)
// breaks React's commit phase (HTMLElement goes missing).
;(window as unknown as { electronAPI: unknown }).electronAPI = { setChannels: vi.fn() }
vi.stubGlobal('cancelAnimationFrame', vi.fn())
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

let container: HTMLDivElement
let root: Root

const buttonByText = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)

function makeShow(cues: unknown[] = []) {
  return migrateShow({
    fixtures: [{ id: 'q1', name: 'Q1', type: 'rgba-4ch', channelStart: 1, channels: 4 }],
    presets: [{ id: 'p-red', name: 'Red', category: 'color', fixtureValues: { q1: { red: 255, green: 0, blue: 0, intensity: 255 } } }],
    cueLists: [{ id: 'c1', name: 'Set', steps: [{ id: 'step1', cueId: 'cue1', fadeMs: 1000, holdMs: 0 }], loop: false }],
    cues,
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('CueListEditor', () => {
  it('shows a step cue contents: presets and ad-hoc values', () => {
    useShowStore.getState().setShow(makeShow([
      { id: 'cue1', name: 'Cue 1', presetIds: ['p-red'], sequenceIds: [], fixtureValues: { q1: { intensity: 200 } }, fadeMs: 1000 },
    ]))
    act(() => { root.render(<CueListEditor listId="c1" />) })
    const toggle = container.querySelector('button[aria-label="Show contents of cue 1"]') as HTMLButtonElement
    expect(toggle).not.toBeNull()
    act(() => { toggle.click() })
    expect(container.textContent).toContain('Red')
    expect(container.textContent).toContain('Q1 · intensity 200')
  })

  it('"+ Cue" is enabled with zero cues and adds a cue plus a step', () => {
    useShowStore.getState().setShow(makeShow([]))
    // The list references a cue that does not exist yet — the editor
    // still renders (the step reads as a missing cue).
    act(() => { root.render(<CueListEditor listId="c1" />) })
    const add = buttonByText('+ Cue')
    expect(add).toBeDefined()
    expect(add!.disabled).toBe(false)
    act(() => { add!.click() })
    const state = useShowStore.getState()
    expect(state.cues).toHaveLength(1)
    expect(state.cues[0].name).toBe('Cue 1')
    expect(state.cueLists.find((item) => item.id === 'c1')!.steps).toHaveLength(2)
    // The new step is visible in the editor.
    expect(container.querySelector('select[aria-label="Cue for cue 2"]')).not.toBeNull()
  })
})
