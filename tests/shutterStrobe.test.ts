// Shutter/Strobe state mapping (LightKey Guide pp.97–98, 312–314).
// Pure logic: the slot ranges of a fixture's shutter/strobe channel are
// the state — writing a state writes a value inside that state's range,
// and a value inside a ShutterStrobe range IS the strobing output (the
// fixture's own hardware strobes at the rate the value selects).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FixtureChannel } from '../src/shared/types'
import { importOflFixture } from '../src/shared/oflFixtureFormat'
import {
  classifyShutterChannel,
  classifyShutterSlot,
  findShutterChannel,
  shutterSpeedForValue,
  shutterStateForValue,
  shutterValueForState,
  valueAtSpeed,
  type ShutterSlot
} from '../src/renderer/src/lib/shutterStrobe'

function channel(attribute: string, slots?: ShutterSlot[]): FixtureChannel {
  return { number: 0, attribute, propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0, control: slots ? 'options' : 'slider', slots }
}

function slot(id: string, name: string, from: number, to: number, capabilityType: string): ShutterSlot {
  return { id, name, from, to, kind: 'slot', capabilityType }
}

// EP4 (Jake's bar, manual Ch14): Strobe OFF 0–9, strobe 10–255 (1–30 Hz).
const EP4_STROBE = channel('Strobe', [
  slot('off', 'Strobe OFF', 0, 9, 'NoFunction'),
  slot('strobe', 'Strobe (slow-fast 1-30Hz)', 10, 255, 'ShutterStrobe')
])
// Rogue R3 Spot (manual): Off 0–3, On 4–7, Synchronising 8–76, Pulse
// 77–145, Random 146–215, On 216–255.
const R3_STROBE = channel('Strobe', [
  slot('off', 'Off', 0, 3, 'ShutterStrobe'),
  slot('on', 'On', 4, 7, 'ShutterStrobe'),
  slot('sync', 'Synchronizing strobe, slow to fast', 8, 76, 'ShutterStrobe'),
  slot('pulse', 'Pulse strobe, slow to fast', 77, 145, 'ShutterStrobe'),
  slot('random', 'Random strobe, slow to fast', 146, 215, 'ShutterStrobe'),
  slot('on2', 'On', 216, 255, 'ShutterStrobe')
])
// Spectra 300: Open 0–3, five strobe effects, two random strobes — and
// no closed range at all.
const SPECTRA_SHUTTER = channel('Shutter', [
  slot('open', 'Open (Default 0)', 0, 3, 'ShutterStrobe'),
  slot('s1', 'Strobe Effect 1, Slow to Fast', 4, 67, 'ShutterStrobe'),
  slot('s2', 'Strobe Effect 2, Slow to Fast', 68, 99, 'ShutterStrobe'),
  slot('s3', 'Strobe Effect 3, Slow to Fast', 100, 131, 'ShutterStrobe'),
  slot('s4', 'Strobe Effect 4, Slow to Fast', 132, 175, 'ShutterStrobe'),
  slot('s5', 'Strobe Effect 5, Slow to Fast', 176, 247, 'ShutterStrobe'),
  slot('r1', 'Random Strobe Effect 1', 248, 251, 'ShutterStrobe'),
  slot('r2', 'Random Strobe Effect 2', 252, 255, 'ShutterStrobe')
])

describe('classifyShutterSlot', () => {
  it('tells strobe-off from shutter-closed: "Strobe OFF" is open, bare "Off" is closed', () => {
    expect(classifyShutterSlot({ name: 'Strobe OFF', capabilityType: 'NoFunction' })).toBe('off')
    expect(classifyShutterSlot({ name: 'Off', capabilityType: 'ShutterStrobe' })).toBe('closed')
    expect(classifyShutterSlot({ name: 'On', capabilityType: 'ShutterStrobe' })).toBe('open')
    expect(classifyShutterSlot({ name: 'Open (Default 0)', capabilityType: 'ShutterStrobe' })).toBe('open')
  })

  it('classifies the strobe modes and pulse styles by name', () => {
    expect(classifyShutterSlot({ name: 'Strobe (slow-fast 1-30Hz)', capabilityType: 'ShutterStrobe' })).toBe('strobe')
    expect(classifyShutterSlot({ name: 'Synchronizing strobe, slow to fast', capabilityType: 'ShutterStrobe' })).toBe('syncStrobe')
    expect(classifyShutterSlot({ name: 'Random strobe, slow to fast', capabilityType: 'ShutterStrobe' })).toBe('randomStrobe')
    expect(classifyShutterSlot({ name: 'Pulse strobe, slow to fast', capabilityType: 'ShutterStrobe' })).toBe('pulse')
    expect(classifyShutterSlot({ name: 'Sound-active strobe', capabilityType: 'ShutterStrobe' })).toBe('soundActive')
    expect(classifyShutterSlot({ name: 'No function', capabilityType: 'NoFunction' })).toBe('none')
  })
})

