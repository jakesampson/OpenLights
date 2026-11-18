import { describe, expect, it, vi } from 'vitest'
import { runToolbarCommand, type ToolbarCommand } from '../src/renderer/src/lib/toolbarCommands'
import { readFileSync } from 'node:fs'
describe('toolbar dispatch', () => {
  it('dispatches each command only to its intended action', () => {
    const names: ToolbarCommand[] = ['design', 'live', 'blackout', 'tap']
    for (const name of names) {
      const actions = { design: vi.fn(), live: vi.fn(), blackout: vi.fn(), tap: vi.fn() }
      runToolbarCommand(name, actions)
      for (const other of names) expect(actions[other]).toHaveBeenCalledTimes(other === name ? 1 : 0)
    }
  })
  it('uses one Lightkey-style header without a master slider', () => {
    const toolbar = readFileSync('src/renderer/src/components/WorkspaceToolbar.tsx', 'utf8')
    const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
    expect(toolbar).not.toContain('Master intensity')
    expect(toolbar).toContain('More controls')
    expect(app.match(/<WorkspaceToolbar/g)).toHaveLength(1)
    expect(app).toContain('aria-label="Active scene"')
  })
})
