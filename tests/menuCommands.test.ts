import { describe, expect, it } from 'vitest'
import { CONTEXT_MENUS, MENU_LABELS, WINDOWS_MENU, macAppMenu, menuGroupsFor } from '../src/shared/menuModel'
import { SHORTCUTS } from '../src/renderer/src/lib/shortcuts'

describe('macOS application menu (Jake, 24 Nov 2026 — Cmd+Q did nothing)', () => {
  it('puts the app menu with Quit first on darwin', () => {
    const groups = menuGroupsFor('darwin', 'OpenLights')
    expect(groups[0]).toEqual(macAppMenu('OpenLights'))
    expect(groups[0].label).toBe('OpenLights')
    expect(groups[0].items.map((item) => item.role)).toEqual(['about', undefined, 'quit'])
    expect(groups[0].items[1].type).toBe('separator')
    expect(groups.slice(1)).toEqual(WINDOWS_MENU)
  })
  it('keeps exactly WINDOWS_MENU on Windows and Linux', () => {
    expect(menuGroupsFor('win32', 'OpenLights')).toEqual(WINDOWS_MENU)
    expect(menuGroupsFor('linux', 'OpenLights')).toEqual(WINDOWS_MENU)
  })
})

describe('Windows and context menu commands', () => {
  it('lists Ungroup right after Group in the Layout menu (Guide p.64)', () => {
    const layout = WINDOWS_MENU.find((group) => group.label === 'Layout')!
    const commands = layout.items.map((item) => item.command).filter(Boolean)
    expect(commands).toContain('ungroup')
    expect(commands.indexOf('ungroup')).toBe(commands.indexOf('group') + 1)
  })
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
