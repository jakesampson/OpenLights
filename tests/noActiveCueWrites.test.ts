import { describe, expect, it, vi } from 'vitest'
import { activeCueId, collectInlineCues, useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

// Bug 1 (Jake, 19 Nov 2026): on a multipart fixture the Design colour
// wheel did nothing until a channel fader had been dragged. Root cause:
// the wheel's writes go through writeColourToActiveCue, which called
// addCue() when no cue was active — but addCue creates the cue WITHOUT
// setting activeCueId, so the lookup that followed found nothing and the
// write was silently dropped.
//
// Inline cues (Jake, 27 Nov 2026) settle this the other way: there is
// no free-floating cue to mint any more — `ensureActiveCue` is gone —
// so a non-manual Design write with no active cue is DROPPED, no cue
// minted. (This is a behaviour decision, flagged for Jake to confirm:
// the mint used to be how a wheel drag created "Cue 1" in a fresh
// show. Normal Design writes are manual overrides and never reach
// here, so in the real app the path is nearly unreachable — DesignTab
// passes manual=true for normal writes.)
describe('writes with no active cue', () => {
  it('a wheel write (setSelectedBaseColor) is dropped and mints no cue', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], cues: [] }))
    expect(activeCueId(state())).toBeNull()
    state().selectFixtures(['a'])
    state().setSelectedBaseColor({ red: 255, green: 0, blue: 0 })
    expect(collectInlineCues(state().show, state().cueLists)).toHaveLength(0)
    expect(activeCueId(state())).toBeNull()
  })

  it('a whole-colour write (setSelectedColor) is dropped and mints no cue', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], cues: [] }))
    expect(activeCueId(state())).toBeNull()
    state().selectFixtures(['a'])
    state().setSelectedColor({ red: 0, green: 255, blue: 0 })
    expect(collectInlineCues(state().show, state().cueLists)).toHaveLength(0)
    expect(activeCueId(state())).toBeNull()
  })

  it('a per-beam write (updateSelectedBeamValues) is dropped and mints no cue', () => {
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'px', name: 'PAN', type: 'pixel-bar-17ch', channelStart: 1, channels: 17 }], cues: [] }))
    expect(activeCueId(state())).toBeNull()
    state().selectFixtureBeam('px', 'cell-2')
    state().updateSelectedBeamValues({ red: 255 })
    expect(collectInlineCues(state().show, state().cueLists)).toHaveLength(0)
    expect(activeCueId(state())).toBeNull()
  })

  it('repeated wheel writes with no active cue still mint no cue (Jake, 20 Nov 2026)', () => {
    // Before 98cd019 every pointer-move of a wheel drag created a cue
    // and dropped the write — a session of wheel testing left ~200
    // orphan "Cue N" cues in Jake's show file (header field: "Cue 208").
    // Now a drag is dozens of dropped writes; none of them mints.
    const state = () => useShowStore.getState()
    state().setShow(migrateShow({ fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }], cues: [] }))
    state().selectFixtures(['a'])
    for (let n = 0; n < 25; n++) state().setSelectedBaseColor({ red: n * 10, green: 0, blue: 0 })
    expect(collectInlineCues(state().show, state().cueLists)).toHaveLength(0)
    expect(activeCueId(state())).toBeNull()
  })

  it('a write with an active cue lands in that cue, and undoing the write leaves the cue intact for the next write', () => {
    // The old test undid a cue CREATION; there is no creation any
    // more. The surviving behaviour: a write lands in the active
    // cue, undo returns the cue to its pre-write values, and a later
    // write still lands (no dangling id drops it).
    const state = () => useShowStore.getState()
    const cue = { id: 'cue1', name: 'Cue 1', fadeMs: 0, fixtureValues: { a: { intensity: 0, red: 0, green: 0, blue: 0 } } }
    state().setShow(migrateShow({
      fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }],
      livePages: [{ id: 'page', name: 'Page', controls: [{ id: 'btn', name: 'Cue 1', type: 'push', cue, presetIds: [] }] }]
    }))
    state().selectFixtures(['a'])
    state().activateCue('cue1')
    state().setSelectedBaseColor({ red: 255, green: 0, blue: 0 })
    expect(collectInlineCues(state().show, state().cueLists)[0].fixtureValues.a).toMatchObject({ red: 255, green: 0, blue: 0 })
    state().undo()
    expect(collectInlineCues(state().show, state().cueLists)[0].fixtureValues.a).toEqual({ intensity: 0, red: 0, green: 0, blue: 0 })
    expect(activeCueId(state())).toBe('cue1')
    state().setSelectedBaseColor({ red: 0, green: 255, blue: 0 })
    expect(collectInlineCues(state().show, state().cueLists)[0].fixtureValues.a).toMatchObject({ red: 0, green: 255, blue: 0 })
  })

  it('a write with an active cue mints no second cue, even when a "Cue 5" already exists', () => {
    // The old auto-numbering test: a wheel write minted "Cue 6" next
    // to an existing "Cue 5". Minting is gone — the write lands in the
    // active cue and the cue count stays at one.
    const state = () => useShowStore.getState()
    const cue = { id: 'old', name: 'Cue 5', fadeMs: 0, fixtureValues: { a: { intensity: 0, red: 0, green: 0, blue: 0 } } }
    state().setShow(migrateShow({
      fixtures: [{ id: 'a', name: 'PAR', type: 'par', channelStart: 1, channels: 4 }],
      livePages: [{ id: 'page', name: 'Page', controls: [{ id: 'btn', name: 'Cue 5', type: 'push', cue, presetIds: [] }] }]
    }))
    state().selectFixtures(['a'])
    state().activateCue('old')
    state().setSelectedBaseColor({ red: 0, green: 0, blue: 255 })
    const cues = collectInlineCues(state().show, state().cueLists)
    expect(cues).toHaveLength(1)
    expect(cues[0].name).toBe('Cue 5')
    expect(cues[0].fixtureValues.a).toMatchObject({ blue: 255 })
  })
})
