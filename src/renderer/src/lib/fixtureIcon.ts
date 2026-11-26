// Fixture icons in the Preview vary by fixture type, like LightKey
// (Guide p.32 — the icon legend: PAR, Moving head/scanner, Light bulb,
// Array of PARs, Array of moving heads, Strobe, Blinder, Panel, Fog
// machine, Switch, Laser/generic fixture, LED bar, LED matrix, LED
// strip open/closed. The wizard text on p.31 points at this legend.)
// The icon kind is resolved from the fixture's OFL categories first —
// they give a better answer than the channel profile where the two
// disagree (a wash and a PAR can share a channel profile) — then from
// the profile's legacy type, then from the fixture's own type.
import type { FixtureDef, FixtureProfile, FixtureType } from '@shared/types'
import { fixtureProfile } from '@shared/fixtureProfiles'

export type FixtureIconKind =
  | 'par'
  | 'wash'
  | 'moving-head'
  | 'bulb'
  | 'generic'
  | 'led-bar'
  | 'led-matrix'
  | 'panel'
  | 'strobe'
  | 'blinder'
  | 'fog'
  | 'switch'
  | 'led-strip-open'
  | 'led-strip-closed'

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** OFL categories kept on the imported profile — the raw OFL document is retained on `profile.ofl.source`. */
function oflCategories(profile?: FixtureProfile): string[] {
  const categories = record(profile?.ofl?.source).categories
  return Array.isArray(categories) ? categories.filter((c): c is string => typeof c === 'string') : []
}

/** Icon kind from OFL categories — the most specific answer when the profile came from OFL. */
function kindFromOflCategories(categories: string[]): FixtureIconKind | null {
  if (categories.includes('Moving Head') || categories.includes('Scanner')) return 'moving-head'
  if (categories.includes('Strobe')) return 'strobe'
  if (categories.includes('Blinder')) return 'blinder'
  if (categories.includes('Fog')) return 'fog'
  if (categories.includes('Matrix')) return 'led-matrix'
  if (categories.includes('Pixel Bar') || categories.includes('Bar')) return 'led-bar'
  if (categories.includes('Wash')) return 'wash'
  if (categories.includes('Color Changer')) return 'par'
  if (categories.includes('Dimmer')) return 'bulb'
  if (categories.includes('Laser')) return 'generic'
  if (categories.includes('Panel')) return 'panel'
  return null
}

function kindFromType(type: FixtureType | undefined): FixtureIconKind | null {
  switch (type) {
    case 'moving-head':
      return 'moving-head'
    case 'par':
      return 'par'
    case 'led-wash':
    case 'rgba-4ch':
    case 'rgbw-4ch':
      return 'wash'
    case 'dimmer':
      return 'bulb'
    case 'generic-led':
      return 'generic'
    case 'pixel-bar-17ch':
      return 'led-bar'
    default:
      return null
  }
}

/**
 * Which LightKey icon a fixture draws in the Preview. Anything the
 * mapping cannot place draws LightKey's "Laser, generic fixture"
 * square — the same fallback LightKey itself uses.
 */
export function fixtureIconKind(fixture: FixtureDef): FixtureIconKind {
  const profile = fixtureProfile(fixture)
  const base = kindFromOflCategories(oflCategories(profile)) ?? kindFromType(profile?.legacyType ?? fixture.type) ?? 'generic'
  // LED strip icon shape (LightKey Guide p.56): an LED bar drawn as a
  // strip can be a line or a ring, chosen in the Inspector; unset keeps
  // the bar icon it always had.
  if (base === 'led-bar' && fixture.ledIconShape === 'line') return 'led-strip-open'
  if (base === 'led-bar' && fixture.ledIconShape === 'ring') return 'led-strip-closed'
  return base
}

/** Round icons keep the circular selection ring; rectangular icons get a rounded-rect one. */
export function fixtureIconIsRound(kind: FixtureIconKind): boolean {
  return kind === 'par' || kind === 'wash' || kind === 'moving-head' || kind === 'bulb' || kind === 'led-strip-closed'
}

/** Half-size of the rectangular selection indicator, relative to the fixture centre. */
export function fixtureIconSelectionRect(kind: FixtureIconKind): { halfWidth: number; halfHeight: number } {
  switch (kind) {
    case 'panel':
      return { halfWidth: 8, halfHeight: 7 }
    case 'led-matrix':
      return { halfWidth: 8, halfHeight: 8 }
    case 'strobe':
      return { halfWidth: 8.5, halfHeight: 5.5 }
    case 'blinder':
      return { halfWidth: 8, halfHeight: 6.5 }
    case 'led-strip-open':
      return { halfWidth: 10.5, halfHeight: 6.5 }
    default:
      return { halfWidth: 7.5, halfHeight: 7.5 }
  }
}

/** Half-size of LightKey's selection box (Jake, 26 Nov 2026 — his
 *  LightKey screenshot): one light black opaque rounded box per
 *  selected fixture, hugging the icon only, never the beam. Round
 *  icons get a square box around the icon's r=9 surround; rectangular
 *  icons use their selection rect; an LED bar with two or more cells
 *  uses its housing (fixed 9-unit spacing, not scaled by icon size —
 *  see StagePreview), a single-cell bar its small bar. The +3 is the
 *  same padding the edit-mode handles use. */
export function lightKeySelectionBox(kind: FixtureIconKind, iconScale: number, cells = 1): { halfWidth: number; halfHeight: number } {
  if (kind === 'led-bar' && cells >= 2) return { halfWidth: ((cells - 1) * 9 + 11) / 2 + 3, halfHeight: 8 }
  if (kind === 'led-bar') return { halfWidth: 9.5 * iconScale + 3, halfHeight: 6 * iconScale + 3 }
  if (fixtureIconIsRound(kind)) return { halfWidth: 9 * iconScale + 3, halfHeight: 9 * iconScale + 3 }
  const rect = fixtureIconSelectionRect(kind)
  return { halfWidth: rect.halfWidth * iconScale + 3, halfHeight: rect.halfHeight * iconScale + 3 }
}
