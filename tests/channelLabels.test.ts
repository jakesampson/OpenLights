import { describe, expect, it } from 'vitest'
import { channelFixtureLabels } from '../src/renderer/src/lib/channelLabels'
describe('DMX monitor fixture labels', () => {
  it('labels offsets, overlapping patches and clips channels outside the universe', () => {
    const labels = channelFixtureLabels([{ id: 'a', name: 'Wash', type: 'par', channelStart: 10, channels: 4 }, { id: 'b', name: 'Dimmer', type: 'dimmer', channelStart: 10, channels: 1 }, { id: 'c', name: 'End', type: 'par', channelStart: 512, channels: 4 }])
    expect(labels[10]).toEqual(['Wash · intensity', 'Dimmer · intensity'])
    expect(labels[11]).toEqual(['Wash · red'])
    expect(labels[1]).toBeUndefined(); expect(labels[513]).toBeUndefined()
  })
})
