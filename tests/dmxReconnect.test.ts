import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ ports: [] as any[] }))
vi.mock('serialport', async () => {
  const { EventEmitter } = await import('node:events')
  return { SerialPort: class extends EventEmitter {
    isOpen = false; frames: Buffer[] = []
    constructor() { super(); mocks.ports.push(this) }
    open(callback: (error: null) => void) { this.isOpen = true; callback(null) }
    close(callback: () => void) { this.isOpen = false; this.emit('close'); callback() }
    write(frame: Buffer, callback: (error: null) => void) { this.frames.push(frame); callback(null) }
    drain(callback: (error: null) => void) { callback(null) }
    set(_: unknown, callback: (error: null) => void) { callback(null) }
    static list() { return Promise.resolve([]) }
  } }
})
import { DMXEngine } from '../src/shared/dmx'
describe('USB output reconnect', () => {
  it('detects removal, reconnects and resends the current universe; explicit disconnect cancels retry', async () => {
    vi.useFakeTimers()
    const engine = new DMXEngine()
    await engine.connect('COM3', 'enttec-usb-pro'); engine.setChannel(1, 123)
    await vi.advanceTimersByTimeAsync(25)
    expect(mocks.ports[0].frames.at(-1)[5]).toBe(123)
    mocks.ports[0].isOpen = false; mocks.ports[0].emit('close')
    expect(engine.getStatus().connected).toBe(false); expect(engine.getStatus().error).toContain('disconnected')
    engine.setChannel(1, 200)
    await vi.advanceTimersByTimeAsync(1100)
    expect(engine.getStatus().connected).toBe(true)
    expect(mocks.ports[1].frames.at(-1)[5]).toBe(200)
    await engine.disconnect(); const count = mocks.ports.length
    await vi.advanceTimersByTimeAsync(2000); expect(mocks.ports).toHaveLength(count)
    vi.clearAllTimers(); vi.useRealTimers()
  })
})
