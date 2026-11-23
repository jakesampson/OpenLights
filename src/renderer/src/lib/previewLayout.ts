import type { FixtureDef } from '@shared/types'

export interface Pos { x: number; y: number }

/** Preview world size (StagePreview's viewBox is 800×340). */
export const PREVIEW_WIDTH = 800
export const PREVIEW_HEIGHT = 340

// Landing layout, measured from LightKey's "Setting Up a Project" video
// (frames t_205/f_014, 3:15–3:25 — the moment the wizard's Preview step
// opens): the patched fixtures appear in straight horizontal rows, one
// row per patch batch, icons evenly spaced, the widest row centred on
// the Preview and shorter rows left-aligned to its left edge — a fixed
// column grid. Measured: icon spacing ≈121.5px on a 1280-wide Preview
// (≈9.5% of width), row gap ≈107px on a 720-high Preview (≈15% of
// height). Guide p.31 only says the Preview "shows a number of icons
// representing fixtures" and to drag them into place; the grid itself
// comes from the video frames.
export const LANDING_H_GAP = 76 // 9.5% of 800
export const LANDING_V_GAP = 50 // ~15% of 340
/** Icons per row. No wrap is visible in the video (widest row seen is 10
 * in the newer review video); 10 is an assumption, stated in NOTES.md. */
export const LANDING_MAX_PER_ROW = 10
/** Piece 1's fan-out, kept only as the legacy fallback for shows patched
 * before per-instance positions existed: instances fanned 28px right of
 * the one stored position. New patches always store real positions. */
export const LEGACY_INSTANCE_STEP = 28

export function instanceKey(fixtureId: string, instance: number): string {
  return `${fixtureId}:${instance}`
}

/**
 * Demo-arc fallback positions for fixtures with no stored Preview
 * position (moved from StagePreview so the NDI Ambience mapping resolves
 * the same positions the Preview itself shows): overhead truss arc for
 * the first six, remaining fixtures on the stage deck as up-lights.
 */
export function demoArcPositions(count: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  const overhead = Math.min(count, 6)
  // Spread fixtures evenly along the full truss arc (x 40..760), following
  // the quadratic curve y = 80 - 84·t·(1 - t) so they sit on the truss.
  for (let i = 0; i < overhead; i++) {
    const t = (i + 0.5) / overhead
    const x = 40 + 720 * t
    const y = 80 - 84 * t * (1 - t)
    positions.push({ x, y })
  }
  // Remaining fixtures go on the stage deck as up-lights.
  const floorCount = Math.max(0, count - overhead)
  for (let i = 0; i < floorCount; i++) {
    const t = (i + 0.5) / floorCount
    positions.push({ x: 40 + 720 * t, y: 300 })
  }
  return positions.slice(0, count)
}

/**
 * A fixture's per-instance Preview positions, in instance order. Stored
 * `previewPositions` win; a fixture with only the old single
 * `previewPosition` keeps Piece 1's layout (instance 0 on it, later
 * instances fanned 28px right) so old shows do not jump; a fixture with
 * neither yields nulls and the caller falls back to the demo-arc layout.
 */
export function instancePositions(fixture: FixtureDef): Array<Pos | null> {
  const count = fixture.count ?? 1
  const stored = fixture.previewPositions ?? []
  return Array.from({ length: count }, (_, i) => {
    if (stored[i]) return { ...stored[i] }
    if (!fixture.previewPosition) return null
    return i === 0
      ? { ...fixture.previewPosition }
      : { x: fixture.previewPosition.x + i * LEGACY_INSTANCE_STEP, y: fixture.previewPosition.y }
  })
}

/**
 * Where a newly patched batch lands on the Preview (LightKey video,
 * 3:15–3:25): straight rows, one per patch batch, up to 10 icons per row.
 * The batch's rows go ABOVE the fixtures already on the canvas — in the
 * video the first-patched moving heads sit on the bottom row and the
 * later-patched pars above them — left-aligned to the existing block's
 * left edge (the video's column grid). On an empty canvas the batch is
 * centred as a block (widest row centred on x=400, rows centred on
 * y=170). If there is no room above, the batch goes below the lowest row
 * instead. Returns one position per instance, keyed by fixture id.
 */
export function landingPositions(existing: FixtureDef[], batch: FixtureDef[]): Record<string, Pos[]> {
  const instances: { fixture: FixtureDef; index: number }[] = []
  for (const fixture of batch) {
    const count = fixture.count ?? 1
    for (let index = 0; index < count; index++) instances.push({ fixture, index })
  }
  if (instances.length === 0) return {}
  const rows: Array<Array<{ fixture: FixtureDef; index: number }>> = []
  for (let i = 0; i < instances.length; i += LANDING_MAX_PER_ROW) rows.push(instances.slice(i, i + LANDING_MAX_PER_ROW))
  const widest = Math.max(...rows.map((row) => row.length))

  const onCanvas = existing.filter((f) => !f.inStorage)
  const placed: Pos[] = onCanvas.flatMap((f) => instancePositions(f).filter((p): p is Pos => p !== null))
  const clampX = (x: number) => Math.max(0, Math.min(PREVIEW_WIDTH, Math.round(x)))
  const clampY = (y: number) => Math.max(0, Math.min(PREVIEW_HEIGHT, Math.round(y)))
  // Left edge: the existing block's left edge (the video's column grid),
  // or the batch's widest row centred on x=400 on an empty canvas.
  const left = placed.length
    ? Math.min(...placed.map((p) => p.x))
    : Math.round(PREVIEW_WIDTH / 2 - ((widest - 1) * LANDING_H_GAP) / 2)
  // Top row: above the existing rows, or the block vertically centred.
  let top = placed.length
    ? Math.min(...placed.map((p) => p.y)) - LANDING_V_GAP
    : Math.round(PREVIEW_HEIGHT / 2 - ((rows.length - 1) * LANDING_V_GAP) / 2)
  if (placed.length && top < 16) top = Math.max(...placed.map((p) => p.y)) + LANDING_V_GAP

  const result: Record<string, Pos[]> = {}
  for (const fixture of batch) result[fixture.id] = []
  rows.forEach((row, rowIndex) => {
    const y = clampY(top + rowIndex * LANDING_V_GAP)
    row.forEach((item, column) => {
      result[item.fixture.id][item.index] = { x: clampX(left + column * LANDING_H_GAP), y }
    })
  })
  return result
}
