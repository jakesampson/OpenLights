import { fixtureBeams, fixtureChannelMap } from '@shared/fixtureProfiles'
import type { FixtureDef } from '@shared/types'
import { channelToDegrees, compassToPreviewDirection, panTiltRange } from './calibration'
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
 * full 64. widthFactor scales the cone widths for Fixture Options'
 * Beam angle (Guide p.62).
 */
export function cellBeamGeometry(opacity: number, widthFactor = 1) {
  const op = Math.max(0, Math.min(1, opacity))
  const length = CELL_BEAM_FULL_LENGTH * op
  const nearHalf = 3 * widthFactor
  const farHalf = nearHalf + 27 * (length / SINGLE_BEAM_FULL_LENGTH) * widthFactor
  return { length, nearHalf, farHalf }
}

/** Whether the fixture's colour can be changed through DMX (RGB/CMY
 *  mixing channels). Beam Color… (Guide p.61) is only for fixtures
 *  without it — a fixed colour that can't be changed through DMX. */
export function fixtureHasDmxColourControl(fixture: FixtureDef): boolean {
  const map = fixtureChannelMap(fixture)
  return ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'].some((attribute) => attribute in map)
}

/** The beam's drawn direction and foreshortening for one fixture. */
export interface PreviewBeamVector {
  /** Preview rotation (clockwise from down) the beam points in. */
  direction: number
  /** 0..1 — how much of the full beam length the beam shows (1 = full). */
  lengthFactor: number
}

/**
 * Where a moving head's beam points, from its live pan/tilt (LightKey
 * Guide p.91, Position control, and p.60, Perspective). The beam is a
 * point in a circle around the fixture: tilt is the polar angle from
 * the perspective direction — the direction the beam points at the
 * centre of the tilt range (down for a ceiling-hung fixture, up for a
 * floor fixture, left/right, or towards the viewer for parallel) — and
 * pan is the azimuth around it, measured from the home direction. The
 * tip is L·(sin τ·(cos φ·H + sin φ·P) + cos τ·D), where τ is the tilt
 * offset from centre, φ the pan offset from centre, H the
 * home-direction unit vector, P the same vector rotated 90°
 * counterclockwise on the canvas, and D the perspective unit vector
 * (zero for parallel). Pan therefore moves the beam sideways (towards
 * P) and tilt moves it from the perspective direction towards home —
 * the same mapping as the Design POSITION pad — so a movement effect
 * traces its path on the Preview at every tilt value, including the
 * centre.
 *
 * Directions are measured clockwise from down, the same convention
 * the stored home direction uses (compassToPreviewDirection) and the
 * SVG rotate() in StagePreview draws with — the beam polygon points
 * down at 0°. P is H rotated 90° counterclockwise on screen, so as
 * pan increases the beam turns the same way as the Rotation dial
 * arrow (Guide p.59: "the arrow should follow the movement of the
 * light beam"). The earlier model had H and the returned direction in
 * the opposite (counterclockwise-from-down) convention: the two
 * mirrors cancelled at the home position, so home beams drew
 * correctly, but away from home the drawn beam was the mirror image
 * of the computed tip — during the Rotation sweep it turned clockwise
 * while the dial arrow turned counterclockwise (Jake, 26 Nov 2026).
 *
 * The earlier model had no P term (the tip was a combination of H and
 * D only), so when H and D were near-parallel — the usual calibrated
 * case — the beam could only travel along one line: pan changed the
 * length but never the direction (Jake, 25 Nov 2026: "it just seems
 * to go up and down, no side to side action"). The guide's own
 * example still falls out of this model: pan −60°, tilt +45° and pan
 * +120°, tilt −45° give the same tip, as LightKey says they must
 * (p.91) — the two sign flips cancel. At the home position (tilt 90°)
 * the beam points in the home direction at full length; at the centre
 * of the tilt range it points in the perspective direction at full
 * length (a dot for parallel). One measure-zero case stays: at the
 * exact centre of the tilt range the beam points along the pan axis,
 * so pan has no visible effect at that one instant — the same as
 * LightKey's position-control circle, where the centre point is
 * pan-independent (p.91); a movement effect passes through it and
 * keeps moving.
 *
 * The frame's pan/tilt are used exactly as transmitted — they are
 * already clamped to the calibration limits and mirrored for a
 * reversed yoke (applyCalibrationOutput, output layer). A fixture
 * with no pan/tilt channels keeps its stored home direction at full
 * length, as before; an uncalibrated moving head takes its
 * perspective from its canvas position (truss fixtures aim down,
 * floor fixtures aim up), which is the same fallback the stored
 * home direction already used. An explicit 'down' perspective always
 * points down at tilt centre — the canvas-position heuristic applies
 * only when no perspective was picked.
 */
