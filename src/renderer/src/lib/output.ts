import type { SequenceDef, PresetDef } from '@shared/types'
import { sequencePosition, sequenceValues } from './sequenceClock'
import { applyHighlight } from './highlight'
/**
 * Renderer-side DMX output. Keeps the base look (cues, cues, automation)
 * separate from the effects layer, so animated effects can be applied on top
 * without losing what the operator selected. Every write funnels through here.
 */

import type { EffectDef, FixtureDef, MovementPathDef } from '@shared/types'
import { assignActivationSeeds, computeEffectPatch, mergeEffects } from './effects'
import { composeOutput } from './outputModel'
import { computeCueChannels } from './automationRuntime'
import { applyCalibrationOutput } from './calibration'
import { applyDimmerLimits } from './automationRuntime'
import { fixtureChannelMap } from '@shared/fixtureProfiles'

let sequences: SequenceDef[] = []
let sequencePresets: PresetDef[] = []
const sequenceStarts = new Map<string, number>()
function sequencePatch(now: number): Record<number, number> {
  if (runtime.blackout || presetSuppressed) return {}
  const patch: Record<number, number> = {}
  for (const sequence of sequences) Object.assign(patch, computeCueChannels(runtime.fixtures, { id: sequence.id, name: sequence.name, fadeMs: 0, fixtureValues: sequenceValues(sequence, sequencePresets, runtime.fixtures, now - (sequenceStarts.get(sequence.id) ?? now), 1, runtime.bpm) }, runtime.master))
  return patch
}
export function configureSequences(active: SequenceDef[], presets: PresetDef[] = []) {
  const now = performance.now()
  for (const id of sequenceStarts.keys()) if (!active.some((s) => s.id === id)) sequenceStarts.delete(id)
  for (const sequence of active) if (!sequenceStarts.has(sequence.id)) sequenceStarts.set(sequence.id, now)
  sequences = active; sequencePresets = presets
  if (active.length && !runtime.blackout) startEffectLoop()
  else if (!runtime.effects.some((e) => e.enabled)) stopEffectLoop()
  flush()
}

/**
 * Ids of the sequences currently running that have finished their last
 * pass (Video 2, Jake 27 Nov 2026: a run-once sequence auto-deactivates
 * when finished; a looping one never completes, so it repeats
 * infinitely — the same rule the guide's Repeat setting states, ch.9
 * p.132). The store polls this and releases the buttons/cues running
 * them; the output layer itself only stops animating.
 */
export function completedSequenceIds(): string[] {
  const now = performance.now()
  return sequences.filter((sequence) => {
    const start = sequenceStarts.get(sequence.id)
    if (start === undefined) return false
    return sequencePosition(sequence, now - start, 1, runtime.bpm).completed
  }).map((sequence) => sequence.id)
}
let base: Record<number, number> = {}
let fadeFrame: number | null = null
/** The target of the in-flight base fade, and when it started / how long
 *  it runs — so a base re-assert can tell whether the fade is already
 *  heading where the look now is, instead of cancelling it. */
let fadeTarget: Record<number, number> | null = null
let fadeStartedAt = 0
let fadeDurationMs = 0
let effectFrame: number | null = null
let effectStartedAt = 0
let presets: Record<number, number> = {}
let live: Record<number, number> = {}
let liveFadeFrame: number | null = null
let liveFadeTarget: Record<number, number> | null = null
let overrides: Record<number, number> = {}
let locate: Record<number, number> = {}
let locateTimer: ReturnType<typeof setTimeout> | null = null
let presetSuppressed = false
let previousPresetChannels = new Set<number>()
let blind = false
let blindFrame: Record<number, number> | null = null
let highlight: { active: boolean; fixtureIds: Set<string> } = { active: false, fixtureIds: new Set() }
let calibration: Record<number, number> = {}
let ambience: Record<number, number> = {}
let lastOutput: Record<number, number> = {}
/** Frame counter for the Preview (Jake, 26 Nov 2026): `push()` bumps
 *  this on every frame it sends, so StagePreview can drive its beam
 *  from the same ~60fps rAF loop as the chart dot instead of polling
 *  getChannels() every 100ms — the beam jumped ~18° per poll step
 *  while the DMX output itself was smooth. A channel the last frame
 *  does not drive reads 0, matching the interface. */
