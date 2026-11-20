import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { FixtureDef } from '../src/shared/types'
import { applyDimmerLimits } from '../src/renderer/src/lib/automationRuntime'

function par(id: string, channelStart: number, limits?: { minDimmer?: number; maxDimmer?: number; disabled?: boolean }): FixtureDef {
  return { id, name: id, type: 'par', channelStart, channels: 4, ...limits }
}

describe('dimmer limits (Guide ch.4, p.62 Fixture Options)', () => {
  it('remaps Off to min and Full to max', () => {
    const fixtures = [par('f1', 1, { minDimmer: 50, maxDimmer: 200 })]
    expect(applyDimmerLimits({ 1: 0 }, fixtures)).toEqual({ 1: 50 })
    expect(applyDimmerLimits({ 1: 255 }, fixtures)).toEqual({ 1: 200 })
    expect(applyDimmerLimits({ 1: 128 }, fixtures)).toEqual({ 1: 125 })
  })

  it('is a no-op without limits, and clamps limits to 0–255', () => {
    const fixtures = [par('f1', 1)]
    expect(applyDimmerLimits({ 1: 128 }, fixtures)).toEqual({ 1: 128 })
    const clamped = [par('f1', 1, { minDimmer: -10, maxDimmer: 300 })]
    expect(applyDimmerLimits({ 1: 128 }, clamped)).toEqual({ 1: 128 })
  })

  it('is a no-op when min is not below max', () => {
    const fixtures = [par('f1', 1, { minDimmer: 200, maxDimmer: 100 })]
    expect(applyDimmerLimits({ 1: 128 }, fixtures)).toEqual({ 1: 128 })
  })

  it('leaves other channels and other fixtures alone', () => {
    const fixtures = [par('f1', 1, { minDimmer: 50, maxDimmer: 200 }), par('f2', 5)]
    expect(applyDimmerLimits({ 1: 255, 2: 255, 5: 255 }, fixtures)).toEqual({ 1: 200, 2: 255, 5: 255 })
  })

  it('keeps a disabled fixture at zero', () => {
    const fixtures = [par('f1', 1, { minDimmer: 50, maxDimmer: 200, disabled: true })]
    expect(applyDimmerLimits({ 1: 0 }, fixtures)).toEqual({ 1: 0 })
  })

  it('does not mutate the input frame', () => {
    const fixtures = [par('f1', 1, { minDimmer: 50, maxDimmer: 200 })]
    const frame = { 1: 255 }
    expect(applyDimmerLimits(frame, fixtures)).toEqual({ 1: 200 })
    expect(frame).toEqual({ 1: 255 })
  })

  it('is applied in the output flush, but never under blackout, blind or freeze', () => {
    const root = path.dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(path.join(root, '..', 'src', 'renderer', 'src', 'lib', 'output.ts'), 'utf8')
    expect(source).toContain('applyDimmerLimits(output, runtime.fixtures)')
    expect(source).toContain('if (!runtime.blackout && !blind && !freeze) output = applyDimmerLimits(output, runtime.fixtures)')
  })
})
