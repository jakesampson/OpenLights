import type { FixtureChannel } from '@shared/types'

export type ProgramSlot = NonNullable<FixtureChannel['slots']>[number]

/**
 * Auto Program + Auto Program Speed (LightKey Guide p.314).
 *
 * These are NOT built-in LightKey properties — the guide has no chapter
 * for them. They appear only in the OSC appendix as examples of
 * *custom fixture properties* (p.314): "Beyond that you can also
 * control any custom fixture properties specific to the fixture. Use
 * the property's name as it appears in the Design view… For properties
 * with a list of options… /fixture/F6/overrides/Auto_Program
 * Program_1. For properties with a slider… /fixture/F6/overrides/
 * Auto_Program_Speed 0.7". So Auto Program is the fixture's own
 * built-in-program channel — a list of options (Guide pp.110–111:
 * click the property's button, the list appears, click an option) —
 * and Auto Program Speed is its speed slider (0–1 in LightKey).
 *
 * In OFL data a program channel is the channel whose capability ranges
 * are 'Effect' (the programs) plus a 'NoFunction' range (no program
 * running — LightKey's "No Selection", as in Jake's screenshot) and
 * usually a 'SoundSensitivity' range (sound-active mode). The speed
 * channel is the 'EffectSpeed' channel paired with it ("Program Speed",
 * "Auto speed"). Jake's fixtures, from their manuals / OFL:
 * EP4 "Programs" (13 Effect programs + Sound active) + "Program
 * Speed"; 4Bar "Control / Operating Mode" (Auto Program 1–12, no speed
 * channel); Q5 "Auto/Sound-Active Programs" (7) + "Program Speed"
 * (EffectSpeed 0–250, sound-active 251–255); Rogue R3 Spot "Auto
 * programs" (31) + "Auto speed".
 *
 * The speed slider's meaning depends on the selected program (Guide
 * p.110: a list-of-options property's slider "may not be available for
 * all options"), so the panel shows "No Selection" for the speed — as
 * in Jake's screenshot — until a program is chosen.
 */

export function isNoFunctionSlot(slot: { name: string; capabilityType?: string }): boolean {
  return slot.capabilityType === 'NoFunction' || /no function/i.test(slot.name)
}

function isEffectSlot(slot: { name: string; capabilityType?: string }): boolean {
  return slot.capabilityType === 'Effect'
}

export interface AutoProgramSetup {
  programChannel: FixtureChannel
  speedChannel?: FixtureChannel
  /** Selectable options: every range except the no-function range, which "No Selection" writes. */
  programSlots: ProgramSlot[]
  noFunctionSlot?: ProgramSlot
}

/**
 * Find the fixture's auto-program channel (and its speed channel) among
 * its channels. A channel is a program channel when it is an options
 * list with Effect ranges, or when its name is program-like and its
 * options are program-like. When several channels qualify (the Q5 has
 * "Auto/Sound-Active Programs" and "SMD Color/Program"), the one whose
 * name starts with Auto/Program wins — LightKey shows each as its own
 * property, and the card is titled "Auto Program".
 */
export function findAutoProgram(channels: FixtureChannel[]): AutoProgramSetup | undefined {
  const withSlots = channels.filter((channel) => (channel.slots?.length ?? 0) > 0)
  const isProgramChannel = (channel: FixtureChannel) =>
    (channel.slots ?? []).some(isEffectSlot) ||
    // A program-named channel whose options name a program ("Auto
    // Program 1"). The slot name has to say "program": an "Auto Focus"
    // channel also matches /auto/ but its options are focus distances,
    // not programs (Spectra 300).
    (/program|auto/i.test(channel.attribute) && (channel.slots ?? []).some((slot) => /program/i.test(slot.name)))
  const candidates = withSlots.filter(isProgramChannel)
  if (!candidates.length) return undefined
  const rank = (channel: FixtureChannel) => {
    if (/^(auto|programs?)\b/i.test(channel.attribute)) return 0
    if (/program|auto/i.test(channel.attribute)) return 1
    return 2
  }
  const programChannel = [...candidates].sort((a, b) => rank(a) - rank(b))[0]
  // The speed channel names its program ("Program Speed", "Auto speed").
  // It need not be an options list — a plain slider speed (EP4, R3)
  // has no slots — so it is searched among all channels, not just the
  // slotted ones. A fixture without one (the 4Bar) has no Speed card —
  // LightKey only shows the options the fixture supports (Guide p.99).
  const speedChannel = channels.find(
    (channel) => channel !== programChannel && /speed/i.test(channel.attribute) && /program|auto/i.test(channel.attribute)
  )
  const slots = programChannel.slots ?? []
  return {
    programChannel,
    speedChannel,
    programSlots: slots.filter((slot) => !isNoFunctionSlot(slot)),
    noFunctionSlot: slots.find(isNoFunctionSlot)
  }
}

/** The program option a raw channel value selects, if any. */
export function programSlotForValue(setup: AutoProgramSetup, value: number): ProgramSlot | undefined {
  return setup.programSlots.find((slot) => value >= slot.from && value <= slot.to)
}

/** True when the value means no program is running ("No Selection"). */
export function isNoProgramValue(setup: AutoProgramSetup, value: number): boolean {
  if (setup.noFunctionSlot && value >= setup.noFunctionSlot.from && value <= setup.noFunctionSlot.to) return true
  return programSlotForValue(setup, value) === undefined
}

/**
 * The DMX range the speed slider spans. An options speed channel (the
 * Q5's "Program Speed": EffectSpeed 0–250, sound-active 251–255) spans
 * only its EffectSpeed range, so the slider can never land on
 * sound-active; a plain slider channel (EP4, R3) spans the whole
 * channel.
 */
export function programSpeedRange(setup: AutoProgramSetup): { min: number; max: number } | undefined {
  const channel = setup.speedChannel
  if (!channel) return undefined
  const speedSlot = (channel.slots ?? []).find((slot) => slot.capabilityType === 'EffectSpeed')
  if (speedSlot) return { min: speedSlot.from, max: speedSlot.to }
  return { min: channel.min, max: channel.max }
}
