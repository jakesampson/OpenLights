import type { MidiMapping } from '@shared/types'

export interface MidiMessage {
  type: 'noteon' | 'noteoff' | 'cc'
  channel: number // 1-16
  number: number // note / CC number 0-127
  value: number // 0-127
}

type MessageHandler = (msg: MidiMessage) => void
type DeviceChangeHandler = (inputs: string[]) => void
type ClockHandler = (timestampMs: number) => void

let access: MIDIAccess | null = null
let handler: MessageHandler | null = null
let deviceChangeHandler: DeviceChangeHandler | null = null
let clockHandler: ClockHandler | null = null

function inputNames(): string[] {
  if (!access) return []
  const names: string[] = []
  access.inputs.forEach((input) => names.push(input.name || input.id))
  return names
}

function bindInputs() {
  if (!access) return
  access.inputs.forEach((input) => {
    input.onmidimessage = (event: MIDIMessageEvent) => {
      const data = event.data
      if (!data || data.length === 0) return
      if (data[0] === 0xf8) { clockHandler?.(event.timeStamp); return }
      if (data.length < 3) return
      const status = data[0]
      const command = status & 0xf0
      const channel = (status & 0x0f) + 1
      const number = data[1]
      const value = data[2]
      let type: MidiMessage['type'] | null = null
      if (command === 0x90 && value > 0) type = 'noteon'
      else if (command === 0x80 || (command === 0x90 && value === 0)) type = 'noteoff'
      else if (command === 0xb0 && value > 0) type = 'cc'
      if (!type) return
      handler?.({ type, channel, number, value })
    }
  })
  deviceChangeHandler?.(inputNames())
}

/**
 * Initialise Web MIDI access and route incoming note/CC messages to the
 * provided handler. onDevicesChange is called with the current list of
 * input names whenever the device set changes (and once immediately).
 */
export async function initMidi(
  onMessage: MessageHandler,
  onDevicesChange?: DeviceChangeHandler,
  onClock?: ClockHandler
): Promise<string[]> {
  handler = onMessage
  deviceChangeHandler = onDevicesChange ?? null
  clockHandler = onClock ?? null
  if (!midiAvailable()) {
    throw new Error('Web MIDI is not available in this environment')
  }
  try {
    const next = await navigator.requestMIDIAccess({ sysex: false })
    if (access) {
      access.onstatechange = null
      access.inputs.forEach((input) => {
        input.onmidimessage = null
      })
    }
    access = next
    access.onstatechange = () => bindInputs()
    bindInputs()
    return inputNames()
  } catch (e) {
    access = null
    throw e
  }
}

export function midiAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
}

export function matchMapping(mappings: MidiMapping[], msg: MidiMessage): MidiMapping | null {
  return (
    mappings.find(
      (m) => m.midiType === msg.type && m.channel === msg.channel && m.number === msg.number
    ) ?? null
  )
}

export function describeMapping(m: MidiMapping): string {
  const kind = m.midiType === 'cc' ? 'CC' : m.midiType === 'noteoff' ? 'Note release' : 'Note'
  return `${kind} ${m.number} · ch ${m.channel}`
}

export interface MidiAction { type: MidiMapping['targetType']; targetId: string | null; value?: number }

export function learnMapping(target: Pick<MidiMapping, 'targetType' | 'targetId' | 'name'>, msg: MidiMessage, id: string): MidiMapping {
  return {
    id,
    ...target,
    midiType: msg.type,
    channel: msg.channel,
    number: msg.number,
    trigger: target.targetType === 'master' && msg.type === 'cc' ? 'value' : msg.type === 'noteoff' ? 'release' : 'press'
  }
}

export function mappingAction(mapping: MidiMapping, msg: MidiMessage): MidiAction | null {
  if (mapping.midiType !== msg.type || mapping.channel !== msg.channel || mapping.number !== msg.number) return null
  const trigger = mapping.trigger ?? (mapping.targetType === 'master' && mapping.midiType === 'cc' ? 'value' : 'press')
  if (trigger === 'press' && msg.type === 'noteoff') return null
  if (trigger === 'release' && msg.type !== 'noteoff') return null
  return { type: mapping.targetType, targetId: mapping.targetId, ...(trigger === 'value' ? { value: msg.value / 127 } : {}) }
}
