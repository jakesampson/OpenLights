import { fixtureBeams, fixtureChannelMap } from '@shared/fixtureProfiles'
import type { FixtureDef } from '@shared/types'
import { FIXTURE_ATTRIBUTE_MAP } from './automationRuntime'

function clamp(v: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, v))
}

/** Full length of a single fixture's beam in Preview units (StagePreview). */
export const SINGLE_BEAM_FULL_LENGTH = 146
/**
 * Full length of one cell's beam in Preview units. A multipart fixture's
 * cells sit 9 units apart, so full-length (146) beams would merge into
 * one wide wash and the cells would be indistinguishable — 64 keeps
 * each beam a short finger off its own cell while still reading as a
 * beam, at a bit under half the single-beam length. See NOTES.md.
 */
export const CELL_BEAM_FULL_LENGTH = 64

export interface PreviewCellBeam {
  id: string
  name: string
  /** The cell's own mixed colour (master dimmer applied), like fixtureColor. */
  color: string
  /** The fixture's dimmer 0..1 when the cell carries any light, else 0
   *  (a dark cell draws no beam): the beam length follows the dimmer,
   *  not the cell's own colour level. */
  opacity: number
}

const CELL_COLOURS = ['red', 'green', 'blue', 'white', 'amber', 'uv', 'cyan', 'magenta', 'yellow'] as const

/**
 * One beam per cell (LightKey Guide p.57, §8 p.119 — fixture cells are
 * "beams"). Each cell's colour and brightness come from that cell's own
 * channels (beam.properties maps colour names to the cell's channel
 * attributes, e.g. cell 2's red is `red2` / `red 2`); a cell whose
 * channels carry no data falls back to the fixture's colour/brightness.
 * Single-pod fixtures have no beams and return [] — they keep the
 * fixture's single beam. The colour mixing mirrors fixtureColor in
 * StagePreview (white adds to all three, amber adds to red and 45% to
 * green; cyan/magenta/yellow — which fixtureColor ignores — add
 * additively, so a CMY-only cell still shows a colour).
 *
 * A cell's opacity is the fixture's dimmer (the fallback opacity the
 * Preview passes in) whenever the cell carries any light at all — so
 * a colour-only change never shrinks a lit cell's beam, the same rule
 * as the single beam (Jake, 24 Nov 2026): a red→blue crossfade
 * passes through purple at half height per channel, and reading the
 * cell's own max as its brightness halved the beam mid-transition.
 * A cell with no light at all still draws no beam, so a chase across
 * the cells shows only the lit cells.
 */
export function previewCellBeams(fixture: FixtureDef, values: Record<string, number>, fallback: { color: string; opacity: number }): PreviewCellBeam[] {
  const beams = fixtureBeams(fixture)
  if (beams.length < 2) return []
  const dim = clamp(values.intensity ?? 255, 0, 255) / 255
  return beams.map((beam) => {
    const channel = (name: string): number | undefined => {
      const key = beam.properties[name]
      return key !== undefined && typeof values[key] === 'number' ? values[key] : undefined
    }
    if (!CELL_COLOURS.some((name) => channel(name) !== undefined)) {
      return { id: beam.id, name: beam.name, color: fallback.color, opacity: fallback.opacity }
    }
    const r = Math.round(clamp((channel('red') ?? 0) + (channel('white') ?? 0) + (channel('amber') ?? 0) + (channel('magenta') ?? 0) + (channel('yellow') ?? 0)) * dim)
    const g = Math.round(clamp((channel('green') ?? 0) + (channel('white') ?? 0) + (channel('amber') ?? 0) * 0.45 + (channel('cyan') ?? 0) + (channel('yellow') ?? 0)) * dim)
    const b = Math.round(clamp((channel('blue') ?? 0) + (channel('white') ?? 0) + (channel('cyan') ?? 0) + (channel('magenta') ?? 0)) * dim)
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    return { id: beam.id, name: beam.name, color: `#${hex(r)}${hex(g)}${hex(b)}`, opacity: Math.max(r, g, b) > 0 ? fallback.opacity : 0 }
  })
}

/**
 * A cell beam's drawn shape at a given effective brightness. Same cone
 * angle as the single beam (near half-width 7 → far 34 over 146, i.e.
 * +27 per 146 of length), starting from the cell's own width: the cell
 * rects are 7 wide, so the near half-width is 3. Length scales with
 * brightness exactly like the single beam — 0 is no beam, 1 is the
 * full 64.
 */
export function cellBeamGeometry(opacity: number) {
  const op = Math.max(0, Math.min(1, opacity))
  const length = CELL_BEAM_FULL_LENGTH * op
  const nearHalf = 3
  const farHalf = nearHalf + 27 * (length / SINGLE_BEAM_FULL_LENGTH)
  return { length, nearHalf, farHalf }
}

/** Preview artwork settings never change transmitted channel values. */
export function previewBeamAppearance(fixture: FixtureDef, position: { x: number; y: number }, liveColor: string) {
  const direction = fixture.previewBeam?.direction
  // The beam is always drawn in the fixture's own live colour. There is
  // no stored beam-colour override any more: the manual "Beam colour"
  // input, the "Auto beam" reset and the "Beam Color…" dialog were all
  // removed from Fixture Properties (Jake, 19 Nov 2026) — they all wrote
  // the same previewBeam.color override, and a colour fixture already
  // shows its live colour. A monochrome fixture's beam colour, if Jake
  // ever wants it, is a separate feature gated on fixture type, not a
  // stored override — nothing here reads one.
  return { direction: typeof direction === 'number' && Number.isFinite(direction) ? direction : position.y > 200 ? 180 : 0, color: liveColor }
}

/** Decode the actual 1-based universe values for preview, retaining dimmer gel colour. */
export function previewFixtureValues(fixture: FixtureDef, channels: number[], cueValues?: Record<string, number>): Record<string, number> {
  const values: Record<string, number> = fixture.type === 'dimmer' ? { ...cueValues } : {}
  for (const [attribute, offset] of Object.entries(fixtureChannelMap(fixture))) {
    if (offset < fixture.channels) values[attribute] = channels[fixture.channelStart + offset - 1] ?? 0
  }
  return values
}
