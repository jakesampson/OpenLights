// Highlight Mode (LightKey Guide pp.32, 64 — "Locate fixtures"): when
// enabled, the selected fixture(s) light up at their profile highlight
// values and everything else goes dark; turning it off returns the rig
// to the cue it was playing.
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { applyHighlight } from '../src/renderer/src/lib/highlight'
import type { FixtureDef, ShowDef } from '../src/shared/types'

// Assign electronAPI onto the real jsdom window — do not replace window
// itself (see patchDialog.test.tsx).
const sent: Record<number, number>[] = []
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  setChannels: (patch: Record<number, number>) => { sent.push({ ...patch }) }
}
import { configureEffects } from '../src/renderer/src/lib/output'
import { useShowStore } from '../src/renderer/src/stores/showStore'

const led = (id: string, channelStart: number): FixtureDef => ({ id, name: id, type: 'generic-led', channelStart, channels: 4 })
const rgba = (id: string, channelStart: number): FixtureDef => ({ id, name: id, type: 'rgba-4ch', channelStart, channels: 4 })
const head = (id: string, channelStart: number): FixtureDef => ({ id, name: id, type: 'moving-head', channelStart, channels: 8 })

describe('Highlight Mode output transform', () => {
  const fixtures = [led('a', 1), led('b', 5), rgba('c', 9), head('mh', 13)]
  const litPatch: Record<number, number> = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 200]))

  it('lights the selected fixtures at their profile highlight values and zeroes the rest', () => {
    const out = applyHighlight(litPatch, fixtures, ['a'])
    expect([out[1], out[2], out[3], out[4]]).toEqual([255, 255, 255, 255])
    expect([out[5], out[6], out[7], out[8]]).toEqual([0, 0, 0, 0])
    expect([out[9], out[10], out[11], out[12]]).toEqual([0, 0, 0, 0])
    expect([out[13], out[14], out[15], out[16], out[17], out[18], out[19], out[20]]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('centres a moving head (pan/tilt 128) with its colour at full and gobo/strobe off', () => {
    const out = applyHighlight(litPatch, fixtures, ['mh'])
    expect([out[13], out[14], out[15], out[16], out[17], out[18], out[19], out[20]]).toEqual([255, 128, 128, 255, 255, 255, 0, 0])
  })

  it('lights a fixture with no dimmer channel at its LED highlight values', () => {
    const out = applyHighlight(litPatch, fixtures, ['c'])
    expect([out[9], out[10], out[11], out[12]]).toEqual([255, 255, 255, 255])
  })

  it('lights several selected fixtures at once, and none when nothing is selected', () => {
    const both = applyHighlight(litPatch, fixtures, ['a', 'mh'])
    expect([both[1], both[2], both[3], both[4]]).toEqual([255, 255, 255, 255])
    expect([both[13], both[14], both[15]]).toEqual([255, 128, 128])
    expect([both[5], both[6], both[7], both[8]]).toEqual([0, 0, 0, 0])
    const none = applyHighlight(litPatch, fixtures, [])
    expect(Object.values(none).every((v) => v === 0)).toBe(true)
  })

  it('keeps a disabled fixture dark even when it is selected, and ignores unknown ids', () => {
    const disabled = { ...led('a', 1), disabled: true }
    const out = applyHighlight(litPatch, [disabled, led('b', 5)], ['a', 'missing'])
    expect([out[1], out[2], out[3], out[4]]).toEqual([0, 0, 0, 0])
    expect([out[5], out[6], out[7], out[8]]).toEqual([0, 0, 0, 0])
  })

  it('zeroes footprint channels the profile does not list', () => {
    const partial: FixtureDef = {
      id: 'p', name: 'Partial', type: 'generic-led', channelStart: 1, channels: 4,
      profile: { id: 'partial', name: 'Partial', manufacturer: 'Test', legacyType: 'generic-led', modes: [{ id: 'default', name: 'Default', channels: [
        { number: 0, attribute: 'intensity', propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
        { number: 1, attribute: 'red', propertyType: 'color', min: 0, max: 255, defaultValue: 0, highlightValue: 255 }
      ] }] }
    }
    const out = applyHighlight(litPatch, [partial], ['p'])
    expect([out[1], out[2], out[3], out[4]]).toEqual([255, 255, 0, 0])
  })
})

describe('Highlight Mode in the store', () => {
  it('solos the selected fixture and returns to the cue when turned off', () => {
    const show: ShowDef = {
      id: 'show', name: 'Test', createdAt: 0, updatedAt: 0, masterIntensity: 255,
      fixtures: [led('a', 1), led('b', 5)],
      livePages: [{ id: 'page1', name: 'Page', controls: [{ id: 'btn1', name: 'Look', type: 'push', cue: { id: 'cue', name: 'Look', fadeMs: 0, presetIds: [], sequenceIds: [], fixtureValues: { a: { intensity: 200, red: 200, green: 100, blue: 50 }, b: { intensity: 200, red: 10, green: 20, blue: 30 } } }, presetIds: [] }] }], cueLists: [],
      automations: []
    }
    const store = useShowStore.getState()
    store.setShow(show)
    configureEffects({ fixtures: show.fixtures })
    store.activateCue('cue')
    expect([sent[sent.length - 1][1], sent[sent.length - 1][2], sent[sent.length - 1][5]]).toEqual([200, 200, 200])

    store.selectFixtures(['a'])
    store.setHighlightMode(true)
    expect(useShowStore.getState().highlightMode).toBe(true)
    const solo = sent[sent.length - 1]
    expect([solo[1], solo[2], solo[3], solo[4]]).toEqual([255, 255, 255, 255])
    expect([solo[5], solo[6], solo[7], solo[8]]).toEqual([0, 0, 0, 0])

    // The highlight follows the selection while it is on.
    store.selectFixtures(['b'])
    const moved = sent[sent.length - 1]
    expect([moved[1], moved[2], moved[3], moved[4]]).toEqual([0, 0, 0, 0])
    expect([moved[5], moved[6], moved[7], moved[8]]).toEqual([255, 255, 255, 255])

    // Turning it off returns the rig to the cue it was playing.
    store.setHighlightMode(false)
    expect(useShowStore.getState().highlightMode).toBe(false)
    const restored = sent[sent.length - 1]
    expect([restored[1], restored[2], restored[3], restored[4]]).toEqual([200, 200, 100, 50])
    expect([restored[5], restored[6], restored[7], restored[8]]).toEqual([200, 10, 20, 30])
  })
})