/**
 * Live Home-direction preview while the Beam Direction dialog is open
 * (Jake, 26 Nov 2026): dragging the Home arrow should move the beam in
 * the Preview behind the dialog at once, not only after Done. The dialog
 * holds the draft in local state and mirrors it here; the stored home
 * direction is untouched until Done writes it, and the dialog clears
 * the preview when it closes or leaves the Home step — so an unsaved
 * draft (Esc closes without saving) never sticks, and the beam goes
 * back to the stored direction.
 */
let calibrationHomePreview: { fixtureIds: ReadonlySet<string>; compassDegrees: number } | null = null
export function setCalibrationHomePreview(fixtureIds: string[] | null, compassDegrees: number): void {
  calibrationHomePreview = fixtureIds === null ? null : { fixtureIds: new Set(fixtureIds), compassDegrees }
}

/**
 * Last good beam direction per fixture, for the projection singularity
 * below: when the projected tip collapses toward zero the atan2 angle
 * is noise and the drawn beam flips wildly (measured 26 Nov 2026: a
 * 151.6° flip in one 100ms step, twice per Figure Eight cycle). While
 * the tip is near zero the beam is a dot facing the viewer anyway, so
 * the direction it holds is invisible — it just must not flip. Tests
 * reset it with resetBeamDirectionHold().
 */
const lastBeamDirection = new Map<string, number>()
/** Projected tip length below this holds the last direction (drawn
 *  length under ~18 units at full brightness). */
const SINGULARITY_LEN = 0.12
export function resetBeamDirectionHold(): void {
  lastBeamDirection.clear()
}

