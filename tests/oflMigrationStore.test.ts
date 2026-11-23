// @vitest-environment jsdom
// Jake, 20 Nov 2026 (image-18): the OFL library lives in the main
// process, so migrateShow cannot see it on its own — the renderer must
// hand its cached OFL profiles to the migration, both when a show loads
// and when the library arrives after the show (a fast open can beat the
// IPC round trip). The store keeps the cached profiles and re-heals the
// open show the moment they land.
import { describe, it, expect, beforeEach } from 'vitest'
import { useShowStore, defaultFixtureValues } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import type { ShowDef } from '../src/shared/types'

// Add electronAPI to the real jsdom window — do not replace window itself,
// or React's commit path (window.HTMLIFrameElement) breaks.
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  onMenuCommand: () => () => {},
  listShows: () => Promise.resolve([]),
  listOflProfiles: () => Promise.resolve([]),
  getDmxPorts: () => Promise.resolve([]),
  getDmxStatus: () => Promise.resolve({ connected: false, port: null, baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 1, error: null, mode: 'virtual' }),
  setDmxPort: () => Promise.resolve({ success: true }),
  disconnectDmx: () => Promise.resolve({ success: true }),
  setChannels: () => {},
  getChannels: () => Promise.resolve([])
}

const EP4_ATTRIBUTES = ['red', 'green', 'blue', 'red 2', 'green 2', 'blue 2', 'red 3', 'green 3', 'blue 3', 'red 4', 'green 4', 'blue 4', 'intensity', 'strobe', 'programs', 'program speed', 'curve select']
const oflEp4Profile = (blueDefault: number) => ({
  id: 'ofl:event-lighting:ep4',
  name: 'EP4',
  manufacturer: 'Event Lighting',
  legacyType: 'pixel-bar-17ch' as const,
  modes: [{
    id: '17ch',
    name: '17ch',
    channels: EP4_ATTRIBUTES.map((attribute, number) => ({
      number, attribute,
      propertyType: attribute === 'intensity' ? 'intensity' as const : /^(red|green|blue)/.test(attribute) ? 'color' as const : 'other' as const,
      min: 0, max: 255,
      defaultValue: /^blue/.test(attribute) ? blueDefault : 0,
      highlightValue: /^(intensity|red|green|blue)/.test(attribute) ? 255 : 0
    })),
    beams: [1, 2, 3, 4].map((cell) => ({ id: `cell-${cell}`, name: `Cell ${cell}`, properties: { red: cell === 1 ? 'red' : `red ${cell}`, green: cell === 1 ? 'green' : `green ${cell}`, blue: cell === 1 ? 'blue' : `blue ${cell}` } }))
  }]
})
const staleShow = () => ({
  fixtures: [{
    id: 'bar', name: 'PB1', shortName: 'PB1', type: 'pixel-bar-17ch',
    profileId: 'ofl:event-lighting:ep4', modeId: '17ch',
    channelStart: 1, channels: 17, profile: oflEp4Profile(0)
  }],
  cues: []
} as unknown as ShowDef)

beforeEach(() => {
  const state = useShowStore.getState()
  state.setShow(migrateShow({ fixtures: [], cues: [] } as unknown as ShowDef))
  state.setOflProfiles([])
})

describe('OFL profiles in the store', () => {
  it('heals the open show when the OFL library arrives after the show', () => {
    const state = useShowStore.getState()
    state.setShow(migrateShow(staleShow()))
    expect(defaultFixtureValues(useShowStore.getState().show!.fixtures[0]).blue).toBe(0)
    state.setOflProfiles([oflEp4Profile(255)])
    expect(defaultFixtureValues(useShowStore.getState().show!.fixtures[0]).blue).toBe(255)
    expect(defaultFixtureValues(useShowStore.getState().show!.fixtures[0])['blue 4']).toBe(255)
  })

  it('heals at load when the OFL library is already cached', () => {
    const state = useShowStore.getState()
    state.setOflProfiles([oflEp4Profile(255)])
    state.setShow(migrateShow(staleShow()))
    expect(defaultFixtureValues(useShowStore.getState().show!.fixtures[0]).blue).toBe(255)
  })

  it('does not touch a show with no stale snapshots when the library arrives', () => {
    const state = useShowStore.getState()
    state.setShow(migrateShow({ fixtures: [], cues: [] } as unknown as ShowDef))
    const before = useShowStore.getState().show
    state.setOflProfiles([oflEp4Profile(255)])
    expect(useShowStore.getState().show).toBe(before)
  })

  it('healing is not a user edit: no updatedAt bump, no undo entry, one revision', () => {
    // Jake, 23 Nov 2026 (the quit hang): the startup heal used to mark
    // the untouched demo "Unsaved", so a red-dot close or opening a
    // recent prompted for changes nobody made.
    const state = useShowStore.getState()
    state.setShow(migrateShow(staleShow()))
    const updatedAt = useShowStore.getState().show!.updatedAt
    const undoLength = useShowStore.getState().undoStack.length
    const revision = useShowStore.getState().oflHealRevision
    state.setOflProfiles([oflEp4Profile(255)])
    expect(defaultFixtureValues(useShowStore.getState().show!.fixtures[0]).blue).toBe(255)
    expect(useShowStore.getState().show!.updatedAt).toBe(updatedAt)
    expect(useShowStore.getState().undoStack.length).toBe(undoLength)
    expect(useShowStore.getState().oflHealRevision).toBe(revision + 1)
    // A second arrival heals nothing, so the revision does not move.
    state.setOflProfiles([oflEp4Profile(255)])
    expect(useShowStore.getState().oflHealRevision).toBe(revision + 1)
  })
})