let outputFrameId = 0
export function getOutputFrameId(): number { return outputFrameId }
export function getLastOutputChannels(): number[] {
  const frame = new Array(512).fill(0)
  for (const [key, value] of Object.entries(lastOutput)) frame[Number(key) - 1] = value
  return frame
}
let freeze = false
let freezeFrame: Record<number, number> | null = null
let thawFrame: number | null = null
let thawFrom: Record<number, number> | null = null
let thawStartedAt = 0
let thawDuration = 0

interface EffectRuntime {
  effects: EffectDef[]
  fixtures: FixtureDef[]
  movementPaths: MovementPathDef[]
  bpm: number
  master: number
  blackout: boolean
  /** Base look in attribute space (cue + presets + overrides): the
   *  colour source for a Dimmer effect on a virtual-dimmer fixture. */
  baseValues?: Record<string, Record<string, number>>
}

let runtime: EffectRuntime = {
  effects: [],
  fixtures: [],
  movementPaths: [],
  bpm: 120,
  master: 255,
  blackout: false
}

/** Per-effect Random (Variable) activation seeds (Guide p.151) — keyed by
 *  effect id, minted in configureEffects when an effect becomes enabled
 *  and kept for the whole activation; see assignActivationSeeds. */
let effectActivationSeeds = new Map<string, number>()

/**
 * The dimmer the Preview draws for each fixture (0..255) — the number
 * the beam length follows. A beam's length must follow the dimmer
 * only (Jake, 24 Nov 2026): during a colour-only transition the beam
 * shrank and re-grew, because the Preview derived brightness from
 * the transmitted frame as the max colour channel — and a linear
 * red→blue crossfade passes through purple at half height on each
 * channel (max 128), so the beam halved mid-transition. The
 * transmitted DMX is correct (a linear crossfade genuinely passes
 * through that purple); the dip is in the derivation, not the data.
 * So the engine tracks the dimmer separately, as the endpoint
 * brightness of each base look, interpolated through the fade with
 * the same easing as the channels: the endpoints of a colour-only
 * fade both read full, so the level stays full throughout, while a
 * dimmer fade's endpoints read full→zero and the level follows.
 *
 * Two layers, kept apart on purpose:
 * - `baseLevels`: the in-flight dimmer of the base look, written by
 *   sendChannels (interpolated) and sendImmediate (set). It is the
 *   base only — sequences, effects, ambience and highlight drive
 *   fixtures past the base, and their contribution is applied in
 *   flush() instead, so this stays the clean base signal.
 * - `displayLevels`: what the Preview reads (getDisplayLevels) —
 *   baseLevels corrected in flush() for the fixtures a post-base
 *   layer is driving, where the transmitted frame is the only signal
 *   that knows the modulation. During blind/freeze the transmitted
 *   frame is held, so displayLevels freeze with it.
 */
let baseLevels: Record<string, number> = {}
let displayLevels: Record<string, number> = {}
/** Brightness of the frozen frame, for the thaw crossfade back. */
let thawFromLevels: Record<string, number> = {}

/** Colour attributes that carry a fixture's light (plus the numbered
 *  cell variants, red2/green3 … — a multipart fixture's cells count
 *  toward its brightness just like its first cell). White and amber
 *  are separate LEDs but they are light all the same; UV is not
 *  counted, matching the Preview's own max (StagePreview). */
const DISPLAY_COLOUR_ATTRIBUTE = /^(red|green|blue|white|amber)\d*$/

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * The brightness one fixture is driven at in a channel frame
 * (0..255): its intensity channel where it has one (hardware dimmer
 * — the channel itself is the dimmer, whatever the colours do), else
 * the peak of its colour channels. A disabled fixture reads 0: its
 * channels are excluded from the transmitted frame.
 */
export function frameBrightness(frame: Record<number, number>, fixture: FixtureDef): number {
  if (fixture.disabled) return 0
  const map = fixtureChannelMap(fixture)
  const intensityOffset = map['intensity']
  if (intensityOffset !== undefined) {
    return clamp255(frame[fixture.channelStart + intensityOffset] ?? 0)
  }
  let peak = 0
  for (const [attribute, offset] of Object.entries(map)) {
    if (!DISPLAY_COLOUR_ATTRIBUTE.test(attribute)) continue
    const value = frame[fixture.channelStart + offset]
    if (typeof value === 'number') peak = Math.max(peak, value)
  }
  return clamp255(peak)
}