describe('classifyShutterChannel', () => {
  it('maps the EP4 strobe channel: strobe-off plus one strobe mode, no Closed', () => {
    const c = classifyShutterChannel(EP4_STROBE)
    expect(c.supported).toBe(true)
    expect(c.offSlot?.id).toBe('off')
    expect(c.strobeSlots.map((s) => s.id)).toEqual(['strobe'])
    expect(c.pulseSlots).toEqual([])
    expect(c.closedSlot).toBeUndefined()
  })

  it('orders the R3 strobe modes in the guide cycle (plain, sync, random) and pulse apart', () => {
    const c = classifyShutterChannel(R3_STROBE)
    expect(c.strobeSlots.map((s) => s.id)).toEqual(['sync', 'random'])
    expect(c.pulseSlots.map((s) => s.id)).toEqual(['pulse'])
    expect(c.openSlot?.id).toBe('on')
    expect(c.closedSlot?.id).toBe('off')
  })

  it('orders the Spectra strobe effects before its random strobes', () => {
    const c = classifyShutterChannel(SPECTRA_SHUTTER)
    expect(c.strobeSlots.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 'r1', 'r2'])
    expect(c.closedSlot).toBeUndefined()
  })
})

describe('shutterStateForValue', () => {
  it('reads the state back from the value', () => {
    const ep4 = classifyShutterChannel(EP4_STROBE)
    expect(shutterStateForValue(ep4, 5).state).toBe('open')
    expect(shutterStateForValue(ep4, 100).state).toBe('strobe')
    const r3 = classifyShutterChannel(R3_STROBE)
    expect(shutterStateForValue(r3, 1).state).toBe('closed')
    expect(shutterStateForValue(r3, 5).state).toBe('open')
    expect(shutterStateForValue(r3, 42).state).toBe('strobe')
    expect(shutterStateForValue(r3, 111).state).toBe('pulse')
    expect(shutterStateForValue(r3, 180).state).toBe('strobe')
    const spectra = classifyShutterChannel(SPECTRA_SHUTTER)
    expect(shutterStateForValue(spectra, 1).state).toBe('open')
    expect(shutterStateForValue(spectra, 50).state).toBe('strobe')
    expect(shutterStateForValue(spectra, 250).state).toBe('strobe')
  })
})

describe('shutterValueForState', () => {
  it('Open writes the strobe-off range when there is no open range (EP4)', () => {
    const c = classifyShutterChannel(EP4_STROBE)
    expect(shutterValueForState(c, 'open')).toBe(5)
  })

  it('Closed writes the closed range, and is undefined when the profile has none', () => {
    expect(shutterValueForState(classifyShutterChannel(R3_STROBE), 'closed')).toBe(2)
    expect(shutterValueForState(classifyShutterChannel(EP4_STROBE), 'closed')).toBeUndefined()
    expect(shutterValueForState(classifyShutterChannel(SPECTRA_SHUTTER), 'closed')).toBeUndefined()
  })

  it('Strobe writes the midpoint of the selected mode at default speed', () => {
    expect(shutterValueForState(classifyShutterChannel(R3_STROBE), 'strobe')).toBe(42)
    expect(shutterValueForState(classifyShutterChannel(R3_STROBE), 'strobe', { modeIndex: 1 })).toBe(181)
    expect(shutterValueForState(classifyShutterChannel(SPECTRA_SHUTTER), 'strobe', { modeIndex: 5 })).toBe(250)
  })

  it('Pulse writes inside the pulse range', () => {
    expect(shutterValueForState(classifyShutterChannel(R3_STROBE), 'pulse')).toBe(111)
  })
})

