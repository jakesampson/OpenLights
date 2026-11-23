/**
 * NDI Ambience — renderer side. Holds the latest sampled edge colours
 * from the NDI worker, maps them onto fixtures through the placed screen,
 * and drives the output layer (see output.ts). Ambience is an explicit
 * on/off live mode: while on, the mapped fixtures take the screen-edge
 * colours; turning it off (or closing the panel) hands the rig back to
 * cues, presets and Live exactly as they were. It never touches cue or
 * preset state.
 */
import type { FixtureDef, StageObject } from '@shared/types'
import { fixtureChannelMap } from '@shared/fixtureProfiles'
import {
  NDI_REGION_COUNT,
  findNdiScreen,
  mapRegionsToFixtures,
  screenRect,
  screenRegionAnchors,
  type NdiRegionColour,
  type NdiRgb
} from '@shared/ndiAmbience'
import { demoArcPositions, instancePositions } from './previewLayout'
import { computeCueChannels } from './automationRuntime'
import { clearAmbienceOutput, setAmbienceOutput } from './output'

export interface NdiAmbienceStats {
  /** Fixtures following a screen-edge colour. */
  mapped: number
  /** Fixtures with no colour to show (no RGB channels — CMY and
   * white-only fixtures are not driven by this first attempt). */
  colourless: number
  /** Disabled fixtures (already dark; the output layer zeroes them). */
  disabled: number
  /** Fixtures in storage, not on the Preview. */
  inStorage: number
}

const EMPTY_STATS: NdiAmbienceStats = { mapped: 0, colourless: 0, disabled: 0, inStorage: 0 }

let active = false
let fixtures: FixtureDef[] = []
let screen: StageObject | null = null
let master = 255
let regions: NdiRegionColour[] | null = null
let lastStats: NdiAmbienceStats = { ...EMPTY_STATS }
/** Last non-null colour per region — a region with no usable colour
 * (plain white slide edge) holds its previous colour instead of
 * jumping its fixtures to black. */
let lastColourByRegion: Array<NdiRgb | null> = Array.from({ length: NDI_REGION_COUNT }, () => null)

/** Colour-transition time between sampled values (Jake, 23 Nov 2026):
 * a dramatic slide change glides instead of jumping. Default 500 ms,
 * adjustable in the panel, 0 = instant (the old behaviour). */
export const NDI_DEFAULT_TRANSITION_MS = 500
export const NDI_TRANSITION_MIN_MS = 0
export const NDI_TRANSITION_MAX_MS = 2000
let transitionMs = NDI_DEFAULT_TRANSITION_MS
/** The ambience patch currently driving the output — the glide starts
 * from here, so a new sample mid-glide retargets without jumping. */
let currentPatch: Record<number, number> = {}
let glideFrom: Record<number, number> = {}
let glideTarget: Record<number, number> = {}
let glideStartedAt = 0
let glideFrame: number | null = null

export function getAmbienceTransitionMs(): number {
  return transitionMs
}

/** Clamped to 0–2000 ms; 0 means new samples apply instantly. */
export function setAmbienceTransitionMs(ms: number) {
  transitionMs = Math.max(NDI_TRANSITION_MIN_MS, Math.min(NDI_TRANSITION_MAX_MS, Math.round(ms)))
}

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

function patchesEqual(a: Record<number, number>, b: Record<number, number>): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((key) => a[Number(key)] === b[Number(key)])
}

/**
 * Interpolate one ambience patch toward another, channel by channel.
 * Pure — exported for tests. Channels in `to` glide from their `from`
 * value (0 when newly mapped — they fade in); channels only in `from`
 * are dropped, so they hand back to the underlying look immediately
 * instead of dipping toward zero first.
 */
export function interpolateAmbiencePatch(
  from: Record<number, number>,
  to: Record<number, number>,
  progress: number
): Record<number, number> {
  const t = Math.max(0, Math.min(1, progress))
  const out: Record<number, number> = {}
  for (const key of Object.keys(to)) {
    const channel = Number(key)
    const a = from[channel] ?? 0
    out[channel] = Math.round(a + (to[channel] - a) * t)
  }
  return out
}

function cancelGlide() {
  if (glideFrame !== null) {
    cancelAnimationFrame(glideFrame)
    glideFrame = null
  }
}

const glideTick = (now: number) => {
  const t = Math.min(1, (now - glideStartedAt) / transitionMs)
  currentPatch = interpolateAmbiencePatch(glideFrom, glideTarget, smoothstep(t))
  setAmbienceOutput(currentPatch)
  if (t < 1) {
    glideFrame = requestAnimationFrame(glideTick)
  } else {
    glideFrame = null
    currentPatch = { ...glideTarget }
  }
}

/**
 * Apply a freshly computed patch: instantly when the transition is 0,
 * when nothing is driving yet (first sample after starting — no dip
 * from dark), or when the patch is unchanged; otherwise glide from the
 * currently applied values to the new ones over `transitionMs`.
 */
function applyPatch(patch: Record<number, number>) {
  if (transitionMs <= 0 || Object.keys(currentPatch).length === 0 || patchesEqual(currentPatch, patch)) {
    cancelGlide()
    currentPatch = { ...patch }
    setAmbienceOutput(patch)
    return
  }
  glideFrom = { ...currentPatch }
  glideTarget = { ...patch }
  if (glideFrame === null) {
    // No glide in flight — start a fresh one.
    glideStartedAt = performance.now()
    glideFrame = requestAnimationFrame(glideTick)
  }
  // Otherwise a glide is already running: retarget it (new from/target)
  // but keep its original start time. Samples arrive every ~200 ms, so
  // restarting the clock on every sample would never let the glide
  // finish — it would creep toward the target forever instead of
  // landing `transitionMs` after the first new sample.
}