/**
 * The endpoint brightness of a channel patch, per fixture. Only
 * fixtures the patch fully determines get an entry: every mapped
 * channel must be present. A partial patch (automation drives one
 * channel) does not determine a fixture's brightness — its undriven
 * channels keep their last values on the interface — so the engine
 * claims no level for it and the Preview falls back to the
 * transmitted frame instead. Cue patches always fully determine
 * every fixture (computeCueChannels with zeroMissing), as does the
 * all-zero patch.
 */
export function patchBrightness(patch: Record<number, number>, fixtures: FixtureDef[]): Record<string, number> {
  const levels: Record<string, number> = {}
  for (const fixture of fixtures) {
    const offsets = Object.values(fixtureChannelMap(fixture))
    if (!offsets.every((offset) => typeof patch[fixture.channelStart + offset] === 'number')) continue
    levels[fixture.id] = frameBrightness(patch, fixture)
  }
  return levels
}

/** Interpolate per-fixture levels between two looks; a fixture
 *  absent from either end reads 0 there (dark), matching how the
 *  channel fade treats a missing channel. */
export function lerpLevels(from: Record<string, number>, to: Record<string, number>, progress: number): Record<string, number> {
  const t = Math.max(0, Math.min(1, progress))
  const levels: Record<string, number> = {}
  for (const id of new Set([...Object.keys(from), ...Object.keys(to)])) {
    levels[id] = Math.round((from[id] ?? 0) + ((to[id] ?? 0) - (from[id] ?? 0)) * t)
  }
  return levels
}

/** The dimmer the Preview draws for each fixture (0..255). */
export function getDisplayLevels(): Record<string, number> {
  return { ...displayLevels }
}

function push(patch: Record<number, number>) {
  if (new URLSearchParams(window.location?.search ?? '').has('liveWindow')) return
  lastOutput = { ...patch }
  outputFrameId++
  window.electronAPI?.setChannels?.(patch)
}

// Channel → fixture, rebuilt when the rig changes (the flush
// correction below needs to know which fixture a post-base layer's
// patch is driving). Indexed by 1-based channel number.
let channelFixtures: Array<FixtureDef | undefined> = []
let channelFixturesFor: FixtureDef[] | null = null
function fixtureForChannel(channel: number, fixtures: FixtureDef[]): FixtureDef | undefined {
  if (channelFixturesFor !== fixtures) {
    channelFixtures = new Array(513).fill(undefined)
    for (const fixture of fixtures) {
      for (let i = 0; i < fixture.channels; i++) channelFixtures[fixture.channelStart + i] = fixture
    }
    channelFixturesFor = fixtures
  }
  return channelFixtures[channel]
}

/**
 * Bring the Preview's display dimmer up to date with the frame about
 * to be pushed. The base level is the in-flight baseLevels (already
 * interpolated through any base fade); a fixture a post-base layer
 * is driving needs the transmitted frame instead, because the base
 * does not know the modulation — an effect chase pulses a
 * virtual-dimmer fixture by scaling its colour channels, so its beam
 * must pulse with the frame, not sit at the base level. Ambience is
 * the exception: it drives its fixtures at full dimmer (intensity
 * 255 in its values), so they read full whatever the region colour
 * is — reading the frame max there would reintroduce the dip the
 * display dimmer exists to fix, as the region colour changes.
 * Presets, Live pads and Design overrides are deliberately NOT in
 * the touched set: their brightness is already stamped into the
 * base look (cuePatch/defaultsPatch apply the effective intensity),
 * so the base level is their level.
 */
