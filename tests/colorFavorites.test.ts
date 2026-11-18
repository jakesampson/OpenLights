import { describe, expect, it, vi } from 'vitest'
import { useShowStore } from '../src/renderer/src/stores/showStore'
import { migrateShow } from '../src/shared/migrations'
import { hexToRgb } from '../src/renderer/src/lib/colorMix'
vi.stubGlobal('window', { electronAPI: { setChannels: vi.fn() } }); vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))

function setup() {
  const state = () => useShowStore.getState()
  state().setShow(migrateShow({
    fixtures: [
      { id: 'a', name: 'RGB', type: 'par', channelStart: 1, channels: 4 },
      { id: 'b', name: 'RGB 2', type: 'par', channelStart: 5, channels: 4 }
    ],
    cues: [{ id: 's', name: 'S', fadeMs: 0, fixtureValues: { a: { intensity: 255, red: 0, green: 0, blue: 255 } } }]
  }))
  state().activateCue('s')
  state().selectFixtures(['a'])
  return state
}

describe('colour favourites', () => {
  it('parses hex colours for recall', () => {
    expect(hexToRgb('#ff8000')).toEqual({ red: 255, green: 128, blue: 0 })
    expect(hexToRgb('#FF8000')).toEqual({ red: 255, green: 128, blue: 0 })
    expect(hexToRgb('red')).toBeNull()
    expect(hexToRgb('#ff80')).toBeNull()
  })

  it('saves the current colour as a favourite, normalised and de-duplicated', () => {
    const state = setup()
    // The current colour on the selection is orange.
    state().setSelectedColor({ red: 255, green: 128, blue: 0 })
    state().addColorFavorite('#FF8000')
    expect(state().show!.colorFavorites).toEqual(['#ff8000'])
    // Saving the same colour again (any case) does not duplicate it.
    state().addColorFavorite('#ff8000')
    expect(state().show!.colorFavorites).toEqual(['#ff8000'])
    // A non-colour is ignored.
    state().addColorFavorite('not-a-colour')
    expect(state().show!.colorFavorites).toEqual(['#ff8000'])
    // Favourites are part of the persisted project.
    expect(state().showForSave()?.colorFavorites).toEqual(['#ff8000'])
  })

  it('recalls a favourite onto the selected fixtures only', () => {
    const state = setup()
    state().addColorFavorite('#ff8000')
    // Move the selection to a different colour first.
    state().setSelectedColor({ red: 0, green: 0, blue: 255 })
    expect(state().cues[0].fixtureValues.a).toEqual({ intensity: 255, red: 0, green: 0, blue: 255 })
    // Recall the favourite the way the Design swatch does: parse it and apply it.
    const favourite = state().show!.colorFavorites![0]
    const rgb = hexToRgb(favourite)
    expect(rgb).not.toBeNull()
    state().setSelectedColor(rgb!)
    expect(state().cues[0].fixtureValues.a).toEqual({ intensity: 255, red: 255, green: 128, blue: 0 })
    // The unselected fixture is untouched.
    expect(state().cues[0].fixtureValues.b).toBeUndefined()
  })

  it('removes a favourite', () => {
    const state = setup()
    state().addColorFavorite('#ff8000')
    state().addColorFavorite('#00ff00')
    state().removeColorFavorite('#FF8000')
    expect(state().show!.colorFavorites).toEqual(['#00ff00'])
    // Removing one that is not there is a no-op.
    state().removeColorFavorite('#0000ff')
    expect(state().show!.colorFavorites).toEqual(['#00ff00'])
  })
})
