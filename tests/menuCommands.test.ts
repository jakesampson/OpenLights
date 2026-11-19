import { describe, expect, it } from 'vitest'
import { CONTEXT_MENUS, MENU_LABELS, WINDOWS_MENU } from '../src/shared/menuModel'
import { SHORTCUTS } from '../src/renderer/src/lib/shortcuts'

describe('Windows and context menu commands', () => {
  it('maps every menu command to a shortcut action or a labelled binding-less command', () => {
    const commands = new Set(SHORTCUTS.map((binding) => binding.command))
    const menuCommands = WINDOWS_MENU.flatMap((group) => group.items.flatMap((item) => item.command ? [item.command] : []))
    const contextCommands = Object.values(CONTEXT_MENUS).flat()
    // Commands with no keyboard binding (Add Overrides, Edit Ad Hoc
    // Properties — Guide ch.11, pp.201–202) resolve through MENU_LABELS
    // and the menu-command event instead of a synthesized keydown.
    expect([...menuCommands, ...contextCommands].every((command) => commands.has(command) || command in MENU_LABELS)).toBe(true)
    expect(WINDOWS_MENU.map((group) => group.label)).toEqual(['File', 'Edit', 'View', 'Layout', 'Live', 'Window', 'Help'])
    expect(Object.keys(CONTEXT_MENUS)).toEqual(['fixture', 'preset', 'cue', 'page'])
  })
})
