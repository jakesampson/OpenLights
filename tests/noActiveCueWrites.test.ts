import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

// Bug 1 (Jake, 19 Nov 2026): on a multipart fixture the Design colour
// wheel did nothing until a channel fader had been dragged. Root cause:
// the wheel's writes go through writeColourToActiveCue, which called
// addCue() when no cue was active — but addCue creates the cue WITHOUT
// setting activeCueId, so the lookup that followed found nothing and the
// write was silently dropped. The channel faders use updateSelectedFixtures
// instead, which creates the cue inline AND activates it in the same
// update — that is why dragging a fader "woke the wheel up". The fix makes
// every write path that assumed addCue activates (wheel, centre picker /
// favourites, per-beam sliders, paste, fan save) create-and-activate the
// cue the way the faders do.
describe('writes with no active cue', () => {
  it('a wheel write (setSelectedBaseColor) creates and activates a cue and stores the colour', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], cues: [] }))
    expect(state().activeCueId).toBeNull()
    state().selectFixtures(['a'])
    state().setSelectedBaseColor({ red: 255, green: 0, blue: 0 })
    expect(state().cues.length).toBe(1)
    expect(state().activeCueId).toBe(state().cues[0].id)
    expect(state().cues[0].fixtureValues.a).toMatchObject({ red: 255, green: 0, blue: 0 })
  })

  it('a whole-colour write (setSelectedColor) creates and activates a cue and stores the colour', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], cues: [] }))
    expect(state().activeCueId).toBeNull()
    state().selectFixtures(['a'])
    state().setSelectedColor({ red: 0, green: 255, blue: 0 })
    expect(state().cues.length).toBe(1)
    expect(state().activeCueId).toBe(state().cues[0].id)
    expect(state().cues[0].fixtureValues.a).toMatchObject({ red: 0, green: 255, blue: 0 })
  })

  it('a per-beam write (updateSelectedBeamValues) creates and activates a cue and stores the beam colour', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'px', name: 'PAN', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }], cues: [] }))
    expect(state().activeCueId).toBeNull()
    state().selectFixtureBeam('px', 'cell-2')
    state().updateSelectedBeamValues({ red: 255 })
    expect(state().cues.length).toBe(1)
    expect(state().activeCueId).toBe(state().cues[0].id)
    expect(state().cues[0].fixtureValues.px).toMatchObject({ red2: 255 })
    expect(state().cues[0].fixtureValues.px.red).toBe(0)
  })
})
