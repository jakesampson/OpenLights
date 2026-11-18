import { describe, expect, it } from 'vitest'
import type { MidiMapping, MidiTargetType } from '../src/shared/types'
import { learnMapping, mappingAction } from '../src/renderer/src/lib/midi'

const message = { type: 'noteon' as const, channel: 2, number: 64, value: 100 }

describe('MIDI binding actions', () => {
  it('quick-learns the incoming message and derives a value trigger for a master CC', () => {
    const learned = learnMapping({ targetType: 'master', targetId: null, name: 'Master' }, { ...message, type: 'cc' }, 'learned')
    expect(learned).toMatchObject({ id: 'learned', midiType: 'cc', channel: 2, number: 64, trigger: 'value' })
  })

  it.each<MidiTargetType>(['cue', 'preset', 'sequence', 'live-cue', 'blackout', 'blind', 'freeze', 'cue-next', 'cue-prev', 'tap-tempo', 'master'])('resolves the %s action', (targetType) => {
    const mapping: MidiMapping = { id: targetType, targetType, targetId: targetType === 'cue' ? 's1' : null, midiType: 'noteon', channel: 2, number: 64, trigger: 'press' }
    expect(mappingAction(mapping, message)).toEqual({ type: targetType, targetId: mapping.targetId })
  })

  it('distinguishes press, release and continuous value triggers', () => {
    const base: MidiMapping = { id: 'x', targetType: 'master', targetId: null, midiType: 'cc', channel: 2, number: 64, trigger: 'value' }
    expect(mappingAction(base, { ...message, type: 'cc', value: 127 })?.value).toBe(1)
    const release = { ...base, targetType: 'freeze' as const, midiType: 'noteoff' as const, trigger: 'release' as const }
    expect(mappingAction(release, { ...message, type: 'noteoff', value: 0 })?.type).toBe('freeze')
  })
})