function updateDisplayLevels(output: Record<number, number>, sequence: Record<number, number>, effects: Record<number, number>, thawProgress: number | null) {
  if (runtime.blackout) {
    for (const fixture of runtime.fixtures) displayLevels[fixture.id] = 0
    return
  }
  // Blind / freeze hold the transmitted frame: the light the rig is
  // showing is frozen, so the display dimmer freezes with it.
  if (blind || freeze) return
  const effectiveBase = thawProgress === null ? baseLevels : lerpLevels(thawFromLevels, baseLevels, thawProgress)
  const fixtures = runtime.fixtures
  const touched = new Set<string>()
  const ambienceCovered = new Set<string>()
  const markPatch = (patch: Record<number, number>, into: Set<string>) => {
    for (const key of Object.keys(patch)) {
      const fixture = fixtureForChannel(Number(key), fixtures)
      if (fixture) into.add(fixture.id)
    }
  }
  markPatch(sequence, touched)
  markPatch(effects, touched)
  markPatch(locate, touched)
  markPatch(calibration, touched)
  markPatch(ambience, ambienceCovered)
  if (highlight.active) {
    for (const fixture of fixtures) if (!highlight.fixtureIds.has(fixture.id)) touched.add(fixture.id)
  }
  const next: Record<string, number> = {}
  for (const fixture of fixtures) {
    if (ambienceCovered.has(fixture.id)) { next[fixture.id] = 255; continue }
    if (touched.has(fixture.id)) { next[fixture.id] = frameBrightness(output, fixture); continue }
    if (effectiveBase[fixture.id] !== undefined) { next[fixture.id] = effectiveBase[fixture.id]; continue }
    // No base level for this fixture (a partial base patch never
    // determined it): leave it out, so the Preview falls back to
    // the transmitted frame.
  }
  displayLevels = next
}

/** Seconds since the effect loop started — the clock effects animate against. */
export function getEffectTime(): number {
  return (performance.now() - effectStartedAt) / 1000
}

/** Effects are suppressed while the rig is blacked out. */
function effectPatch(now: number): Record<number, number> {
  if (runtime.blackout || presetSuppressed) return {}
  if (!(runtime.effects.some((effect) => effect.enabled) || sequences.length > 0)) return {}
  const time = (now - effectStartedAt) / 1000
  return computeEffectPatch(
    runtime.fixtures,
    runtime.effects,
    time,
    runtime.bpm,
    runtime.master,
    { movementPaths: runtime.movementPaths ?? [], baseValues: runtime.baseValues, activationSeeds: Object.fromEntries(effectActivationSeeds) }
  )
}

export function interpolateOutputFrame(from: Record<number, number>, to: Record<number, number>, progress: number): Record<number, number> {
  const amount = Math.max(0, Math.min(1, progress))
  return Object.fromEntries([...new Set([...Object.keys(from), ...Object.keys(to)])].map((key) => {
    const channel = Number(key)
    return [channel, Math.round((from[channel] ?? 0) + ((to[channel] ?? 0) - (from[channel] ?? 0)) * amount)]
  }))
}

