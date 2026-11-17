/**
 * Renderer-side DMX output. Keeps the base look (scenes, cues, automation)
 * separate from the effects layer, so animated effects can be applied on top
 * without losing what the operator selected. Every write funnels through here.
 */

import type { EffectDef, FixtureDef } from '@shared/types'
import { computeEffectPatch, mergeEffects } from './effects'

let base: Record<number, number> = {}
let fadeFrame: number | null = null
let effectFrame: number | null = null
let effectStartedAt = 0
let presets: Record<number, number> = {}
let live: Record<number, number> = {}
let liveFadeFrame: number | null = null
let liveFadeTarget: Record<number, number> | null = null
let overrides: Record<number, number> = {}
let presetSuppressed = false
let previousPresetChannels = new Set<number>()

interface EffectRuntime {
  effects: EffectDef[]
  fixtures: FixtureDef[]
  bpm: number
  master: number
  blackout: boolean
}

let runtime: EffectRuntime = {
  effects: [],
  fixtures: [],
  bpm: 120,
  master: 255,
  blackout: false
}

function push(patch: Record<number, number>) {
  window.electronAPI?.setChannels?.(patch)
}

/** Effects are suppressed while the rig is blacked out. */
function effectPatch(now: number): Record<number, number> {
  if (runtime.blackout || presetSuppressed) return {}
  if (!runtime.effects.some((effect) => effect.enabled)) return {}
  const time = (now - effectStartedAt) / 1000
  return computeEffectPatch(
    runtime.fixtures,
    runtime.effects,
    time,
    runtime.bpm,
    runtime.master
  )
}

function flush(now = performance.now()) {
  const output = mergeEffects(base, effectPatch(now))
  // Clear channels that only belonged to an overlay after it is released.
  for (const channel of previousPresetChannels) if (!(channel in output)) output[channel] = 0
  if (!runtime.blackout && !presetSuppressed) Object.assign(output, live, presets, overrides)
  previousPresetChannels = new Set([...Object.keys(live), ...Object.keys(presets), ...Object.keys(overrides)].map(Number))
  push(output)
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
  if (!runtime.blackout && runtime.effects.some((effect) => effect.enabled)) {
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
  } else if (runtime.effects.some((effect) => effect.enabled)) {
    startEffectLoop()
  }
}

/** Presets overlay the scene and effects; blackout always wins. */
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
    const underneath = mergeEffects(base, effectPatch(now))
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

/** Blackout scenes suppress preset layers until another scene is recalled. */
export function suppressPresetsForScene(active: boolean) { presetSuppressed = active }
