import { useEffect, useRef, useState } from 'react'
import { CONTEXT_MENUS, MENU_LABELS, type AppMenuCommand } from '@shared/menuModel'
import { SHORTCUTS } from '../lib/shortcuts'
import { fixtureGroupMenuCommands } from '../lib/fixtureGroups'
import { useShowStore } from '../stores/showStore'
import { useClampedMenuPosition } from '../lib/menuPosition'

type ContextKind = keyof typeof CONTEXT_MENUS
export function ContextMenu() {
  const [menu, setMenu] = useState<{ kind: ContextKind; x: number; y: number; alt: boolean } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const fixtureGroups = useShowStore((s) => s.show?.fixtureGroups ?? [])
  // Jake, 26 Nov 2026 — the menu used to open at the raw click point
  // and run off the window near an edge; it is clamped into the
  // viewport once mounted (see lib/menuPosition).
  const pos = useClampedMenuPosition(menu?.x ?? 0, menu?.y ?? 0, menuRef)
  useEffect(() => {
    const open = (event: MouseEvent) => {
      const element = event.target as Element | null
      const target = element?.closest<HTMLElement>('[data-context-menu]')
      const projectObject = element?.closest<HTMLElement>('[data-project-id]')
      const kind = (projectObject && projectObject.closest('[data-context-menu="page"]') ? 'cue' : target?.dataset.contextMenu) as ContextKind | undefined
      if (!kind || !(kind in CONTEXT_MENUS)) return
      event.preventDefault(); setMenu({ kind, x: event.clientX, y: event.clientY, alt: event.altKey })
    }
    // A pointerdown inside the menu itself is the start of a click on a
    // menu item — closing here unmounts the menu before the click fires,
    // so no menu item could ever be clicked (found by the Ungroup probe,
    // 26 Nov 2026: the mouse click dispatched nothing, while a DOM
    // .click() with no pointerdown dispatched 'ungroup'). Only a
    // pointerdown outside the menu dismisses it.
    // A pointerdown inside the menu itself is the start of a click on a
    // menu item — closing here unmounts the menu before the click fires,
    // so no menu item could ever be clicked (found by the Ungroup probe,
    // 26 Nov 2026: the mouse click dispatched nothing, while a DOM
    // .click() with no pointerdown dispatched 'ungroup'). Only a
    // pointerdown outside the menu dismisses it.
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    window.addEventListener('contextmenu', open); window.addEventListener('pointerdown', close)
    return () => { window.removeEventListener('contextmenu', open); window.removeEventListener('pointerdown', close) }
  }, [])
  if (!menu) return null
  // The fixture menu shows Group or Ungroup by selection (LightKey
  // Guide p.64 shows them as alternatives): all selected fixtures in
  // groups → Ungroup only; none in groups → Group only; a mix → both.
  const commands = menu.kind === 'fixture'
    ? CONTEXT_MENUS.fixture.flatMap((command) => command === 'group' ? fixtureGroupMenuCommands(fixtureGroups, selectedFixtureIds) : [command])
    : CONTEXT_MENUS[menu.kind]
  const labelFor = (command: AppMenuCommand): string => {
    // Holding Option turns Add Overrides into "Add Overrides for
    // Selected Fixtures" (Guide ch.11, p.202).
    if (command === 'addOverrides' && menu.alt) return 'Add Overrides for Selected Fixtures'
    return MENU_LABELS[command] ?? SHORTCUTS.find((item) => item.command === command)?.label ?? command
  }
  return <div ref={menuRef} role="menu" aria-label={`${menu.kind} actions`} className="fixed z-[300] min-w-36 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: pos.left, top: pos.top }}>
    {commands.map((command) => {
      const binding = SHORTCUTS.find((item) => item.command === command)
      return <button key={command} role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => {
        // Commands with no keyboard binding (Add Overrides, Edit Ad Hoc
        // Properties) go through the menu-command event instead — there
        // is no key to synthesize.
        if (binding) window.dispatchEvent(new KeyboardEvent('keydown', { key: binding.code, ctrlKey: binding.ctrl, shiftKey: binding.shift, altKey: binding.alt }))
        else window.dispatchEvent(new CustomEvent('openlights-menu-command', { detail: { command, selectedOnly: menu.alt } }))
        setMenu(null)
      }}>{labelFor(command)}{binding && <span className="float-right ml-4 text-dim">{binding.key}</span>}</button>
    })}
  </div>
}