function flush(now = performance.now()) {
  const suppressed = runtime.blackout || presetSuppressed
  const seqPatch = sequencePatch(now)
  const effPatch = effectPatch(now)
  let output = composeOutput({ defaults: computeCueChannels(runtime.fixtures, { id: 'defaults', name: 'Defaults', fadeMs: 0, fixtureValues: {} }, runtime.master, true), base, sequences: seqPatch, effects: effPatch, live: suppressed ? {} : live, presets: suppressed ? {} : presets, overrides: suppressed ? {} : overrides, locate: suppressed ? {} : locate, blackout: runtime.blackout, blind, freeze, heldFrame: blindFrame ?? freezeFrame ?? undefined, disabledChannels: runtime.fixtures.filter((f) => f.disabled).flatMap((f) => Array.from({ length: f.channels }, (_, i) => f.channelStart + i)), previousChannels: [...previousPresetChannels] })
  let thawProgress: number | null = null
  if (!runtime.blackout && thawFrom && thawDuration > 0) {
    thawProgress = (now - thawStartedAt) / thawDuration
    output = interpolateOutputFrame(thawFrom, output, thawProgress)
    if (thawProgress >= 1) { thawFrom = null; thawProgress = null }
  }
  previousPresetChannels = new Set([...Object.keys(live), ...Object.keys(presets), ...Object.keys(overrides), ...Object.keys(locate), ...Object.keys(seqPatch), ...Object.keys(ambience)].map(Number))
  // Ambience channels are tracked here too (Jake, 23 Nov 2026): when
  // Ambience stops — or its mapping changes — a channel it drove that
  // the underlying look does not drive must be sent an explicit zero on
  // the next frame, not left latched at its last ambience value on the
  // interface. Without this, stopping Ambience only re-sends the
  // underlying look's channels, and an ambience-only channel keeps
  // glowing. The defaults layer covers most fixture channels in
  // practice, but this is what makes the override airtight.
  // Beam-direction calibration (Piece 4, Guide p.60): limits hold on
  // output and a reversed yoke mirrors pan. Applied to the composed
  // output so every source (cues, live, effects) is clamped the same way.
  output = applyCalibrationOutput(output, runtime.fixtures)
  // Dimmer limits (Guide p.62): remap the sent dimmer into
  // [minDimmer, maxDimmer] at the output. Skipped under blackout, blind
  // and freeze — blackout must stay zero, and blind/freeze hold frames
  // were already limited when they were captured, so remapping them
  // again would double-apply the limit.
  if (!runtime.blackout && !blind && !freeze) output = applyDimmerLimits(output, runtime.fixtures)
  // Highlight Mode is a view of the rig, not a held frame: it applies to
  // the composed output, but never overrides blackout, blind or freeze.
  if (highlight.active && !runtime.blackout && !blind && !freeze) output = applyHighlight(output, runtime.fixtures, highlight.fixtureIds)
  // Calibration live output (Piece 4): while the Beam Direction dialog
  // is open the calibrating fixtures move to the step's position,
  // overriding the composed look — like Highlight, never under blackout,
  // blind or freeze, and applied last so it wins for its channels.
  if (Object.keys(calibration).length && !runtime.blackout && !blind && !freeze) output = { ...output, ...calibration }
  // NDI Ambience (Jake, 23 Nov 2026): when active, the sampled screen-edge
  // colours take over the fixtures they map to — applied last, like
  // calibration, so ambience wins for its channels, but never under
  // blackout, blind or freeze. Turning it off re-sends the unmodified look.
  if (Object.keys(ambience).length && !runtime.blackout && !blind && !freeze) output = { ...output, ...ambience }
  updateDisplayLevels(output, seqPatch, effPatch, thawProgress)
  push(output)
}

/** Hold physical output while edits continue to update the internal look. Exiting commits the edited look. */
export function setBlindOutput(active: boolean) {
  if (active === blind) return
  if (active) blindFrame = { ...lastOutput }
  blind = active
  if (!active) blindFrame = null
  flush()
}

/** Highlight Mode (Guide pp.32, 64): only the given fixtures light up —
 *  the rest of the rig goes dark. Re-applied on every selection change
 *  while active; turning it off re-sends the unmodified look, so the rig
 *  returns to exactly what it was doing. */
export function setHighlightOutput(active: boolean, fixtureIds: Iterable<string>) {
  const ids = new Set(fixtureIds)
  const same = highlight.active === active && highlight.fixtureIds.size === ids.size && [...ids].every((id) => highlight.fixtureIds.has(id))
  if (same) return
  highlight = { active, fixtureIds: ids }
  flush()
}

/** Beam-direction calibration live output (Piece 4, Guide pp.58–60):
 *  while the calibration dialog is open the calibrating fixtures move
 *  to the current step's position (home, the rotation sweep, or the
 *  centre of the pan/tilt ranges). Pass {} when the dialog closes so
 *  the rig returns to exactly what it was doing. */
export function setCalibrationOutput(patch: Record<number, number>) {
  calibration = { ...patch }
  flush()
}

/** NDI Ambience output: the sampled screen-edge colours, as a channel
 * patch for the mapped fixtures. Replaces those fixtures' composed look
 * while active; pass an empty patch (or clearAmbienceOutput) to hand the
 * rig back to cues, presets and Live. */
export function setAmbienceOutput(patch: Record<number, number>) {
  ambience = { ...patch }
  flush()
}

export function clearAmbienceOutput() {
  if (!Object.keys(ambience).length) return
  ambience = {}
  flush()
}

/** Freeze the composed frame while playback changes, then crossfade to the current state. */
export function setFreezeOutput(active: boolean, resumeFadeMs = 300) {
  if (active === freeze) return
  if (thawFrame !== null) { cancelAnimationFrame(thawFrame); thawFrame = null }
  if (active) {
    freezeFrame = { ...lastOutput }
    thawFromLevels = patchBrightness(freezeFrame, runtime.fixtures)
    thawFrom = null
    freeze = true
    flush()
    return
  }
  freeze = false
  thawFrom = freezeFrame ? { ...freezeFrame } : null
  freezeFrame = null
  thawStartedAt = performance.now()
  thawDuration = Math.max(0, resumeFadeMs)
  const tick = (now: number) => {
    flush(now)
    if (thawFrom) thawFrame = requestAnimationFrame(tick)
    else thawFrame = null
  }
  if (thawDuration > 0) thawFrame = requestAnimationFrame(tick)
  else { thawFrom = null; flush() }
}