describe('strobe speed', () => {
  it('is the position inside the active slot range', () => {
    expect(valueAtSpeed({ id: 's', name: 'Strobe', from: 10, to: 255, kind: 'slot' }, 0)).toBe(10)
    expect(valueAtSpeed({ id: 's', name: 'Strobe', from: 10, to: 255, kind: 'slot' }, 1)).toBe(255)
    expect(valueAtSpeed({ id: 's', name: 'Strobe', from: 10, to: 255, kind: 'slot' }, 0.5)).toBe(133)
    const c = classifyShutterChannel(R3_STROBE)
    expect(shutterSpeedForValue(c, 42)?.position).toBeCloseTo(0.5, 2)
    expect(shutterSpeedForValue(c, 5)).toBeUndefined()
  })

  it('strobe writes always land inside a ShutterStrobe range — the fixture itself strobes', () => {
    for (const ch of [EP4_STROBE, R3_STROBE, SPECTRA_SHUTTER]) {
      const c = classifyShutterChannel(ch)
      for (let mode = 0; mode < c.strobeSlots.length; mode++) {
        for (const speed of [0, 0.5, 1]) {
          const value = shutterValueForState(c, 'strobe', { modeIndex: mode, speed })!
          const slot = c.strobeSlots[mode]
          expect(value).toBeGreaterThanOrEqual(slot.from)
          expect(value).toBeLessThanOrEqual(slot.to)
          expect(slot.capabilityType).toBe('ShutterStrobe')
        }
      }
    }
  })
})

describe('findShutterChannel', () => {
  it('is undefined for a slot-less raw strobe byte (built-in moving head)', () => {
    expect(findShutterChannel([channel('strobe')])).toBeUndefined()
  })

  it('prefers an exact Shutter/Strobe attribute, then the master strobe over a per-LED one (Q5)', () => {
    const led1 = channel('Quad LED 1 Strobe', [slot('s', 'Strobe, slow to fast', 1, 250, 'ShutterStrobe')])
    const master = channel('Quad LED Strobe', [slot('s', 'Strobe, slow to fast', 1, 250, 'ShutterStrobe')])
    expect(findShutterChannel([led1, master])?.channel.attribute).toBe('Quad LED Strobe')
    expect(findShutterChannel([channel('Strobe', [slot('s', 'Strobe', 10, 255, 'ShutterStrobe')]), master])?.channel.attribute).toBe('Strobe')
  })
})

describe('Jake’s real fixture profiles', () => {
  const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url))
  function load(file: string) {
    const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
    return importOflFixture(raw, { manufacturerKey: basename(dirname(file)), fixtureKey: basename(file, '.json'), preserveSource: false })
  }
  const FILES = [
    'event-lighting/ep4.json',
    'chauvet-dj/4bar.json',
    'chauvet-dj/fxarray-q5.json',
    'chauvet-professional/rogue-r3-spot.json',
    'volux/spectra-300.json'
  ]

  it('finds a Shutter/Strobe panel on every one of Jake’s fixtures, and Strobe writes a ShutterStrobe-range value', () => {
    for (const file of FILES) {
      const channels = load(file).modes[0].channels
      const shutter = findShutterChannel(channels)
      expect(shutter, file).toBeDefined()
      const value = shutterValueForState(shutter!, 'strobe')!
      const slot = shutter!.strobeSlots.find((s) => value >= s.from && value <= s.to)
      expect(slot?.capabilityType, file).toBe('ShutterStrobe')
    }
  })

  it('Open works on every one of Jake’s fixtures', () => {
    for (const file of FILES) {
      const channels = load(file).modes[0].channels
      expect(shutterValueForState(findShutterChannel(channels)!, 'open'), file).not.toBeUndefined()
    }
  })

  it('Closed exists only where the profile has a closed range', () => {
    const closed = (file: string) => {
      const channels = load(file).modes[0].channels
      return shutterValueForState(findShutterChannel(channels)!, 'closed')
    }
    expect(closed('chauvet-professional/rogue-r3-spot.json')).toBe(2)
    expect(closed('event-lighting/ep4.json')).toBeUndefined()
    expect(closed('chauvet-dj/4bar.json')).toBeUndefined()
    expect(closed('volux/spectra-300.json')).toBeUndefined()
  })
})
