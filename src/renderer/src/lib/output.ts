import type { SequenceDef, PresetDef } from '@shared/types'
import { sequenceValues } from './sequenceClock'
import { applyHighlight } from './highlight'
/**
 * Renderer-side DMX output. Keeps the base look (cues, cues, automation)
 * separate from the effects layer, so animated effects can be applied on top
 * without losing what the operator selected. Every write funnels through here.
 */

import type { EffectDef, FixtureDef, MovementPathDef } from '@shared/types'
import { computeEffectPatch, mergeEffects } from './effects'
import { composeOutput } from './outputModel'
import { computeCueChannels } from './automationRuntime'
import { applyCalibrationOutput } from './calibration'
import { applyDimmerLimits } from './automationRuntime'

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
let base: Record<number, number> = {}
let fadeFrame: number | null = null
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

function push(patch: Record<number, number>) {
  if (new URLSearchParams(window.location?.search ?? '').has('liveWindow')) return
  lastOutput = { ...patch }
  window.electronAPI?.setChannels?.(patch)
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
    { movementPaths: runtime.movementPaths ?? [], baseValues: runtime.baseValues }
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
  let output = composeOutput({ defaults: computeCueChannels(runtime.fixtures, { id: 'defaults', name: 'Defaults', fadeMs: 0, fixtureValues: {} }, runtime.master, true), base, sequences: sequencePatch(now), effects: effectPatch(now), live: suppressed ? {} : live, presets: suppressed ? {} : presets, overrides: suppressed ? {} : overrides, locate: suppressed ? {} : locate, blackout: runtime.blackout, blind, freeze, heldFrame: blindFrame ?? freezeFrame ?? undefined, disabledChannels: runtime.fixtures.filter((f) => f.disabled).flatMap((f) => Array.from({ length: f.channels }, (_, i) => f.channelStart + i)), previousChannels: [...previousPresetChannels] })
  if (!runtime.blackout && thawFrom && thawDuration > 0) {
    const progress = (now - thawStartedAt) / thawDuration
    output = interpolateOutputFrame(thawFrom, output, progress)
    if (progress >= 1) thawFrom = null
  }
  previousPresetChannels = new Set([...Object.keys(live), ...Object.keys(presets), ...Object.keys(overrides), ...Object.keys(locate), ...Object.keys(sequencePatch(now)), ...Object.keys(ambience)].map(Number))
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
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Send a base look immediately. Always cancels any in-flight fade. */
export function sendImmediate(target: Record<number, number>) {
  cancelFade()
  base = { ...target }
  flush()
}

/** Fade the base look from its current values to the target over fadeMs. */
export function sendChannels(target: Record<number, number>, fadeMs = 0) {
  cancelFade()
  if (fadeMs <= 0) {
    sendImmediate(target)
    return
  }

  const from = { ...base }
  const start = performance.now()
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
    flush(now)
    if (t < 1) {
      fadeFrame = requestAnimationFrame(tick)
    } else {
      fadeFrame = null
      base = { ...target }
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