export function cancelFade() {
  if (fadeFrame !== null) {
    cancelAnimationFrame(fadeFrame)
    fadeFrame = null
  }
  fadeTarget = null
  fadeStartedAt = 0
  fadeDurationMs = 0
}

/** Two channel patches carry the same look (a missing channel reads 0,
 *  matching how the fade treats one). */
function samePatch(a: Record<number, number>, b: Record<number, number>): boolean {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if ((a[Number(key)] ?? 0) !== (b[Number(key)] ?? 0)) return false
  }
  return true
}

/**
 * Re-send the base look without snapping a fade in flight (Jake,
 * 24 Nov 2026: firing a cue must fade, but the manual-overrides
 * effect re-asserted the base on every cue activation and its
 * sendImmediate cancelled the fade the instant it started).
 * - A fade already heading to this target is left alone — the fade
 *   lands exactly where the look now is.
 * - A fade heading elsewhere is retargeted: it continues from the
 *   current interpolated base toward the new target, over the
 *   remaining fade time — or over `fadeMs` when the caller passes
 *   one, because that is a new transition with its own time.
 * - With no fade in flight, `fadeMs` fades to the target and no
 *   `fadeMs` sends it immediately (a dimmer drag must still show
 *   light at once, not a second later).
 */
export function reassertBase(target: Record<number, number>, fadeMs?: number) {
  if (fadeFrame !== null) {
    if (fadeTarget && samePatch(fadeTarget, target)) return
    const remaining = Math.max(0, fadeDurationMs - (performance.now() - fadeStartedAt))
    sendChannels(target, fadeMs !== undefined ? fadeMs : remaining)
    return
  }
  if (fadeMs !== undefined && fadeMs > 0) sendChannels(target, fadeMs)
  else sendImmediate(target)
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Send a base look immediately. Always cancels any in-flight fade.
 *  The base dimmer follows the look: `levels` overrides the endpoint
 *  brightness derived from the patch (the manual crossfade passes its
 *  own lerped levels, since the blended patch's own max would dip);
 *  a partial patch determines no level for the fixtures it does not
 *  cover, and their entries are dropped, so the Preview falls back
 *  to the transmitted frame for them. */
export function sendImmediate(target: Record<number, number>, levels?: Record<string, number>) {
  cancelFade()
  base = { ...target }
  baseLevels = levels ?? patchBrightness(target, runtime.fixtures)
  flush()
}

/** Fade the base look from its current values to the target over fadeMs.
 *  The dimmer fades with the channels, with the same easing: the
 *  level interpolates between the endpoint brightnesses of the two
 *  looks, so a colour-only fade holds its level while a dimmer fade
 *  follows the dimmer. */
export function sendChannels(target: Record<number, number>, fadeMs = 0) {
  cancelFade()
  if (fadeMs <= 0) {
    sendImmediate(target)
    return
  }

  const from = { ...base }
  const fromLevels = patchBrightness(from, runtime.fixtures)
  const toLevels = patchBrightness(target, runtime.fixtures)
  const start = performance.now()
  fadeTarget = { ...target }
  fadeStartedAt = start
  fadeDurationMs = fadeMs
  const channels = new Set(
    [...Object.keys(from), ...Object.keys(target)].map((key) => Number(key))
  )

  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / fadeMs)
    const eased = smoothstep(t)
    const patch: Record<number, number> = {}
    for (const channel of channels) {
      const a = from[channel] ?? 0
      const b = target[channel] ?? 0
      patch[channel] = Math.round(a + (b - a) * eased)
    }
    base = patch
    baseLevels = lerpLevels(fromLevels, toLevels, eased)
    flush(now)
    if (t < 1) {
      fadeFrame = requestAnimationFrame(tick)
    } else {
      fadeFrame = null
      fadeTarget = null
      fadeStartedAt = 0
      fadeDurationMs = 0
      base = { ...target }
      baseLevels = { ...toLevels }
    }
  }

  fadeFrame = requestAnimationFrame(tick)
}

