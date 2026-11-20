import type { FixtureChannel } from '@shared/types'

export type ShutterSlot = NonNullable<FixtureChannel['slots']>[number]

/**
 * Shutter/Strobe (LightKey Guide pp.97–98, 114, 312–314).
 *
 * LightKey's Shutter/Strobe property is a *state*, not a raw DMX value:
 * the shutter is open or closed, or the fixture is strobing (steady,
 * synchronised, random, random synchronised, lightning) or pulsing
 * (opening, closing, alternating, burst, random variants) — the OSC
 * appendix (p.312) lists the states as `shutterState`: closed, open,
 * strobe, syncStrobe, randomStrobe, randomSyncStrobe, lightningStrobe,
 * pulseOpening, pulseClosing, pulseAlternating, burstPulse,
 * randomPulseOpening, randomPulseClosing, randomPulseAlternating,
 * randomPurstPulse [sic]. The fixture profile maps each state onto a
 * DMX range of the fixture's shutter/strobe channel.
 *
 * OpenLights stores only the raw channel value in the cue, so this
 * module recovers the state from the profile's slots (OFL capability
 * ranges): the slot containing the current value tells the state, and
 * writing a state writes a value inside that state's slot. A value
 * inside a ShutterStrobe-typed range IS the strobing output — the
 * fixture's own hardware strobes at the rate the value selects (EP4
 * manual: 10–255 = strobe 1–30 Hz; Rogue R3 Spot: 8–76 synchronised
 * strobe, 77–145 pulse strobe, 146–215 random strobe; Spectra 300:
 * five strobe effects). The speed is the position inside the active
 * slot's range — LightKey's drag-up/down on the Strobe/Pulse button
 * (p.98) moves the value through that range.
 *
 * What this module does NOT do: a software strobe. For a fixture whose
 * shutter channel has open/closed ranges but no strobe range, LightKey
 * realises strobe by opening/closing the shutter itself; OpenLights
 * has no time-varying shutter path (the output loop only runs for
 * effects/sequences, and the cue stores no strobe mode), so Strobe is
 * unavailable for such a fixture instead of faked — see NOTES.md.
 */

/** One shutter/strobe state a slot can realise. */
export type ShutterSlotKind =
  | 'open'
  | 'closed'
  | 'strobe'
  | 'syncStrobe'
  | 'randomStrobe'
  | 'randomSyncStrobe'
  | 'lightningStrobe'
  | 'pulse'
  | 'soundActive'
  /** A strobe-off / no-function range: the effect is off, so light passes. */
  | 'off'
  /** A no-function range that is not a strobe-off (no light implication). */
  | 'none'
  | 'unknown'

/**
 * Classify one slot of a shutter/strobe channel by its name, with the
 * OFL capability type as the fallback. Name order matters: "Sound-active
 * strobe" is sound, not strobe; "Pulse strobe" is a pulse style, not a
 * strobe mode; "Strobe OFF" switches the strobe effect off (light
 * passes — the open state), while a bare "Off" on a shutter channel
 * closes the shutter (Rogue R3 Spot 0–3 "Off"); an "Open" range is
 * ShutterStrobe-typed in OFL, so the type alone cannot find it — the
 * name has to. A slot with an uninformative name ("Shutter Strobe",
 * the type fallback when OFL sets no comment) strobes.
 */
export function classifyShutterSlot(slot: { name: string; capabilityType?: string }): ShutterSlotKind {
  const name = slot.name.toLowerCase()
  const type = slot.capabilityType ?? ''
  if (/sound/.test(name) || type === 'SoundSensitivity') return 'soundActive'
  if (/pulse|burst/.test(name)) return 'pulse'
  if (/lightning/.test(name)) return 'lightningStrobe'
  if (/random/.test(name) && /sync/.test(name)) return 'randomSyncStrobe'
  if (/sync/.test(name)) return 'syncStrobe'
  if (/random/.test(name)) return 'randomStrobe'
  if (/strobe/.test(name) && /\boff\b/.test(name)) return 'off'
  if (/\bopen\b/.test(name) || /^on\b/.test(name) || /\bon\b/.test(name)) return 'open'
  if (/\bclos(e|ed|ing)\b/.test(name) || /\bblackout\b/.test(name) || /\boff\b/.test(name)) return 'closed'
  if (/strobe/.test(name) || type === 'ShutterStrobe') return 'strobe'
  if (type === 'NoFunction' || /no function/.test(name)) return 'none'
  return 'unknown'
}

