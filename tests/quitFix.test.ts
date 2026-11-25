// macOS quit hang regression (Jake, 25 Nov 2026 — quit-fix branch).
// The window closed but the Electron process stayed in the Dock, requiring
// Force Quit. app.quit() is graceful: it dispatches beforeunload in the
// renderer (which the dirty-project guard can veto) and waits on native
// handles (a wedged DMX serial port, the NDI UtilityProcess child). Either
// can strand the app in the Dock with no window. The fix kills the NDI
// worker immediately, bounds the serial close, hard-exits on last-window
// close, and arms a ref'd failsafe in before-quit rather than will-quit
// (which a veto or a frozen loop may prevent from ever firing).
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

describe('hard exit on last-window close', () => {
  it('window-all-closed calls app.exit(0), not the graceful app.quit()', () => {
    const handler = main.match(/app\.on\('window-all-closed', \(\) => \{[\s\S]*?\n\}\)/)?.[0]
    expect(handler).toBeTruthy()
    expect(handler).toContain('app.exit(0)')
    expect(handler).not.toContain('app.quit()')
  })
})

describe('before-quit failsafe', () => {
  it('arms a ref\'d force-exit timer in before-quit, not will-quit', () => {
    const handler = main.match(/app\.on\('before-quit', \(\) => \{[\s\S]*?\n\}\)/)?.[0]
    expect(handler).toBeTruthy()
    expect(handler).toMatch(/setTimeout\(\(\) => \{[\s\S]*?app\.exit\(0\)/s)
    // The force-exit timer must NOT be unref'd — an unref'd timer can be
    // skipped when nothing else keeps the event loop alive, which is
    // exactly the state we are trying to rescue.
    expect(handler).not.toContain('.unref()')
    // will-quit fires too late (a vetoed beforeunload or a frozen loop can
    // prevent it entirely), so the failsafe must not live there.
    expect(main).not.toMatch(/app\.on\('will-quit'/)
  })
})

describe('bounded DMX port close', () => {
  it('races port.close() against a timeout and force-destroys a stuck port', () => {
    expect(dmx).toMatch(/Promise\.race\(\[[\s\S]*?port\.close\(\(\) => resolve\(\)\)[\s\S]*?setTimeout\(resolve, 500\)/s)
    expect(dmx).toMatch(/if \(port\.isOpen\)[\s\S]*?port\.destroy\(\)/s)
  })
})
