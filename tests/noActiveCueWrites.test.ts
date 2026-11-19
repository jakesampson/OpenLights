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

  it('repeated wheel writes with no active cue still mint exactly one cue (Jake, 20 Nov 2026)', () => {
    // Before 98cd019 every pointer-move of a wheel drag created a cue
    // and dropped the write — a session of wheel testing left ~200
    // orphan "Cue N" cues in Jake's show file (header field: "Cue 208").
    // A drag is dozens of writes; they must all land in the one cue.
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], cues: [] }))
    state().selectFixtures(['a'])
    for (let n = 0; n < 25; n++) state().setSelectedBaseColor({ red: n * 10, green: 0, blue: 0 })
    expect(state().cues.length).toBe(1)
    expect(state().cues[0].fixtureValues.a).toMatchObject({ red: 240, green: 0, blue: 0 })
    expect(state().cues[0].name).toBe('Cue 1')
  })

  it('undoing the cue creation does not leave a dangling active cue id that drops later writes', () => {
    // Undo restores a cue list without the active cue; the id used to
    // survive the restore, so ensureActiveCue early-returned on the
    // truthy-but-stale id and the next wheel write was silently dropped.
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], cues: [] }))
    state().selectFixtures(['a'])
    state().setSelectedBaseColor({ red: 255, green: 0, blue: 0 })
    expect(state().cues.length).toBe(1)
    // Two persists happened (cue creation, then the colour write), so
    // two undos return to the cue-less show.
    state().undo()
    state().undo()
    expect(state().cues.length).toBe(0)
    expect(state().activeCueId).toBeNull()
    state().setSelectedBaseColor({ red: 0, green: 255, blue: 0 })
    expect(state().cues.length).toBe(1)
    expect(state().cues[0].fixtureValues.a).toMatchObject({ red: 0, green: 255, blue: 0 })
  })

  it('cue auto-names follow the highest existing number, not the cue count', () => {
    // With one cue named "Cue 5", length-based numbering would mint a
    // second "Cue 2" — max-based numbering mints "Cue 6".
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({
      fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }],
      cues: [{ id: 'old', name: 'Cue 5', fadeMs: 0, fixtureValues: { a: { intensity: 0, red: 0, green: 0, blue: 0 } } }]
    }))
    state().selectFixtures(['a'])
    state().setSelectedBaseColor({ red: 0, green: 0, blue: 255 })
    expect(state().cues).toHaveLength(2)
    expect(state().cues[1].name).toBe('Cue 6')
  })
})
