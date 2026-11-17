export function calculateTapTempo(taps: number[], now: number): { taps: number[]; bpm: number | null } {
  const previous = taps.filter(Number.isFinite)
  const last = previous[previous.length - 1]
  const next = last !== undefined && now > last && now - last <= 2000
    ? [...previous, now].slice(-5)
    : [now]
  if (next.length < 2) return { taps: next, bpm: null }
  return { taps: next, bpm: 60000 * (next.length - 1) / (next[next.length - 1] - next[0]) }
}