const STROBE_ORDER: ShutterSlotKind[] = ['strobe', 'syncStrobe', 'randomStrobe', 'randomSyncStrobe', 'lightningStrobe']

/** Guide p.98 strobe cycle order: Strobe, Synchronised, Random, Random synchronised, Lightning. */
function strobeRank(kind: ShutterSlotKind): number {
  const index = STROBE_ORDER.indexOf(kind)
  return index < 0 ? STROBE_ORDER.length : index
}

/**
 * Guide p.98 pulse cycle order: opening, closing, alternating, burst,
 * then the random variants. A bare "Pulse strobe" names no style, so it
 * sorts after the named styles rather than inventing one.
 */
function pulseRank(slot: ShutterSlot): number {
  const name = slot.name.toLowerCase()
  if (/random/.test(name)) return 4
  if (/opening/.test(name)) return 0
  if (/closing/.test(name)) return 1
  if (/alternating/.test(name)) return 2
  if (/burst/.test(name)) return 3
  return 5
}

export interface ShutterClassification {
  channel: FixtureChannel
  openSlot?: ShutterSlot
  closedSlot?: ShutterSlot
  /** Strobe-off / no-function range: the effect is off, light passes. */
  offSlot?: ShutterSlot
  noFunctionSlot?: ShutterSlot
  soundSlot?: ShutterSlot
  /** Strobe modes in the guide's cycle order (p.98). */
  strobeSlots: ShutterSlot[]
  /** Pulse styles in the guide's cycle order (p.98). */
  pulseSlots: ShutterSlot[]
  /** The panel can be shown: at least one state is mappable. */
  supported: boolean
}

/** Map a shutter/strobe channel's slots onto LightKey's shutter states. */
export function classifyShutterChannel(channel: FixtureChannel): ShutterClassification {
  const slots = channel.slots ?? []
  const byKind = new Map<ShutterSlotKind, ShutterSlot[]>()
  for (const slot of slots) {
    const kind = classifyShutterSlot(slot)
    const list = byKind.get(kind) ?? []
    list.push(slot)
    byKind.set(kind, list)
  }
  const strobeSlots = STROBE_ORDER.flatMap((kind) => byKind.get(kind) ?? [])
  const pulseSlots = [...(byKind.get('pulse') ?? [])].sort((a, b) => pulseRank(a) - pulseRank(b))
  const classification: ShutterClassification = {
    channel,
    openSlot: byKind.get('open')?.[0],
    closedSlot: byKind.get('closed')?.[0],
    offSlot: byKind.get('off')?.[0],
    noFunctionSlot: byKind.get('none')?.[0] ?? byKind.get('off')?.[0],
    soundSlot: byKind.get('soundActive')?.[0],
    strobeSlots,
    pulseSlots,
    supported: false
  }
  classification.supported = Boolean(
    classification.openSlot ?? classification.closedSlot ?? classification.offSlot ?? strobeSlots.length ?? pulseSlots.length
  )
  return classification
}

export type ShutterState = 'open' | 'closed' | 'strobe' | 'pulse' | 'sound' | 'none' | 'unknown'

export interface ShutterStateReading {
  state: ShutterState
  slot?: ShutterSlot
  kind?: ShutterSlotKind
}

function slotContaining(channel: FixtureChannel, value: number): ShutterSlot | undefined {
  return (channel.slots ?? []).find((slot) => value >= slot.from && value <= slot.to)
}

/** The shutter state a raw channel value represents (LightKey p.312). */
export function shutterStateForValue(classification: ShutterClassification, value: number): ShutterStateReading {
  const slot = slotContaining(classification.channel, value)
  if (!slot) return { state: 'unknown' }
  const kind = classifyShutterSlot(slot)
  switch (kind) {
    case 'open':
    case 'off':
      return { state: 'open', slot, kind }
    case 'closed':
      return { state: 'closed', slot, kind }
    case 'strobe':
    case 'syncStrobe':
    case 'randomStrobe':
    case 'randomSyncStrobe':
    case 'lightningStrobe':
      return { state: 'strobe', slot, kind }
    case 'pulse':
      return { state: 'pulse', slot, kind }
    case 'soundActive':
      return { state: 'sound', slot, kind }
    case 'none':
      return { state: 'none', slot, kind }
    default:
      return { state: 'unknown', slot, kind }
  }
}