export function isAmbienceActive(): boolean {
  return active
}

/** Resolved Preview position of a fixture (instance 0), as the Preview
 * itself shows it: the stored position, or the demo-arc fallback. */
export function resolvedFixturePosition(fixture: FixtureDef, index: number, count: number): { x: number; y: number } {
  const stored = instancePositions(fixture)[0]
  if (stored) return stored
  const arc = demoArcPositions(count)
  return arc[index] ?? { x: 400, y: 170 }
}

const COLOUR_ATTR = /^(red|green|blue|white|amber|uv|lime)\s*\d*$/i

/**
 * Build the channel patch for the current regions, screen and fixtures.
 * Pure except for reading module state — exported for tests. A fixture
 * takes its nearest screen-edge region's colour at full dimmer; other
 * LED colours (white, amber, UV, lime) are zeroed so the ambience colour
 * is pure. Fixtures with no RGB channels keep their cue output.
 */
export function computeAmbiencePatch(
  nextFixtures: FixtureDef[],
  nextScreen: StageObject | null,
  nextRegions: NdiRegionColour[] | null,
  nextLastColours: Array<NdiRgb | null>,
  nextMaster: number
): { patch: Record<number, number>; stats: NdiAmbienceStats; lastColours: Array<NdiRgb | null> } {
  const lastColours = [...nextLastColours]
  if (nextRegions) {
    for (const region of nextRegions) {
      if (region.rgb) lastColours[region.index] = region.rgb
    }
  }
  if (!nextScreen || !nextRegions) return { patch: {}, stats: { ...EMPTY_STATS }, lastColours }
  const anchors = screenRegionAnchors(screenRect(nextScreen))
  const onPlan = nextFixtures.filter((f) => !f.inStorage)
  // Positions resolve exactly as the Preview shows them: stored position,
  // else the demo-arc fallback indexed over the on-Preview fixtures
  // (disabled fixtures still hold an arc slot, as in StagePreview).
  const positioned = onPlan
    .map((f, i) => ({ fixture: f, pos: resolvedFixturePosition(f, i, onPlan.length) }))
    .filter(({ fixture }) => !fixture.disabled)
  const mapping = mapRegionsToFixtures(
    anchors,
    positioned.map(({ fixture, pos }) => ({ id: fixture.id, x: pos.x, y: pos.y }))
  )
  const values: Record<string, Record<string, number>> = {}
  const stats: NdiAmbienceStats = { ...EMPTY_STATS, disabled: nextFixtures.filter((f) => f.disabled).length, inStorage: nextFixtures.filter((f) => f.inStorage).length }
  for (const { fixture } of positioned) {
    const map = fixtureChannelMap(fixture)
    const attrs = Object.keys(map)
    const hasRgb = ['red', 'green', 'blue'].every((base) => attrs.some((a) => new RegExp(`^${base}\\s*\\d*$`, 'i').test(a.trim())))
    if (!hasRgb) {
      stats.colourless++
      continue
    }
    const regionIndex = mapping[fixture.id]
    if (regionIndex === undefined) continue
    const colour = nextRegions[regionIndex]?.rgb ?? lastColours[regionIndex] ?? null
    if (!colour) continue
    const fixtureValues: Record<string, number> = {}
    for (const attr of attrs) {
      const match = attr.trim().match(COLOUR_ATTR)
      if (!match) continue
      const base = match[1].toLowerCase()
      if (base === 'red') fixtureValues[attr] = colour.r
      else if (base === 'green') fixtureValues[attr] = colour.g
      else if (base === 'blue') fixtureValues[attr] = colour.b
      else fixtureValues[attr] = 0
    }
    fixtureValues.intensity = 255
    values[fixture.id] = fixtureValues
    stats.mapped++
  }
  const patch = computeCueChannels(nextFixtures, { id: 'ndi-ambience', name: 'NDI Ambience', fadeMs: 0, fixtureValues: values }, nextMaster)
  return { patch, stats, lastColours }
}

function recompute() {
  if (!active) return
  const { patch, stats, lastColours } = computeAmbiencePatch(fixtures, screen, regions, lastColourByRegion, master)
  lastColourByRegion = lastColours
  lastStats = stats
  applyPatch(patch)
}

/** Stats from the last recompute (mapped / colourless / disabled / in storage). */
export function getAmbienceStats(): NdiAmbienceStats {
  return { ...lastStats }
}

export function configureAmbienceFixtures(nextFixtures: FixtureDef[], stageObjects: StageObject[] | undefined, nextMaster: number) {
  fixtures = nextFixtures
  screen = findNdiScreen(stageObjects) ?? null
  master = nextMaster
  recompute()
}

export function setAmbienceRegions(nextRegions: NdiRegionColour[]) {
  regions = nextRegions
  recompute()
}

export function setAmbienceActive(nextActive: boolean) {
  if (nextActive === active) return
  active = nextActive
  if (!active) {
    cancelGlide()
    currentPatch = {}
    clearAmbienceOutput()
    return
  }
  recompute()
}

/** Test hook: forget held region colours (fresh session). */
export function resetAmbienceState() {
  cancelGlide()
  currentPatch = {}
  active = false
  fixtures = []
  screen = null
  regions = null
  lastStats = { ...EMPTY_STATS }
  lastColourByRegion = Array.from({ length: NDI_REGION_COUNT }, () => null)
  clearAmbienceOutput()
}
