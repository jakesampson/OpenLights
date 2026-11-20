import type { FixtureDef, PresetDef, SequenceDef, SequenceStep } from '@shared/types'
import { fixtureMode } from '@shared/fixtureProfiles'
import { fanPresetFixtureValues } from '@shared/cueResolution'
export function sequenceOrder(count: number, order: SequenceDef['order'], seed = 1): number[] {
  const result = Array.from({ length: count }, (_, i) => i)
  if (order === 'backward') return result.reverse()
  if (order === 'bounce') return [...result, ...result.slice(1, -1).reverse()]
  if (order === 'random') {
    let state = seed >>> 0
    for (let i = result.length - 1; i > 0; i--) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; const j = state % (i + 1); [result[i], result[j]] = [result[j], result[i]] }
  }
  return result
}
export interface SequencePosition { index: number; nextIndex: number; mix: number; completed: boolean; remainingMs: number; pass: number }
export function sequencePosition(sequence: SequenceDef, elapsedMs: number, seed = 1, bpm = 120): SequencePosition {
  if (!sequence.steps.length) return { index: -1, nextIndex: -1, mix: 0, completed: true, remainingMs: 0, pass: 0 }
  const scale = Math.max(0.01, sequence.timeScale ?? 1)
  const duration = (index: number) => sequence.timing === 'beat' ? Math.max(1, (sequence.steps[index].beats ?? 1) * 60000 / Math.max(1, bpm) / Math.max(0.01, sequence.stepsPerBeat)) : Math.max(1, (Math.max(0, sequence.steps[index].holdMs) + Math.max(0, sequence.steps[index].fadeMs)) * scale)
  const initialOrder = sequenceOrder(sequence.steps.length, sequence.order, seed), total = initialOrder.reduce((sum, i) => sum + duration(i), 0)
  const repeats = sequence.repeatCount && sequence.repeatCount > 0 ? Math.floor(sequence.repeatCount) : sequence.loop ? Infinity : 1
  const elapsed = Math.max(0, elapsedMs), pass = Math.min(Math.floor(elapsed / total), repeats - 1)
  const order = sequenceOrder(sequence.steps.length, sequence.order, seed + pass)
  if (elapsed >= total * repeats) { const index = sequence.freezeOnCompletion ? order[order.length - 1] : -1; return { index, nextIndex: index, mix: 0, completed: true, remainingMs: 0, pass } }
  let local = elapsed % total
  for (let offset = 0; offset < order.length; offset++) {
    const index = order[offset], step = sequence.steps[index], length = duration(index)
    if (local >= length) { local -= length; continue }
    if (sequence.timing === 'beat' && step.fadeMs > 0 && (offset > 0 || pass > 0)) {
      const previousIndex = order[offset - 1] ?? sequenceOrder(sequence.steps.length, sequence.order, seed + pass - 1).at(-1)!
      return { index: previousIndex, nextIndex: index, mix: Math.min(1, local / step.fadeMs), completed: false, remainingMs: length - local, pass }
    }
    const nextIndex = order[offset + 1] ?? (pass + 1 < repeats ? sequenceOrder(sequence.steps.length, sequence.order, seed + pass + 1)[0] : index)
    return { index, nextIndex, mix: sequence.timing === 'manual' && step.fadeMs > 0 ? Math.max(0, Math.min(1, (local - step.holdMs * scale) / (step.fadeMs * scale))) : 0, completed: false, remainingMs: length - local, pass }
  }
  return { index: -1, nextIndex: -1, mix: 0, completed: true, remainingMs: 0, pass }
}
export function sequenceStepValues(step: SequenceStep | undefined, presets: PresetDef[], fixtures: FixtureDef[] = []): Record<string, Record<string, number>> {
  const values: Record<string, Record<string, number>> = {}
  if (!step) return values
  // A preset's colour is the fixture's colour (Jake, 19 Nov 2026):
  // its bare colour fans out to every beam, like a cue's presets.
  // The step's own values are the operator's explicit values and
  // are never fanned.
  for (const id of step.presetIds) for (const [fixtureId, patch] of Object.entries(fanPresetFixtureValues(presets.find((p) => p.id === id)?.fixtureValues ?? {}, fixtures))) values[fixtureId] = { ...values[fixtureId], ...patch }
  for (const [id, patch] of Object.entries(step.fixtureValues)) values[id] = { ...values[id], ...patch }
  return values
}
/** Fine-channel pairs for 16-bit position interpolation. */
const FINE_PAIRS: Record<string, string> = { pan: 'panFine', tilt: 'tiltFine' }
const FINE_TO_COARSE: Record<string, string> = { panFine: 'pan', tiltFine: 'tilt' }

export function sequenceValues(sequence: SequenceDef, presets: PresetDef[], fixtures: FixtureDef[], elapsedMs: number, seed = 1, bpm = 120): Record<string, Record<string, number>> {
  const position = sequencePosition(sequence, elapsedMs, seed, bpm), from = sequenceStepValues(sequence.steps[position.index], presets, fixtures), to = sequenceStepValues(sequence.steps[position.nextIndex], presets, fixtures)
  if (!position.mix) return from
  const values: Record<string, Record<string, number>> = {}
  for (const id of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const fixture = fixtures.find((f) => f.id === id), channels = fixture ? fixtureMode(fixture)?.channels : []
    values[id] = {}
    const handled = new Set<string>()
    for (const attribute of new Set([...Object.keys(from[id] ?? {}), ...Object.keys(to[id] ?? {})])) {
      if (handled.has(attribute)) continue
      const a = from[id]?.[attribute], b = to[id]?.[attribute], channel = channels?.find((c) => c.attribute === attribute)
      const discrete = channel?.control === 'options' || Boolean(channel?.slots?.length)
      // 16-bit paired interpolation for position attributes
      const fineAttr = FINE_PAIRS[attribute]
      if (fineAttr && channels?.some((c) => c.attribute === fineAttr)) {
        const aFine = from[id]?.[fineAttr] ?? 0, bFine = to[id]?.[fineAttr] ?? 0
        const a16 = ((a ?? 128) << 8) | aFine, b16 = ((b ?? 128) << 8) | bFine
        const interp16 = a !== undefined && b !== undefined ? Math.round(a16 + (b16 - a16) * position.mix) : position.mix < 0.5 ? a16 : b16
        values[id][attribute] = (interp16 >> 8) & 255
        values[id][fineAttr] = interp16 & 255
        handled.add(fineAttr)
        continue
      }
      // Skip fine channels already handled as part of a pair
      if (FINE_TO_COARSE[attribute] && handled.has(FINE_TO_COARSE[attribute])) continue
      const value = a !== undefined && b !== undefined && !discrete ? Math.round(a + (b - a) * position.mix) : position.mix < 0.5 ? a : b
      if (value !== undefined) values[id][attribute] = value
    }
  }
  return values
}
