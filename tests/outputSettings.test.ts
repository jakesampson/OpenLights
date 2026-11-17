import { describe, expect, it, vi } from 'vitest'
import { usbOnlyStatus } from '../src/shared/outputSettings'
import type { DmxStatus } from '../src/shared/types'
describe('legacy network output', () => {
  it('falls back to virtual with a diagnostic and preserves USB settings', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacy: DmxStatus = { mode: 'artnet', connected: true, port: '192.168.1.10', baudRate: 250000, lastFrameAt: null, frameCount: 0, universe: 0, error: null }
    expect(usbOnlyStatus(legacy)).toMatchObject({ mode: 'virtual', connected: false, port: null })
    expect(warning).toHaveBeenCalled()
    const usb = { ...legacy, mode: 'serial' as const, port: 'COM3' }
    expect(usbOnlyStatus(usb)).toEqual(usb); warning.mockRestore()
  })
})