export function previewBeamVector(fixture: FixtureDef, values: Record<string, number>, position: { x: number; y: number }): PreviewBeamVector {
  const previewDirection = calibrationHomePreview?.fixtureIds.has(fixture.id)
    ? compassToPreviewDirection(calibrationHomePreview.compassDegrees)
    : fixture.previewBeam?.direction
  const homeDirection = typeof previewDirection === 'number' && Number.isFinite(previewDirection) ? previewDirection : position.y > 200 ? 180 : 0
  const hasPan = typeof values.pan === 'number'
  const hasTilt = typeof values.tilt === 'number'
  if (!hasPan && !hasTilt) return { direction: homeDirection, lengthFactor: 1 }
  const range = panTiltRange(fixture)
  const phi = hasPan ? channelToDegrees(range.pan, values.pan as number) : 0
  const tau = hasTilt ? channelToDegrees(range.tilt, values.tilt as number) : 0
  const homeRad = (homeDirection * Math.PI) / 180
  // H in the clockwise-from-down convention (0 = down, 90 = left,
  // 180 = up, 270 = right), matching the stored home direction.
  const hx = -Math.sin(homeRad), hy = Math.cos(homeRad)
  // P is H rotated 90° counterclockwise on the canvas: the sideways
  // direction pan moves the beam towards, so the beam turns the same
  // way as the Rotation dial arrow as pan increases.
  const px = Math.cos(homeRad), py = Math.sin(homeRad)
  const perspective = fixture.calibration?.perspective
  let dx = 0, dy = 0
  if (perspective === 'left') dx = -1
  else if (perspective === 'right') dx = 1
  else if (perspective === 'up') dy = -1
  else if (perspective === 'down') dy = 1
  else if (perspective === 'parallel') { dx = 0; dy = 0 }
  else dy = position.y > 200 ? -1 : 1 // unset: truss aims down, floor aims up
  const tauRad = (tau * Math.PI) / 180, phiRad = (phi * Math.PI) / 180
  const s = Math.sin(tauRad), c = Math.cos(tauRad)
  const tx = s * (Math.cos(phiRad) * hx + Math.sin(phiRad) * px) + c * dx
  const ty = s * (Math.cos(phiRad) * hy + Math.sin(phiRad) * py) + c * dy
  const len = Math.hypot(tx, ty)
  if (len < 1e-6) return { direction: lastBeamDirection.get(fixture.id) ?? homeDirection, lengthFactor: 0 }
  // Near the singularity the tip is a dot facing the viewer — its
  // atan2 angle is noise, so hold the last good direction instead of
  // letting the drawn beam flip (Jake, 26 Nov 2026).
  if (len < SINGULARITY_LEN) {
    return { direction: lastBeamDirection.get(fixture.id) ?? (Math.atan2(-tx, ty) * 180 / Math.PI + 360) % 360, lengthFactor: Math.min(1, len) }
  }
  // Clockwise from down: atan2(-tx, ty) is 0 for down, 90 for left,
  // 180 for up, 270 for right — the convention StagePreview's
  // rotate() draws with.
  const direction = (Math.atan2(-tx, ty) * 180 / Math.PI + 360) % 360
  lastBeamDirection.set(fixture.id, direction)
  return { direction, lengthFactor: Math.min(1, len) }
}

/** Preview artwork settings never change transmitted channel values. */
export function previewBeamAppearance(fixture: FixtureDef, position: { x: number; y: number }, liveColor: string, values: Record<string, number> = {}) {
  const vector = previewBeamVector(fixture, values, position)
  // Beam Color… (Guide p.61): for fixtures with a fixed colour that
  // can't be changed through DMX (e.g. a PAR with a colour gel), the
  // stored colour is the virtual beam colour — and the dot inside the
  // fixture icon. A fixture with DMX colour control always shows its
  // live colour; the stored colour is ignored for it. (The 19 Nov 2026
  // removal took out the manual input that wrote this override for
  // every fixture — this restores it gated on fixture type, as the
  // guide has it.)
  const color = !fixtureHasDmxColourControl(fixture) && typeof fixture.previewBeam?.color === 'string' && fixture.previewBeam.color ? fixture.previewBeam.color : liveColor
  // Beam angle (Fixture Options, Guide p.62): the beam's width in the
  // Preview; empty = the default cone (near half-width 7 → far 34 over
  // 146, i.e. a ~21° full angle). The factor scales the cone widths
  // relative to that default.
  const angle = typeof fixture.previewBeam?.beamAngle === 'number' && Number.isFinite(fixture.previewBeam.beamAngle) ? fixture.previewBeam.beamAngle : 21
  const widthFactor = Math.max(0.25, Math.min(4, Math.tan(((angle / 2) * Math.PI) / 180) / Math.tan(((21 / 2) * Math.PI) / 180)))
  return { direction: vector.direction, lengthFactor: vector.lengthFactor, color, widthFactor }
}

/** Decode the actual 1-based universe values for preview, retaining dimmer gel colour. */
export function previewFixtureValues(fixture: FixtureDef, channels: number[], cueValues?: Record<string, number>): Record<string, number> {
  const values: Record<string, number> = fixture.type === 'dimmer' ? { ...cueValues } : {}
  for (const [attribute, offset] of Object.entries(fixtureChannelMap(fixture))) {
    if (offset < fixture.channels) values[attribute] = channels[fixture.channelStart + offset - 1] ?? 0
  }
  return values
}
