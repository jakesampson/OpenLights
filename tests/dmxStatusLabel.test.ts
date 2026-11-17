import { describe, expect, it } from 'vitest'
import { getDmxStatusLabel } from '../src/renderer/src/lib/dmxStatusLabel'

describe('getDmxStatusLabel', () => {
  it('labels an active output connection', () => {
    expect(
      getDmxStatusLabel({ connected: true, mode: 'serial', error: null }, null)
    ).toBe('Connected')
  })

  it('labels clean software output as virtual', () => {
    expect(
      getDmxStatusLabel({ connected: false, mode: 'virtual', error: null }, null)
    ).toBe('Virtual')
  })

  it('labels missing or failed output connections as disconnected', () => {
    expect(getDmxStatusLabel(null, null)).toBe('Disconnected')
    expect(
      getDmxStatusLabel({ connected: false, mode: 'virtual', error: 'Device unavailable' }, null)
    ).toBe('Disconnected')
    expect(
      getDmxStatusLabel({ connected: false, mode: 'serial', error: null }, 'Disconnected')
    ).toBe('Disconnected')
  })
})
