// Jake, 20 Nov 2026 (image-17): on a multifixture the RGB faders are
// coloured only for the first RGB set — Red 2 through Blue 4 render as
// purple (the accent fallback) because channelFillColor switches on the
// exact attribute string. The fill must follow the channel, not the beam
// index, in either spelling ('red2' built-in, 'red 2' OFL).
import { describe, it, expect } from 'vitest'
import { channelFillColor } from '../src/renderer/src/components/DesignTab'

describe('channelFillColor', () => {
  it('colours every beam of a colour channel the same as beam 1', () => {
    expect(channelFillColor('red')).toBe('#ef4444')
    expect(channelFillColor('red2')).toBe('#ef4444')
    expect(channelFillColor('red 2')).toBe('#ef4444')
    expect(channelFillColor('red 4')).toBe('#ef4444')
    expect(channelFillColor('green 3')).toBe('#22c55e')
    expect(channelFillColor('green2')).toBe('#22c55e')
    expect(channelFillColor('blue2')).toBe('#3b82f6')
    expect(channelFillColor('blue 4')).toBe('#3b82f6')
    expect(channelFillColor('cyan 2')).toBe('#22d3ee')
    expect(channelFillColor('magenta 2')).toBe('#e879f9')
    expect(channelFillColor('yellow 4')).toBe('#eab308')
    expect(channelFillColor('white 2')).toBe('#e5e7eb')
    expect(channelFillColor('amber 3')).toBe('#f59e0b')
    expect(channelFillColor('uv 2')).toBe('#a855f7')
    expect(channelFillColor('lime 4')).toBe('#84cc16')
  })

  it('leaves non-colour channels on the accent fallback', () => {
    for (const attribute of ['intensity', 'strobe', 'function', 'speed', 'listType', 'pan', 'tilt', 'gobo', 'programs', 'program speed', 'curve select']) {
      expect(channelFillColor(attribute)).toBe('var(--accent)')
    }
  })
})
