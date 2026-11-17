import type { FadeCurve, LiveControl } from '@shared/types'

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function fadeCurve(curve: FadeCurve, progress: number): number {
  const t = clamp01(progress)
  if (curve === 'ease-in') return t * t
  if (curve === 'ease-out') return 1 - (1 - t) * (1 - t)
  if (curve === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
  if (curve === 's-curve') return t * t * (3 - 2 * t)
  return t
}

export function cueTransitionLevel(control: LiveControl, from: number, to: number, elapsedMs: number): number {
  const timing = { fadeInMs: 0, fadeOutMs: 0, delayMs: 0, curve: 'linear' as FadeCurve, ...control.timing }
  if (elapsedMs < timing.delayMs) return from
  const duration = to >= from ? timing.fadeInMs : timing.fadeOutMs
  if (duration <= 0) return to
  const progress = fadeCurve(timing.curve, (elapsedMs - timing.delayMs) / duration)
  return Math.round(from + (to - from) * progress)
}
