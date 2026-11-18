import { describe, expect, it } from 'vitest'
import { formatTimingMs, parseTimingMs } from '../src/renderer/src/lib/liveTiming'

describe('live timing display (LightKey mm:ss.t)', () => {
  it('formats milliseconds as mm:ss.t', () => {
    expect(formatTimingMs(0)).toBe('00:00.0')
    expect(formatTimingMs(500)).toBe('00:00.5')
    expect(formatTimingMs(1000)).toBe('00:01.0')
    expect(formatTimingMs(65000)).toBe('01:05.0')
    expect(formatTimingMs(1250)).toBe('00:01.3')
  })

  it('parses mm:ss.t back to milliseconds', () => {
    expect(parseTimingMs('00:00.5')).toBe(500)
    expect(parseTimingMs('00:01.0')).toBe(1000)
    expect(parseTimingMs('01:05.0')).toBe(65000)
    expect(parseTimingMs('0.5')).toBe(500)
    expect(parseTimingMs('2')).toBe(2000)
  })

  it('rejects unparsable input instead of inventing a value', () => {
    expect(parseTimingMs('')).toBeNull()
    expect(parseTimingMs('abc')).toBeNull()
    expect(parseTimingMs('1:2:3')).toBeNull()
    expect(parseTimingMs('-00:01.0')).toBeNull()
  })
})
