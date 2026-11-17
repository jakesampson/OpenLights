import { expect, it, describe } from 'vitest'
import type { FixtureDef, SequenceDef } from '../src/shared/types'
import { sequenceValues } from '../src/renderer/src/lib/sequenceClock'
import { BUILTIN_PROFILES } from '../src/shared/fixtureProfiles'

describe('fixture movements with sequences (6.10)', () => {
  const movingHead: FixtureDef = {
    id: 'mh1', name: 'MH1', type: 'moving-head', channelStart: 1, channels: 8,
    profileId: 'head-8ch', modeId: 'default',
    profile: BUILTIN_PROFILES.find((p) => p.id === 'head-8ch')!
  }

  it('interpolates pan/tilt between position steps at 50% mix', () => {
    const seq: SequenceDef = {
      id: 'move', name: 'Move', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1,
      steps: [
        { id: 'a', name: 'A', fixtureValues: { mh1: { pan: 0, tilt: 0 } }, presetIds: [], fadeMs: 1000, holdMs: 0 },
        { id: 'b', name: 'B', fixtureValues: { mh1: { pan: 255, tilt: 128 } }, presetIds: [], fadeMs: 1000, holdMs: 0 }
      ]
    }
    // At t=500ms into step B (halfway through 1000ms fade from A to B)
    const vals = sequenceValues(seq, [], [movingHead], 500, 1, 120)
    expect(vals.mh1.pan).toBe(128)  // midpoint of 0-255
    expect(vals.mh1.tilt).toBe(64)  // midpoint of 0-128
  })

  it('interpolates 16-bit pan/tilt with fine channels correctly', () => {
    // Create a fixture with panFine and tiltFine
    const fineHead: FixtureDef = {
      id: 'mh2', name: 'MH2', type: 'moving-head', channelStart: 1, channels: 10,
      profile: {
        id: 'fine-head', name: 'Fine Head', manufacturer: 'Generic', legacyType: 'moving-head',
        modes: [{ id: 'default', name: 'Default', channels: [
          { number: 0, attribute: 'intensity', propertyType: 'intensity', min: 0, max: 255, defaultValue: 0, highlightValue: 255 },
          { number: 1, attribute: 'pan', propertyType: 'position', min: 0, max: 255, defaultValue: 128, highlightValue: 128 },
          { number: 2, attribute: 'panFine', propertyType: 'position', min: 0, max: 255, defaultValue: 0, highlightValue: 0 },
          { number: 3, attribute: 'tilt', propertyType: 'position', min: 0, max: 255, defaultValue: 128, highlightValue: 128 },
          { number: 4, attribute: 'tiltFine', propertyType: 'position', min: 0, max: 255, defaultValue: 0, highlightValue: 0 },
        ] }]
      }
    }

    const seq: SequenceDef = {
      id: 'fine-move', name: 'Fine Move', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1,
      steps: [
        { id: 'a', name: 'A', fixtureValues: { mh2: { pan: 0, panFine: 0, tilt: 0, tiltFine: 0 } }, presetIds: [], fadeMs: 1000, holdMs: 0 },
        { id: 'b', name: 'B', fixtureValues: { mh2: { pan: 1, panFine: 0, tilt: 2, tiltFine: 0 } }, presetIds: [], fadeMs: 1000, holdMs: 0 }
      ]
    }

    // At 50% fade: pan goes from 0x0000 to 0x0100 (256), midpoint is 0x0080 (128) = pan:0, panFine:128
    const vals = sequenceValues(seq, [], [fineHead], 500, 1, 120)
    expect(vals.mh2.pan).toBe(0)
    expect(vals.mh2.panFine).toBe(128)
    // tilt goes from 0x0000 to 0x0200 (512), midpoint is 0x0100 (256) = tilt:1, tiltFine:0
    expect(vals.mh2.tilt).toBe(1)
    expect(vals.mh2.tiltFine).toBe(0)
  })

  it('handles position steps with no fade (snap)', () => {
    const seq: SequenceDef = {
      id: 'snap', name: 'Snap', order: 'forward', loop: true, timing: 'manual', stepsPerBeat: 1,
      steps: [
        { id: 'a', name: 'A', fixtureValues: { mh1: { pan: 0, tilt: 0 } }, presetIds: [], fadeMs: 0, holdMs: 500 },
        { id: 'b', name: 'B', fixtureValues: { mh1: { pan: 255, tilt: 128 } }, presetIds: [], fadeMs: 0, holdMs: 500 }
      ]
    }
    const before = sequenceValues(seq, [], [movingHead], 0, 1, 120)
    expect(before.mh1.pan).toBe(0)
    const after = sequenceValues(seq, [], [movingHead], 500, 1, 120)
    expect(after.mh1.pan).toBe(255)
    expect(after.mh1.tilt).toBe(128)
  })
})
