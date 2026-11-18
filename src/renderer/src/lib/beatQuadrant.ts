// LightKey-style quadrant beat indicator for the BPM / tap-tempo box
// (Jake's 18 Nov 2026 screenshots 9.56.45 / 9.58.58): the BPM box is
// split into four quadrants and one quadrant highlights at a time,
// advancing clockwise on every 1/4 beat — top-left, top-right,
// bottom-right, bottom-left, then repeats. Pure functions so the
// order and timing are unit-testable without a timer.

export const BEAT_QUADRANTS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const
export type BeatQuadrant = (typeof BEAT_QUADRANTS)[number]

/** Milliseconds per quarter beat at the given tempo, or null when there is no usable tempo. */
export function quarterBeatMs(bpm: number): number | null {
  if (!Number.isFinite(bpm) || bpm <= 0) return null
  return 60000 / bpm / 4
}

/** Which quadrant is lit `elapsedMs` after the beat clock started, or null with no usable tempo. */
export function beatQuadrantAt(elapsedMs: number, bpm: number): BeatQuadrant | null {
  const quarter = quarterBeatMs(bpm)
  if (quarter === null || elapsedMs < 0) return null
  return BEAT_QUADRANTS[Math.floor(elapsedMs / quarter) % BEAT_QUADRANTS.length]
}

/** The next quadrant clockwise after `current` (wraps bottom-left back to top-left). */
export function nextBeatQuadrant(current: BeatQuadrant): BeatQuadrant {
  return BEAT_QUADRANTS[(BEAT_QUADRANTS.indexOf(current) + 1) % BEAT_QUADRANTS.length]
}