/** The base look, excluding any effect animation. */
export function getCurrentPatch(): Record<number, number> {
  return { ...base }
}

/** A full explicit zero patch, used for blackout/clear. */
export function allZeroPatch(): Record<number, number> {
  const patch: Record<number, number> = {}
  for (let channel = 1; channel <= 512; channel++) patch[channel] = 0
  return patch
}

function stopEffectLoop() {
  if (effectFrame !== null) {
    cancelAnimationFrame(effectFrame)
    effectFrame = null
  }
}

function startEffectLoop() {
  if (effectFrame !== null) return
  effectStartedAt = performance.now()
  const tick = (now: number) => {
    flush(now)
    effectFrame = requestAnimationFrame(tick)
  }
  effectFrame = requestAnimationFrame(tick)
}

/**
 * Update the runtime context for effects. The App calls this whenever the
 * show, master, tempo, blackout state or effect list changes.
 */
export function configureEffects(config: Partial<EffectRuntime>) {
  // Guide p.151: a Random (Variable) order re-rolls each time its effect
  // becomes active. The seed map is refreshed here — this is where the
  // enabled transitions are visible — so each effect keeps its own seed
  // for the whole activation and another effect's activation never
  // reshuffles it.
  if (config.effects !== undefined) effectActivationSeeds = assignActivationSeeds(effectActivationSeeds, config.effects)
  runtime = { ...runtime, ...config }
  if (!runtime.blackout && (runtime.effects.some((effect) => effect.enabled) || sequences.length > 0)) {
    startEffectLoop()
  } else {
    stopEffectLoop()
    flush()
  }
}

/** Blackout must silence effects immediately, not on the next App render. */
export function setEffectBlackout(active: boolean) {
  runtime = { ...runtime, blackout: active }
  if (active) {
    stopEffectLoop()
  } else if ((runtime.effects.some((effect) => effect.enabled) || sequences.length > 0)) {
    startEffectLoop()
  }
}

/** Presets overlay the cue and effects; blackout always wins. */
export function configurePresetOutput(patch: Record<number, number>) {
  presets = { ...patch }
  flush()
}

export function configureLiveOutput(patch: Record<number, number>, fadeMs = 0) {
  if (liveFadeFrame !== null && liveFadeTarget && Object.keys(patch).length === Object.keys(liveFadeTarget).length && Object.entries(patch).every(([channel, value]) => liveFadeTarget?.[Number(channel)] === value)) return
  if (liveFadeFrame !== null) { cancelAnimationFrame(liveFadeFrame); liveFadeFrame = null }
  liveFadeTarget = null
  if (fadeMs <= 0) { live = { ...patch }; flush(); return }
  const from = { ...live }, target = { ...patch }, start = performance.now()
  liveFadeTarget = target
  const channels = new Set([...Object.keys(from), ...Object.keys(target)].map(Number))
  const tick = (now: number) => {
    const t = smoothstep(Math.max(0, Math.min(1, (now - start) / fadeMs)))
    const underneath = mergeEffects({ ...base, ...sequencePatch(now) }, effectPatch(now))
    const next: Record<number, number> = {}
    for (const channel of channels) {
      const fallback = underneath[channel] ?? 0
      next[channel] = Math.round((from[channel] ?? fallback) * (1 - t) + (target[channel] ?? fallback) * t)
    }
    live = t >= 1 ? target : next
    flush(now)
    liveFadeFrame = t < 1 ? requestAnimationFrame(tick) : null
    if (t >= 1) liveFadeTarget = null
  }
  liveFadeFrame = requestAnimationFrame(tick)
}
export function configureOverrideOutput(patch: Record<number, number>) { overrides = { ...patch }; flush() }
export function configureLocateOutput(patch: Record<number, number>, durationMs = 2000) {
  if (locateTimer !== null) clearTimeout(locateTimer)
  locateTimer = null; locate = { ...patch }; flush()
  if (Object.keys(locate).length) locateTimer = setTimeout(() => { locate = {}; locateTimer = null; flush() }, Math.max(0, durationMs))
}

/** Blackout cues suppress preset layers until another cue is recalled. */
export function suppressPresetsForCue(active: boolean) { presetSuppressed = active }
