// Auto Program + Auto Program Speed (LightKey Guide p.314 — custom
// fixture properties, not built-ins). The program channel is the
// fixture's built-in-program channel (Effect ranges + a NoFunction
// range = "No Selection"); the speed channel is its EffectSpeed
// channel. Ground truth: the OFL profiles of Jake's fixtures.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FixtureChannel } from '../src/shared/types'
import { importOflFixture } from '../src/shared/oflFixtureFormat'
import {
  findAutoProgram,
  isNoProgramValue,
  programSlotForValue,
  programSpeedRange,
  type ProgramSlot
} from '../src/renderer/src/lib/autoProgram'

function channel(attribute: string, slots?: ProgramSlot[], control?: FixtureChannel['control']): FixtureChannel {
  return { number: 0, attribute, propertyType: 'other', min: 0, max: 255, defaultValue: 0, highlightValue: 0, control: control ?? (slots ? 'options' : 'slider'), slots }
}

function slot(id: string, name: string, from: number, to: number, capabilityType: string): ProgramSlot {
  return { id, name, from, to, kind: 'slot', capabilityType }
}

// EP4 (Jake's bar, manual Ch15–16): Programs + Program Speed.
const EP4_PROGRAMS = channel('Programs', [
  slot('none', 'No Function', 0, 9, 'NoFunction'),
  slot('switch', 'RGB colors switching', 10, 23, 'Effect'),
  slot('fade', '7 colors Fading', 54, 68, 'Effect'),
  slot('p1', 'Effect program 1', 84, 98, 'Effect'),
  slot('sound', 'Sound active mode', 249, 255, 'SoundSensitivity')
])
const EP4_SPEED = channel('Program Speed', undefined, 'slider')
// 4Bar: the program channel is named "Control / Operating Mode" and
// there is no speed channel at all.
const BAR_PROGRAMS = channel('Control / Operating Mode', [
  slot('mix', 'RGB Color Mixing', 0, 9, 'Generic'),
  slot('p1', 'Auto Program 1', 10, 29, 'Effect'),
  slot('p12', 'Auto Program 12', 230, 249, 'Effect'),
  slot('sound', 'Sound-Active mode', 250, 255, 'SoundSensitivity')
])
// Q5: the speed channel is an options list — EffectSpeed 0–250, then
// sound-active 251–255.
const Q5_PROGRAMS = channel('Auto/Sound-Active Programs', [
  slot('none', 'No function', 0, 5, 'NoFunction'),
  slot('p1', 'Auto/Sound-active program 1', 6, 40, 'Effect')
])
const Q5_SPEED = channel('Program Speed', [
  slot('speed', 'Speed, slow to fast', 0, 250, 'EffectSpeed'),
  slot('sound', 'Sound-active program', 251, 255, 'Effect')
])
// Rogue R3 Spot: "Auto programs" (31 Effect programs) + "Auto speed".
const R3_PROGRAMS = channel('Auto programs', [
  slot('p1', 'Auto program 1', 0, 7, 'Effect'),
  slot('p31', 'Auto program 31', 240, 255, 'Effect')
])
const R3_SPEED = channel('Auto speed', undefined, 'slider')

const RED = channel('red')
const GREEN = channel('green')
const BLUE = channel('blue')

describe('findAutoProgram', () => {
  it('finds the EP4 programs + speed channels', () => {
    const setup = findAutoProgram([RED, GREEN, BLUE, EP4_PROGRAMS, EP4_SPEED])
    expect(setup?.programChannel.attribute).toBe('Programs')
    expect(setup?.speedChannel?.attribute).toBe('Program Speed')
    expect(setup?.programSlots.map((s) => s.id)).toEqual(['switch', 'fade', 'p1', 'sound'])
    expect(setup?.noFunctionSlot?.id).toBe('none')
  })

  it('finds a program channel by its Effect ranges even when its name says nothing (4Bar)', () => {
    const setup = findAutoProgram([BAR_PROGRAMS])
    expect(setup?.programChannel.attribute).toBe('Control / Operating Mode')
    expect(setup?.speedChannel).toBeUndefined()
  })

  it('prefers the Auto/Program-named channel when several qualify (Q5 SMD vs Auto)', () => {
    const smd = channel('SMD Color/Program', [
      slot('red', 'Red', 6, 21, 'ColorPreset'),
      slot('p1', 'Auto-Sound-active program 1', 134, 149, 'Effect')
    ])
    const setup = findAutoProgram([smd, Q5_PROGRAMS, Q5_SPEED])
    expect(setup?.programChannel.attribute).toBe('Auto/Sound-Active Programs')
  })

  it('is undefined when no channel carries programs', () => {
    expect(findAutoProgram([RED, GREEN, BLUE])).toBeUndefined()
  })
})

