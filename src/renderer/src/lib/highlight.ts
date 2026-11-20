import { fixtureMode } from '@shared/fixtureProfiles'
import type { FixtureDef } from '@shared/types'

/**
 * Highlight Mode (LightKey Guide pp.32, 64 — "Locate fixtures"): when
 * enabled, the selected fixture(s) light up and everything else goes
 * dark. A highlighted fixture outputs its profile highlight values
 * (FixtureChannel.highlightValue — intensity and colours at 255, pan/tilt
 * centred at 128, everything else 0), so it lights up white at full
 * pointing at its home position; every other fixture's channels are
 * zeroed. This is a pure output transform — nothing in the show changes,
 * so turning Highlight Mode off returns the rig to exactly what it was
 * doing. Disabled fixtures stay dark even when selected.
 */
export function applyHighlight(
  patch: Record<number, number>,
  fixtures: FixtureDef[],
  highlightedIds: Iterable<string>
): Record<number, number> {
  const highlighted = new Set(highlightedIds)
  const result = { ...patch }
  for (const fixture of fixtures) {
    const channels = Array.from({ length: fixture.channels }, (_, i) => fixture.channelStart + i)
    if (!highlighted.has(fixture.id) || fixture.disabled) {
      for (const channel of channels) result[channel] = 0
      continue
    }
    const mode = fixtureMode(fixture)
    const listed = new Set<number>()
    for (const channel of mode?.channels ?? []) {
      result[fixture.channelStart + channel.number] = channel.highlightValue
      listed.add(channel.number)
    }
    // Channels the profile does not list (a footprint wider than its
    // mode) have no highlight value — they go dark with the rest.
    for (let i = 0; i < fixture.channels; i++) if (!listed.has(i)) result[fixture.channelStart + i] = 0
  }
  return result
}