function slotMidpoint(slot: ShutterSlot): number {
  return Math.round((slot.from + slot.to) / 2)
}

/** A value inside a slot at a 0–1 speed position (0 = the slot's slow end). */
export function valueAtSpeed(slot: ShutterSlot, position: number): number {
  const pos = Math.max(0, Math.min(1, position))
  return Math.round(slot.from + (slot.to - slot.from) * pos)
}

/** The speed position (0–1) a strobe/pulse value sits at inside its slot. */
export function shutterSpeedForValue(classification: ShutterClassification, value: number): { position: number; slot: ShutterSlot } | undefined {
  const reading = shutterStateForValue(classification, value)
  if ((reading.state !== 'strobe' && reading.state !== 'pulse') || !reading.slot) return undefined
  const slot = reading.slot
  if (slot.to <= slot.from) return { position: 0.5, slot }
  return { position: (value - slot.from) / (slot.to - slot.from), slot }
}

/**
 * The DMX value to write for a shutter state. Open is the open range,
 * falling back to the strobe-off / no-function range (strobe off means
 * the light passes). Closed needs a closed range — a fixture without
 * one (EP4, Spectra 300) has no Closed to write, so this returns
 * undefined and the panel disables Closed instead of faking it.
 * Strobe / Pulse take the mode index in the guide's cycle order and an
 * optional speed position inside that mode's range (default 0.5).
 */
export function shutterValueForState(
  classification: ShutterClassification,
  state: 'open' | 'closed' | 'strobe' | 'pulse',
  options: { modeIndex?: number; speed?: number } = {}
): number | undefined {
  switch (state) {
    case 'open': {
      const slot = classification.openSlot ?? classification.offSlot ?? classification.noFunctionSlot
      return slot ? slotMidpoint(slot) : undefined
    }
    case 'closed':
      return classification.closedSlot ? slotMidpoint(classification.closedSlot) : undefined
    case 'strobe': {
      const slots = classification.strobeSlots
      if (!slots.length) return undefined
      const slot = slots[(options.modeIndex ?? 0) % slots.length]
      return valueAtSpeed(slot, options.speed ?? 0.5)
    }
    case 'pulse': {
      const slots = classification.pulseSlots
      if (!slots.length) return undefined
      const slot = slots[(options.modeIndex ?? 0) % slots.length]
      return valueAtSpeed(slot, options.speed ?? 0.5)
    }
  }
}

/**
 * The fixture's shutter/strobe channel, if it has one with mappable
 * ranges. A fixture can carry several strobe channels (the Q5 has one
 * per LED plus a master); the property is the one named Shutter/Strobe
 * — an exact 'shutter'/'strobe' attribute first, then a strobe channel
 * with no LED number in its name (the master), then the first in
 * channel order. A slot-less channel (the built-in moving head's raw
 * strobe byte) has no ranges to map, so it is not the property — it
 * stays a raw fader.
 */
export function findShutterChannel(channels: FixtureChannel[]): ShutterClassification | undefined {
  const candidates = channels
    .filter((channel) => /shutter|strobe/i.test(channel.attribute) && (channel.slots?.length ?? 0) > 0)
    .map((channel) => classifyShutterChannel(channel))
    .filter((classification) => classification.supported)
  if (!candidates.length) return undefined
  // The property is the channel named Shutter/Strobe — an exact
  // 'shutter'/'strobe' attribute first, then a channel that can actually
  // be opened (it has an open, strobe-off or no-function range: the Q5's
  // master "Quad LED Strobe" has a 0–0 No function range, while its
  // "SMD Strobe" strobes at every value and so cannot be opened), then
  // a strobe channel with no LED number in its name (the master), then
  // the first in channel order.
  const rank = (classification: ShutterClassification) => {
    const attribute = classification.channel.attribute.toLowerCase()
    if (attribute === 'shutter' || attribute === 'strobe') return 0
    const canOpen = classification.openSlot ?? classification.offSlot ?? classification.noFunctionSlot ? 0 : 5
    return 10 + canOpen + (/\d/.test(attribute) ? 1 : 0)
  }
  return [...candidates].sort((a, b) => rank(a) - rank(b))[0]
}
