import { describe, it, expect } from 'vitest'
import { DMXEngine } from '../src/shared/dmx'

// Regression test (Jake, 24 Nov 2026 — Mac quit hang): when the USB DMX
// device stops draining, the frame pump's writes back up and the in-flight
// write sticks in serialport waiting for the port to become writable.
// Closing the port cancels that write, and serialport emits an 'error'
// event (BindingsError: Canceled) on the port while closing. If nothing
// listens for 'error', the emission throws inside the stream machinery
// and the main process's event loop stops pumping — the close never
// completes, the process never exits, and only Force Quit (SIGKILL) works.
// DMXEngine attaches an 'error' listener when it connects, so the close
// must complete promptly even with a wedged device.
//
// This test needs a PTY whose far end never drains: run socat first:
//   socat -d -d PTY,link=/tmp/ttyV0 PTY,link=/tmp/ttyV1
// and leave /tmp/ttyV1 unread. It is skipped unless the PTY exists.
const PTY_PATH = '/tmp/ttyV0'

describe('DMXEngine shutdown with a wedged device', () => {
  it('shutdown() resolves promptly even when the device stops draining', async () => {
    const { existsSync } = await import('node:fs')
    if (!existsSync(PTY_PATH)) {
      console.log('skipping wedged-port test: /tmp/ttyV0 not present')
      return
    }
    const engine = new DMXEngine()
    await engine.connect(PTY_PATH, 'enttec-usb-pro')
    expect(engine.getStatus().connected).toBe(true)
    // Let the 40 Hz pump run until the PTY buffer fills and writes back
    // up (the far end never drains).
    await new Promise((resolve) => setTimeout(resolve, 4000))
    const done = await Promise.race([
      engine.shutdown().then(() => 'resolved' as const),
      new Promise((resolve) => setTimeout(() => resolve('TIMEOUT' as const), 5000))
    ])
    expect(done).toBe('resolved')
    expect(engine.getStatus().connected).toBe(false)
  }, 20000)
})