describe('programSlotForValue / isNoProgramValue', () => {
  it('reads the selected program back, including switching/fading macros whose names say nothing', () => {
    const setup = findAutoProgram([EP4_PROGRAMS, EP4_SPEED])!
    expect(programSlotForValue(setup, 16)?.name).toBe('RGB colors switching')
    expect(programSlotForValue(setup, 91)?.name).toBe('Effect program 1')
    expect(programSlotForValue(setup, 250)?.name).toBe('Sound active mode')
    expect(programSlotForValue(setup, 5)).toBeUndefined()
    expect(isNoProgramValue(setup, 5)).toBe(true)
    expect(isNoProgramValue(setup, 91)).toBe(false)
  })

  it('treats the 4Bar manual-mixing range as a real option, not a program', () => {
    const setup = findAutoProgram([BAR_PROGRAMS])!
    expect(programSlotForValue(setup, 5)?.name).toBe('RGB Color Mixing')
    expect(programSlotForValue(setup, 20)?.name).toBe('Auto Program 1')
  })
})

describe('programSpeedRange', () => {
  it('spans the whole channel for a plain slider speed (EP4, R3)', () => {
    expect(programSpeedRange(findAutoProgram([EP4_PROGRAMS, EP4_SPEED])!)).toEqual({ min: 0, max: 255 })
    expect(programSpeedRange(findAutoProgram([R3_PROGRAMS, R3_SPEED])!)).toEqual({ min: 0, max: 255 })
  })

  it('spans only the EffectSpeed range for an options speed channel (Q5) — never sound-active', () => {
    expect(programSpeedRange(findAutoProgram([Q5_PROGRAMS, Q5_SPEED])!)).toEqual({ min: 0, max: 250 })
  })

  it('is undefined when the fixture has no speed channel (4Bar)', () => {
    expect(programSpeedRange(findAutoProgram([BAR_PROGRAMS])!)).toBeUndefined()
  })
})

describe('Jake’s real fixture profiles', () => {
  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url))
  function load(file: string) {
    const raw = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
    return importOflFixture(raw, { manufacturerKey: basename(dirname(file)), fixtureKey: basename(file, '.json'), preserveSource: false })
  }

  it('finds the Auto Program panel on Jake’s program fixtures, with the right speed behaviour', () => {
    const cases: { file: string; mode: number; program: string; speed: string | undefined; speedRange: { min: number; max: number } | undefined }[] = [
      { file: 'event-lighting/ep4.json', mode: 0, program: 'Programs', speed: 'Program Speed', speedRange: { min: 0, max: 255 } },
      { file: 'chauvet-dj/4bar.json', mode: 0, program: 'Control / Operating Mode', speed: undefined, speedRange: undefined },
      { file: 'chauvet-dj/fxarray-q5.json', mode: 0, program: 'Auto/Sound-Active Programs', speed: 'Program Speed', speedRange: { min: 0, max: 250 } },
      // The R3's Auto programs / Auto speed live only in its 25-channel
      // mode, not the 19-channel one.
      { file: 'chauvet-professional/rogue-r3-spot.json', mode: 1, program: 'Auto programs', speed: 'Auto speed', speedRange: { min: 0, max: 255 } }
    ]
    for (const { file, mode, program, speed, speedRange: range } of cases) {
      const channels = load(file).modes[mode].channels
      const setup = findAutoProgram(channels)
      expect(setup?.programChannel.attribute, file).toBe(program)
      expect(setup?.speedChannel?.attribute, file).toBe(speed)
      expect(programSpeedRange(setup!), file).toEqual(range)
      expect(setup!.programSlots.length, file).toBeGreaterThan(0)
    }
  })

  it('finds no Auto Program panel on the Spectra 300 (no program channel)', () => {
    const channels = load('volux/spectra-300.json').modes[0].channels
    expect(findAutoProgram(channels)).toBeUndefined()
  })
})
