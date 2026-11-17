/** Beat phase in the range 0..<1 at a millisecond timestamp. */
export function beatPhase(nowMs: number, bpm: number, anchorMs = 0): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0
  const beats = (nowMs - anchorMs) * bpm / 60000
  return ((beats % 1) + 1) % 1
}

/** Stateful MIDI Beat Clock reader. MIDI clock sends exactly 24 pulses per quarter note. */
export class MidiBeatClock {
  private pulses: number[] = []

  push(timestampMs: number): number | null {
    if (!Number.isFinite(timestampMs)) return null
    const last = this.pulses.at(-1)
    if (last !== undefined && (timestampMs <= last || timestampMs - last > 2000)) this.pulses = []
    this.pulses.push(timestampMs)
    this.pulses = this.pulses.slice(-97)
    if (this.pulses.length < 25) return null
    const pulseIntervals = this.pulses.length - 1
    const elapsed = this.pulses.at(-1)! - this.pulses[0]
    return elapsed > 0 ? 60000 * pulseIntervals / (elapsed * 24) : null
  }
}
