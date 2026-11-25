// macOS quit hang regression (Jake, 25 Nov 2026 — quit-fix branch).
// The window closed but the Electron process stayed in the Dock, requiring
// Force Quit. Two native handles were keeping the main process alive after
// app.quit(): the NDI UtilityProcess child (whose graceful shutdown can
// hang in grandi.destroy(), and which keeps the Dock icon alive even if
// the main process exits) and a wedged DMX serial port whose close callback
// never fires. The fix kills the NDI worker immediately, adds a will-quit
// failsafe timer, and bounds the serial close.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const main = readFileSync('src/main/index.ts', 'utf8')
const dmx = readFileSync('src/shared/dmx.ts', 'utf8')

describe('NDI worker is killed immediately on quit', () => {
  it('calls worker.kill() with no graceful shutdown post or unref\'d timer', () => {
    const shutdownNdi = main.match(/function shutdownNdi\(\) \{[\s\S]*?\n\}/)?.[0]
    expect(shutdownNdi).toBeTruthy()
    expect(shutdownNdi).toContain('worker.kill()')
    // The old approach posted 'shutdown' and scheduled an unref'd kill
    // after 1s; neither belongs here now.
    expect(shutdownNdi).not.toContain("postMessage({ type: 'shutdown' })")
    expect(shutdownNdi).not.toContain('.unref()')
  })
})

describe('will-quit failsafe', () => {
  it('registers a will-quit handler with a ref\'d force-exit timer', () => {
    expect(main).toMatch(/app\.on\('will-quit',[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?app\.exit\(0\)/s)
    // The force-exit timer must NOT be unref'd — an unref'd timer can be
    // skipped when nothing else keeps the event loop alive, which is
    // exactly the state we are trying to rescue.
    const willQuit = main.match(/app\.on\('will-quit',[\s\S]*?\n\}\)/)?.[0]
    expect(willQuit).toBeTruthy()
    expect(willQuit).not.toContain('.unref()')
  })
})

describe('bounded DMX port close', () => {
  it('races port.close() against a timeout and force-destroys a stuck port', () => {
    expect(dmx).toMatch(/Promise\.race\(\[[\s\S]*?port\.close\(\(\) => resolve\(\)\)[\s\S]*?setTimeout\(resolve, 500\)/s)
    expect(dmx).toMatch(/if \(port\.isOpen\)[\s\S]*?port\.destroy\(\)/s)
  })
})
